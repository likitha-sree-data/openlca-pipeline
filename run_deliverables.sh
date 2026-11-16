#!/usr/bin/env bash
# Build both Carbbin deliverables in one go:
#   A. EF 3.1 characterization factors table (from the EF 3.1 reference package)
#   B. ELCD 3.2 datasets calculated with the real EF 3.1 method, plus a
#      coverage check that flags datasets the EF 3.1 factors do not fully reach
# and pack everything into one zip to send.
#
#   ./run_deliverables.sh
#
# Expects in this folder: EF-v3.1_2.zip, and the ELCD backup
# (elcd_3_2_greendelta_v2_18_correction_20220908.zolca) unless the "elcd"
# database already exists. Safe to run again: finished steps are skipped,
# and an interrupted calculation resumes where it stopped.
set -euo pipefail
cd "$(dirname "$0")"

EF_ZIP="${EF_ZIP:-EF-v3.1_2.zip}"
ELCD_ZOLCA="${ELCD_ZOLCA:-elcd_3_2_greendelta_v2_18_correction_20220908.zolca}"
ELCD_DB="${ELCD_DB:-elcd}"
EF_DB="${EF_DB:-elcd_ef31}"
CONFIG="${CONFIG:-config/elcd_ef31.json}"
OLD_METHOD="${OLD_METHOD:-EF 3.0 Method (adapted)}"
DATA="${OLCA_DATA:-$HOME/openLCA-data-1.4}"
OUT_DIR=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['output_dir'])" "$CONFIG")
PORT=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('ipc_port', 8080))" "$CONFIG")

step() { echo; echo "=== $*"; }
die() { echo; echo "STOPPED: $*"; exit 1; }

step "1/7 tools"
[ -d tools/lib ] || ./setup.sh
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=python3; fi
$PY -c "import olca_ipc" 2>/dev/null || die "the openLCA Python client is missing, run ./setup.sh"
[ -f "$EF_ZIP" ] || die "$EF_ZIP not found here. Upload it from Jaume's Drive link into this folder."

step "2/7 deliverable A: EF 3.1 characterization factors"
python3 -I ef_factors.py "$EF_ZIP" output/ef31_factors > output_ef31_summary.tmp
cat output_ef31_summary.tmp; rm -f output_ef31_summary.tmp

step "3/7 ELCD database"
./olca.sh stop > /dev/null
if [ ! -d "$DATA/databases/$ELCD_DB" ]; then
  [ -f "$ELCD_ZOLCA" ] || die "no $ELCD_DB database and no $ELCD_ZOLCA here. Upload the ELCD backup into this folder."
  ./olca.sh restore "$ELCD_ZOLCA" "$ELCD_DB" 2>&1 | grep -E "restored|Exception|not found" || true
fi
[ -d "$DATA/databases/$ELCD_DB" ] || die "restoring $ELCD_DB failed"
echo "ok: $ELCD_DB"

step "4/7 copy of ELCD with the EF 3.1 method (original stays untouched)"
if [ ! -d "$DATA/databases/$EF_DB" ]; then
  ./olca.sh copy "$ELCD_DB" "$EF_DB"
  if ! ./olca.sh import-method "$EF_ZIP" "$EF_DB" 2>&1 | tee import_method.log | grep -E "RESULT|import finished|refusing"; then
    rm -rf "${DATA:?}/databases/$EF_DB"; die "the method import failed, see import_method.log"
  fi
  rm -f import_method.log
else
  echo "ok: $EF_DB already exists"
fi

step "5/7 server and coverage check"
./olca.sh server "$EF_DB" "$PORT"
$PY list_records.py ImpactMethod | sed 's/^/  /'
if [ ! -f "$OUT_DIR/coverage.csv" ]; then
  $PY coverage_check.py "$CONFIG" --old-method "$OLD_METHOD" | tail -5
else
  echo "ok: coverage already checked ($OUT_DIR/coverage.csv)"
fi

step "6/7 calculate all ELCD datasets with EF 3.1 (resumes if interrupted)"
$PY extract_ef.py "$CONFIG" 2>&1 | grep -E "selected|done \(|export:|FAILED|STOPPED|Error|error" || true
$PY sanity_report.py "$OUT_DIR" "Climate change - 2021" > "$OUT_DIR/sanity_climate_change.txt" 2>&1 \
  || $PY sanity_report.py "$OUT_DIR" > "$OUT_DIR/sanity_climate_change.txt" 2>&1 || true
./olca.sh stop > /dev/null

step "7/7 package for Carbbin"
STAMP=$(date +%Y-%m-%d)
PKG="output/carbbin_delivery_$STAMP.zip"
rm -f "$PKG"
python3 - "$PKG" "$OUT_DIR" << 'PY'
import os, sys, zipfile
pkg, out_dir = sys.argv[1], sys.argv[2]
keep = {
    "ef31_characterization_factors/": "output/ef31_factors",
    "elcd_with_ef31/": out_dir,
}
skip = {"processes.jsonl", "failures.jsonl", "run.log"}
with zipfile.ZipFile(pkg, "w", zipfile.ZIP_DEFLATED) as z:
    for prefix, folder in keep.items():
        for name in sorted(os.listdir(folder)):
            if name not in skip and os.path.isfile(os.path.join(folder, name)):
                z.write(os.path.join(folder, name), prefix + name)
    z.write("README.md", "README.md")
print(f"{pkg}: {os.path.getsize(pkg) / 1e6:.1f} MB")
PY

echo
echo "DONE. Results:"
python3 - "$OUT_DIR" << 'PY'
import csv, json, os, sys
out = sys.argv[1]
s = json.load(open(os.path.join(out, "run_summary.json")))
print(f"  ELCD datasets calculated with EF 3.1: {s['succeeded']} succeeded, {s['failed']} failed")
cov = os.path.join(out, "coverage.csv")
if os.path.exists(cov):
    rows = list(csv.DictReader(open(cov, encoding="utf-8")))
    bad = [r for r in rows if r["lost_share"] and abs(float(r["lost_share"])) > 0.05]
    print(f"  coverage: {len(rows)} checked, {len(bad)} lose more than 5% of Climate change (see coverage.csv)")
f = json.load(open("output/ef31_factors/summary.json"))
print(f"  EF 3.1 factors: {f['characterization_factors']} factors in {f['impact_categories']} impact categories")
PY
echo "  Send to Claude for review: output/ef31_factors/summary.json, $OUT_DIR/coverage.csv,"
echo "  $OUT_DIR/sanity_climate_change.txt"
