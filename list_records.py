"""List records in the open database, so UUIDs are picked by eye, not guessed.

    python3 list_records.py ImpactMethod
    python3 list_records.py Process "grid mix"          (name filter, case-insensitive)
    python3 list_records.py Process "grid mix" EU-27    (and location code filter)

Always shows location and category, because many datasets share a name and
differ only by country (picking the first name match once silently gave a
Cyprus process instead of EU-27).
"""
import sys

import olca_ipc as ipc
import olca_schema as o

if len(sys.argv) < 2:
    sys.exit(__doc__)
model = getattr(o, sys.argv[1])
name_filter = sys.argv[2].lower() if len(sys.argv) > 2 else ""
loc_filter = sys.argv[3] if len(sys.argv) > 3 else ""

rows = [d for d in ipc.Client(8080).get_descriptors(model)
        if name_filter in (d.name or "").lower() and (not loc_filter or d.location == loc_filter)]
for d in sorted(rows, key=lambda d: (d.category or "", d.name or "", d.location or "")):
    ptype = d.process_type.value if d.process_type else ""
    print(f"{d.id}  {d.location or '':<8} {ptype:<12} {d.name}   [{d.category or ''}]")
print(f"{len(rows)} records")
