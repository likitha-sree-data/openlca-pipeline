"""Print one line per process for a quick plausibility check.

    .venv/bin/python sanity_report.py output/elcd_pilot [impact category]

Shows the value per 1 reference unit, a per-kWh conversion for electricity
given in MJ, the share from the dataset itself and how many processes were
linked. Lines marked CHECK have a reference process share below 0.99,
meaning something was added on top of the dataset.
"""
import json
import os
import sys

if len(sys.argv) < 2:
    sys.exit(__doc__)
out_dir = sys.argv[1]
category = sys.argv[2] if len(sys.argv) > 2 else "Climate change"

recs = {}
with open(os.path.join(out_dir, "processes.jsonl"), encoding="utf-8") as f:
    for line in f:
        if line.strip():
            r = json.loads(line)
            recs[r["process_id"]] = r

print(f"{category}, per 1 reference unit ({len(recs)} processes)")
print(f"{'process':<55} {'loc':<8} {'value':>11} {'unit':<14} {'per kWh':>8} {'share':>6} {'linked':>6}")
for r in sorted(recs.values(), key=lambda r: r["metadata"]["process_name"]):
    m = r["metadata"]
    iv = next((i for i in r["impacts"] if i["impact_category"] == category), None)
    if iv is None:
        print(f"{m['process_name'][:55]:<55} category not found")
        continue
    unit = f"{iv['impact_unit']}/{m['ref_unit']}"
    kwh = f"{iv['impact_value'] * 3.6:.3g}" if m["ref_unit"] == "MJ" else ""
    share = iv["reference_process_share"]
    flag = "" if share is None or share >= 0.99 else "  CHECK"
    print(f"{m['process_name'][:55]:<55} {m['location_code'][:8]:<8} {iv['impact_value']:>11.4g} {unit[:14]:<14} "
          f"{kwh:>8} {share if share is None else round(share, 3)!s:>6} {r['calculation']['linked_processes']:>6}{flag}")

fail = os.path.join(out_dir, "failures.jsonl")
if os.path.exists(fail):
    n = sum(1 for line in open(fail, encoding="utf-8") if line.strip())
    print(f"\nfailures logged: {n} (see {fail})")
