"""Print the main documentation texts of extracted processes (no server needed).

    .venv/bin/python show_docs.py output/elcd_pilot "Steel" "Aluminium"
"""
import json
import os
import sys

out_dir, filters = sys.argv[1], [f.lower() for f in sys.argv[2:]]
FIELDS = ["description", "technology_description", "inventory_method_description",
          "modeling_constants_description", "data_selection_description"]
with open(os.path.join(out_dir, "processes.jsonl"), encoding="utf-8") as f:
    for line in f:
        if not line.strip():
            continue
        m = json.loads(line)["metadata"]
        if filters and not any(x in m["process_name"].lower() for x in filters):
            continue
        print(f"\n## {m['process_name']} [{m['location_code']}]")
        for k in FIELDS:
            v = m.get(k) or ""
            if v and v != "not provided":
                print(f"- {k}: {' '.join(v.split())[:700]}")
