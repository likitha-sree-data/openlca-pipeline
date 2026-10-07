#!/usr/bin/env bash
# End-to-end check of the EF method path without real data:
#   1. ef_factors.py reads an EF-shaped ILCD package correctly
#   2. ./olca.sh import-method attaches the factors to existing substances
#   3. extract_ef.py calculates with the imported method
#   4. coverage_check.py reports 0% lost when IDs match, ~100% when they don't
# Needs ./setup.sh first. Uses a throwaway data folder and port 8098.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-$( [ -x .venv/bin/python ] && echo .venv/bin/python || echo python3 )}"
TMP=$(mktemp -d); export OLCA_DATA="$TMP/data"; PORT=8098
cleanup() { pkill -f "org.openlca.ipc.Server.*-data $OLCA_DATA" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
fail() { echo "FAIL $1"; exit 1; }

python3 tests/make_ilcd_fixture.py "$TMP/ef.zip" > /dev/null
python3 -I ef_factors.py "$TMP/ef.zip" "$TMP/cf" > /dev/null
grep -q '^Climate change,.*,f-ch4,methane (fossil),.*,29.8,kg CO2-Equivalents per kg,' "$TMP/cf/characterization_factors.csv" \
  && echo "PASS factors table has methane 29.8 kg CO2 eq per kg" || fail "factors table"
grep -q '29,8' "$TMP/cf/characterization_factors_excel_comma_decimal.csv" && echo "PASS comma-decimal factors" || fail "comma factors"

# a database with the synthetic processes and the old test method
mkdir -p "$OLCA_DATA/databases"
java -cp "tools/lib/*" org.openlca.ipc.Server -data "$OLCA_DATA" -db base -port $PORT > "$TMP/s0.log" 2>&1 &
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT" && break; sleep 1; done
sed "s/ipc.Client(8080)/ipc.Client($PORT)/" tests/build_test_db.py > "$TMP/build.py"
$PY "$TMP/build.py" > /dev/null
pkill -f "org.openlca.ipc.Server.*-data $OLCA_DATA"; sleep 3

./olca.sh copy base withef > /dev/null
OUT=$(./olca.sh import-method "$TMP/ef.zip" withef 2>&1)
[[ "$OUT" == *"0 errors"* ]] && echo "PASS method import, 0 errors" || fail "import"
./olca.sh server withef $PORT > /dev/null

python3 - "$TMP" "$PORT" << 'PY'
import json, sys
tmp, port = sys.argv[1], int(sys.argv[2])
c = json.load(open("config/test_synthetic.json"))
c.update(ipc_port=port, method_name="Environmental Footprint", output_dir=f"{tmp}/out")
c["processes"] = {"ids": ["p-elec"]}
json.dump(c, open(f"{tmp}/cfg.json", "w"))
PY
$PY extract_ef.py "$TMP/cfg.json" > /dev/null 2>&1
grep -q 'Climate change - 2021,0.277778' "$TMP/out/impacts.csv" && echo "PASS extraction with imported EF method" || fail "extraction"
OUT=$($PY coverage_check.py "$TMP/cfg.json" --old-method "Test EF method")
[[ "$OUT" == *"0 lose more than 5%"* ]] && echo "PASS coverage 0% lost when IDs match" || fail "coverage match"
pkill -f "org.openlca.ipc.Server.*-data $OLCA_DATA"; sleep 3

# same package with the CO2 ID changed: must be flagged
python3 - "$TMP" << 'PY'
import sys, zipfile
tmp = sys.argv[1]
src = zipfile.ZipFile(f"{tmp}/ef.zip")
with zipfile.ZipFile(f"{tmp}/bad.zip", "w") as z:
    for n in src.namelist():
        d = src.read(n).decode().replace("f-co2<", "f-co2-x<").replace('"f-co2"', '"f-co2-x"').replace("f-co2.xml", "f-co2-x.xml")
        z.writestr(n.replace("f-co2.xml", "f-co2-x.xml"), d)
PY
./olca.sh copy base badef > /dev/null
./olca.sh import-method "$TMP/bad.zip" badef > /dev/null 2>&1
./olca.sh server badef $PORT > /dev/null
OUT=$($PY coverage_check.py "$TMP/cfg.json" --old-method "Test EF method")
[[ "$OUT" == *"1 lose more than 5%"* ]] && echo "PASS coverage flags unmatched substances" || fail "coverage mismatch"
