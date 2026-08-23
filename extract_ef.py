import csv
import olca_ipc as ipc
import olca_schema as o

client = ipc.Client(8080)

METHOD_ID = "b4571628-4b7b-3e4f-81b1-9a8cca6cb3f8"  # EF 3.0 Method (adapted)

PRODUCT_SYSTEMS = {
    "Electricity grid mix 1kV-60kV": "adb2b79a-23e8-4ca9-b5df-8efb1842d416",
    "Aluminium sheet, primary production": "988cf6cf-c19c-4dff-a601-27b50817efaa",
    "Steel hot rolled coil, blast furnace route": "29cece35-e9f8-4c5e-8ea6-908f509a651f",
    "Continuous filament glass fibre": "e5258585-ee02-48db-8d9d-014b7fdee87d",
    "Lorry transport, 22t total weight": "1bc49838-e965-48a8-9409-07cb2572c436",
}

rows = []

for name, sid in PRODUCT_SYSTEMS.items():
    print(f"Processing: {name}")

    # Pull real metadata from the linked process, not a hardcoded guess,
    # so geography always matches whichever process this system was
    # actually built from.
    system = client.get(o.ProductSystem, uid=sid)
    ref_process_stub = system.ref_process
    process_id = ref_process_stub.id
    geography = ref_process_stub.location or "unspecified"

    full_process = client.get(o.Process, uid=process_id)
    doc = full_process.process_documentation
    valid_from = doc.valid_from if doc else None
    valid_until = doc.valid_until if doc else None
    source = doc.publication.name if (doc and doc.publication) else "ELCD 3.2"

    setup = o.CalculationSetup(
        target=o.Ref(ref_type=o.RefType.ProductSystem, id=sid),
        impact_method=o.Ref(ref_type=o.RefType.ImpactMethod, id=METHOD_ID),
        amount=1.0,
    )
    result = client.calculate(setup)
    result.wait_until_ready()

    impacts = result.get_total_impacts()
    for i in impacts:
        rows.append({
            "process_name": name,
            "process_id": process_id,
            "product_system_id": sid,
            "geography": geography,
            "ref_amount": 1,
            "impact_category": i.impact_category.name,
            "impact_value": i.amount,
            "impact_unit": i.impact_category.ref_unit,
            "database": "ELCD 3.2",
            "source": source,
            "valid_from": valid_from,
            "valid_until": valid_until,
            "method": "EF 3.0 Method (adapted)",
        })

    result.dispose()
    print(f"  {len(impacts)} impact categories, geography={geography}")

with open("ef31_pilot.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"\nDone. Wrote {len(rows)} rows to ef31_pilot.csv")
