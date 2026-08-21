import csv
import olca_ipc as ipc
import olca_schema as o

client = ipc.Client(8080)

METHOD_ID = "b4571628-4b7b-3e4f-81b1-9a8cca6cb3f8"  # EF 3.0 Method (adapted)

PRODUCT_SYSTEMS = {
    "Electricity grid mix 1kV-60kV, EU-27": "ec89a1ec-333b-4809-badd-c60189ce7f7e",
    "Aluminium sheet, primary production": "25aadff9-1289-498a-b975-9e1bbd10662a",
    "Steel hot rolled coil, blast furnace route": "9292fbdc-c04e-4e94-8e87-f88d36b24019",
    "Continuous filament glass fibre": "4350ec24-f638-4ced-aad5-e489d082931d",
    "Lorry transport, 22t total weight": "27c63efa-7bd2-4596-86a5-4219e963dd6f",
}

rows = []

for name, sid in PRODUCT_SYSTEMS.items():
    print(f"Calculating: {name}")
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
            "product_system_id": sid,
            "ref_amount": 1,
            "impact_category": i.impact_category.name,
            "impact_value": i.amount,
            "impact_unit": i.impact_category.ref_unit,
            "database": "ELCD 3.2",
            "method": "EF 3.0 Method (adapted)",
        })

    result.dispose()
    print(f"  {len(impacts)} impact categories")

with open("ef31_pilot.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f"\nDone. Wrote {len(rows)} rows to ef31_pilot.csv")
