#!/usr/bin/env bash
# End-to-end check without any real data: start a headless server on a
# throwaway database, fill it with tests/build_test_db.py, run the extractor
# and compare against hand-calculated values. Needs ./setup.sh first.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d); PORT=8099
trap 'kill $PID 2>/dev/null || true; rm -rf "$TMP"' EXIT
java -cp "tools/lib/*" org.openlca.ipc.Server -data "$TMP" -db smoke -port $PORT > "$TMP/server.log" 2>&1 &
PID=$!
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT" && break; sleep 1; done

sed "s/ipc.Client(8080)/ipc.Client($PORT)/" tests/build_test_db.py > "$TMP/build.py"
python3 "$TMP/build.py"
python3 - "$TMP" "$PORT" << 'PY'
import json, sys, csv
tmp, port = sys.argv[1], int(sys.argv[2])
cfg = json.load(open("config/test_synthetic.json"))
cfg.update(ipc_port=port, output_dir=f"{tmp}/out")
json.dump(cfg, open(f"{tmp}/cfg.json", "w"))
PY
python3 extract_ef.py "$TMP/cfg.json" > "$TMP/run.txt" 2>&1
python3 - "$TMP" << 'PY'
import csv, sys
tmp = sys.argv[1]
allrows = list(csv.DictReader(open(f"{tmp}/out/impacts.csv")))
rows = [r for r in allrows if r["process_id"] == "p-elec"]
waste = [r for r in allrows if r["process_id"] == "p-waste"]
meta = [m for m in csv.DictReader(open(f"{tmp}/out/process_metadata.csv")) if m["process_id"] == "p-elec"]
checks = {
    "one impact row": len(rows) == 1,
    "value per 1 MJ, no double counting": rows[0]["impact_value"] == "0.277778",
    "ref unit present": rows[0]["ref_unit"] == "MJ",
    "full geography": rows[0]["geography"] == "Europe (EU-27)",
    "reference process share 1": rows[0]["reference_process_share"] == "1",
    "citation": meta[0]["citation"].startswith("Doe, J. (2010)"),
    "uncertainty counted": meta[0]["exchanges_with_uncertainty"] == "1",
    "negative-reference waste dataset has positive sign": waste and waste[0]["impact_value"] == "2",
    "functional unit text": rows[0]["functional_unit"] == "1 MJ of Electricity",
}
for k, ok in checks.items():
    print(("PASS " if ok else "FAIL ") + k)
sys.exit(0 if all(checks.values()) else 1)
PY
