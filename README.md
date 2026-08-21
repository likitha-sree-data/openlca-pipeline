# openLCA Extraction Pipeline (Pilot)

## What this does
Connects to a running openLCA IPC server, calculates life cycle impact
results for a fixed reference amount (1 unit) per process, and exports
the results as a flat CSV: one row per process x impact category.

## Database used
ELCD 3.2 (GreenDelta correction release, 2022-09-08), free database via
openLCA Nexus. Used as a stand-in for EF 3.1 while free/individual
access to the official EF 3.1 database is confirmed with GreenDelta.
Swapping to EF 3.1 later only requires updating the process/product
system UUIDs and method ID in extract_ef.py, no other code changes.

## Method used
EF 3.0 Method (adapted), from the openLCA LCIA Methods v2.8.2 package
(also free via Nexus). Chosen as the closest available EF-family method
bundled for free with this database.

## Key technical finding: product systems, not bare processes
Calculating directly against a process UUID only returns that process's
own direct flows. It does not resolve linked upstream processes (in
ELCD, these show as "Dummy_" providers on inputs/outputs). To get a
complete result matching openLCA's own "Direct calculation" button, you
must first build a Product System from the process (File > right-click
process > Create product system, with Auto-link processes enabled),
then calculate against that Product System's UUID instead.

## Normalization
All results are calculated for amount = 1 of the process's own declared
reference unit (e.g. 1 MJ for electricity, not 1 kWh or an arbitrary
batch size). This matches the project's core requirement: one row per
process should represent exactly one physical reference unit.

## Validation
Electricity grid mix 1kV-60kV, EU-27, Climate change - Fossil:
  - openLCA GUI (Direct calculation, EF 3.0 Method (adapted)): 3.2997924359549473 kg CO2 eq
  - Pipeline output (product system, amount=1): 0.9166090099874854 kg CO2 eq
  - Ratio: exactly 3.6 (the process's own reference amount is 3.6 MJ = 1 kWh)
  - Confirms: pipeline correctly normalizes to 1 unit; GUI default
    calculates for the process's full declared batch size instead.

## Columns in ef31_pilot.csv
process_name, product_system_id, ref_amount, impact_category,
impact_value, impact_unit, database, method

## Known limitations
- Pilot scope: 5 representative processes, not the full database
- Using ELCD 3.2 + EF 3.0 Method (adapted) pending confirmed free
  access to official EF 3.1 database and method
- Product systems must be built manually in the GUI once per process
  before the script can calculate against them; not yet automated
