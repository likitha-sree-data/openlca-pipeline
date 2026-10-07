# openLCA extraction pipeline

Turns an openLCA database into flat, per-unit LCIA tables (CSV plus JSON)
with the dataset's own metadata: one value per process, per impact
category, for exactly **1 reference unit** of the process (1 kg, 1 MJ,
1 t*km ...), with that unit written on every row.

Target database: Environmental Footprint (EF) 3.1. Until a complete EF 3.1
export is available, development uses ELCD 3.2 as a stand-in.

## Status (October 2026)

| Item | State |
|---|---|
| Extractor (`extract_ef.py`) | Rewritten. Config driven, resumable, logs failures. Tested end to end on a synthetic database (`tests/smoke_test.sh`). |
| Headless openLCA (no GUI) | Working: restore `.zolca`, import ILCD, run the IPC server (`olca.sh`). Tested with openLCA 2.6.2 libraries. |
| ELCD 3.2 numbers | **Not yet regenerated** with the new extractor. The old pilot CSV is kept in `archive/` for reference only. |
| Linking rule | **Confirmed on ELCD (2026-10-07): `ONLY_DEFAULTS`.** Every other option adds an unrelated "Container glass" dataset and inflates results, see `ab_results.md`. |
| EF 3.1 | **Blocked.** The shared export has only `contacts`, `external_docs`, `lciamethods`, `sources`. It has no `processes`, `flows`, `flowproperties`, `unitgroups`, so nothing can be calculated, and the LCIA method cannot be imported either because its factors point to the missing flow files. |

## Quick start

```bash
./setup.sh                                  # Java 21 + openLCA libraries + Python client
./olca.sh restore ~/elcd_3_2.zolca elcd     # or: ./olca.sh import-ilcd ef31.zip ef31
./olca.sh server elcd                       # IPC server on port 8080, in the background
python3 list_records.py ImpactMethod        # find the exact method name
python3 ab_test.py --method "EF 3.0 Method (adapted)" 83d4634c-b70f-4bb3-8552-1cca6f6359b4
python3 extract_ef.py config/elcd_pilot.json
./olca.sh stop
```

`./tests/smoke_test.sh` checks the whole chain without any real data.

The openLCA desktop app is optional (`./setup.sh --gui`). It is only
needed to compare single values against the GUI. `olca.sh` uses the same
data folder as the desktop app (`~/openLCA-data-1.4`), so databases are
shared, but a database can be open in only one program at a time.

## Files

| File | Purpose |
|---|---|
| `extract_ef.py` | The pipeline. `python3 extract_ef.py <config.json>` |
| `config/*.json` | Which database label, method, linking, processes and output folder to use |
| `ab_test.py` | Compares linking options for the same process and shows top contributors |
| `check_ilcd.py` | Says whether an ILCD export is complete before importing it |
| `sanity_report.py` | One line per process (value, per kWh, share, linked processes) for plausibility checks |
| `list_records.py` | Lists methods/processes with location and category, to pick UUIDs safely |
| `olca.sh`, `tools/` | Headless openLCA: restore, import, counts, server start/stop |
| `setup.sh` | One-command setup (also run automatically for a new Codespace) |
| `geography_names.csv` | Location code to full name (ISO 3166 countries plus ILCD/EF regions) |
| `tests/` | Synthetic database and smoke test |

## Calculation

For every selected process the extractor:

1. reads the process and its quantitative reference exchange (flow, unit, amount),
2. builds a temporary product system with the configured provider linking,
3. calculates for `amount = 1` with the reference **unit set explicitly**,
4. stores all impact categories, then deletes the temporary product system.

What was verified directly on the openLCA 2.6.2 engine (synthetic data):

- Calculating a process "directly" is **not** a bare calculation: openLCA
  links providers on the fly (seen on the synthetic database; on the ELCD
  database the direct process target returned an error instead). So the
  old claim "bare processes miss upstream, you must use product systems"
  was wrong. The difference that matters is the **provider linking**
  setting. The extractor always builds an explicit product system.
- With `ONLY_DEFAULTS` and no default providers, only the process itself
  is calculated. Other linking options pull in any process that produces
  the dataset's product inputs.
- Setting the unit explicitly works: 1 kWh is converted to 3.6 MJ demand.

Why linking matters: ELCD and EF datasets are mostly aggregated
"LCI result" datasets, which already contain their whole supply chain.
Their only product inputs and outputs are bookkeeping flows (radioactive
waste, tailings, secondary fuel) whose default providers are empty
`Dummy_` processes.

**A/B test on ELCD 3.2 (`ab_results.md`), Climate change:**

| Dataset | `ONLY_DEFAULTS` (dataset itself) | Any other linking (old pilot) | Added by "Container glass (delivered to the end user)" |
|---|---|---|---|
| Electricity grid mix, EU-27, per MJ | 0.1328 (0.478 per kWh) | 0.9166 | 0.784 |
| Electricity grid mix, Italy, per MJ | 0.1515 (0.545 per kWh) | 1.1251 | 0.974 |
| Electricity grid mix, Cyprus, per MJ | 0.2523 (0.908 per kWh) | 0.3278 | 0.0755 |
| Aluminium sheet, Europe, per kg | 3.286 | 12.157 | 8.87 |

With `PREFER_DEFAULTS` or `IGNORE_DEFAULTS` openLCA links an unrelated
dataset, "Container glass (delivered to the end user)", into every one of
these systems and it dominates the result. With `ONLY_DEFAULTS` only the
dataset and its empty dummies are linked, and the dataset itself is 100%
of the result. The old pilot values (and the GUI value it matched) were
the contaminated ones. The pipeline now uses `ONLY_DEFAULTS`.

Every impact row carries `reference_process_share`: the share of the
value that comes from the process itself. For an aggregated dataset it
should be 1. Anything clearly below 1 means linked providers were added.

### Findings from the ELCD sanity check (2026-10-07)

- **Negative reference amounts (waste treatment).** GaBi/ILCD waste
  datasets store their reference as a negative output, for example
  "-1 kg of waste incineration of plastics". Requesting +1 of it ran the
  dataset backwards: the inventory showed plastic incineration *emitting*
  -1.02 kg CO2. The extractor now requests -1 in that case, so values are
  per 1 kg of waste treated, with the physical sign. `functional_unit`
  says this in words on every row. Covered by `tests/smoke_test.sh`.
- **Recycling credits.** The ELCD steel and aluminium datasets "include the
  burden and credit associated with recycling" (end-of-life recycling rate
  80% steel, 78% aluminium, per their own documentation). That is why
  hot rolled coil is 0.96 and aluminium sheet 3.29 kg CO2 eq per kg, below
  typical primary production values. Not a bug, but users must not add a
  second recycling credit. `mentions_recycling_credit` flags datasets whose
  documentation mentions credits (keyword match, read the text to confirm).
- **Transport.** ELCD has two variants of the same lorry dataset: one per kg
  of cargo with a hidden distance parameter, one per t*km (0.0667 kg CO2 eq
  per t*km). Use the t*km variants. Dataset parameters are now exported in
  `parameters`.
- **Fuels** at refinery are cradle to gate (production only, no combustion):
  diesel 0.43 to 0.51 kg CO2 eq per kg. Burning it adds about 3.2 kg CO2 per kg.

## Outputs (in `output_dir`)

| File | Content |
|---|---|
| `impacts.csv` | One row per process x impact category (long format) |
| `process_metadata.csv` | One row per process with all descriptive fields, join on `process_id` |
| `impact_categories.csv` | Method name, version, description and every impact category with unit and description |
| `exchange_uncertainty.csv` | Uncertainty distributions of the dataset's exchanges, where the dataset has them |
| `processes.json` | Everything above in one nested file, values at full precision |
| `processes.jsonl`, `failures.jsonl` | Working files: one line per finished or failed process (the resume state) |
| `run_summary.json` | Counts of processes succeeded and failed, failed IDs |
| `run.log` | Progress log |

### `impacts.csv` columns

| Column | Meaning |
|---|---|
| `process_id` | Original dataset UUID from the source database (stable, not generated here) |
| `process_name` | Dataset name |
| `geography`, `location_code` | Full location name and its code (for example `Italy`, `IT`) |
| `ref_amount`, `ref_unit` | Always `1` of `ref_unit`: the value is per 1 MJ, 1 kg, ... |
| `functional_unit` | The same in words, for example `1 t*km of transport in t*km` or `treatment of 1 kg (...)` |
| `ref_flow_name`, `ref_flow_property` | The reference product and the quantity it is measured in |
| `impact_category`, `impact_value`, `impact_unit` | The result |
| `method_name`, `method_version`, `database` | Where the number comes from |
| `reference_process_share` | Diagnostic, see "Calculation" |
| `impact_category_id` | Join key to `impact_categories.csv` |

No openLCA-generated IDs are exported. Product systems are temporary and
deleted after each calculation.

### `process_metadata.csv` highlights

Dataset version and last change, process type, category path, reference
flow and the dataset's own reference amount (`dataset_ref_amount`, for
example 3.6 MJ), validity dates, **citation** (from the publication Source
record) and all cited **sources**, data generator, documentor and owner,
reviews, copyright flag, restrictions text, data quality system and entry,
uncertainty summary, and every documentation text field: technology, time,
geography, intended application, inventory method (system boundary and
modelling approach), modelling constants, data selection, data treatment,
data collection, completeness, sampling, project, use advice.

Any field the dataset does not fill is written as `not provided`, never
left out silently. `geography_source` says whether the full name came
from the database or from `geography_names.csv` (ILCD imports carry only
codes).

## Number format

- CSV values have **6 significant figures**, a **dot** as decimal separator
  and may use scientific notation (`1.62e-09`). Example: `1.12513`.
- `processes.json` keeps full precision.
- Spreadsheets set to Spanish or Catalan regional settings read the dot as
  a thousands separator. Import the CSV with "decimal separator = ." (or
  ask for a comma-decimal copy). This is the most likely cause of the
  "1125 Gt" reading of the first pilot, where the value was 1.125.

## Validation: what is and is not proven

- **Reproduction:** in the first pilot, the script's value for the EU-27
  electricity product system (0.9166090099874854 per 1 MJ) times 3.6 equals
  the GUI's value for 3.6 MJ (3.2997924359549473 kg CO2 eq) exactly. That
  shows the script reproduces openLCA's own calculation. It does not show
  the number is right: the GUI used the same linking.
- **Explained:** the implausible pilot values (EU-27 electricity 3.30 kg
  CO2 eq per kWh) came from wrong provider linking, see the A/B table.
  With `ONLY_DEFAULTS` the three electricity mixes are 0.48 (EU-27), 0.55
  (Italy) and 0.91 (Cyprus) kg CO2 eq per kWh, in line with typical
  published grid factors for the 2008 to 2015 period.
- **Still open:** aluminium sheet at 3.29 kg CO2 eq per kg looks low for
  primary aluminium; the dataset includes recycling, which may explain it.
  To check in the dataset documentation. Also still to do: a 10+ process
  sanity check (`sanity_report.py`) and 1 or 2 GUI matches with
  `ONLY_DEFAULTS` linking. Until then, do not call the pipeline validated.

## Database and method notes

- ELCD 3.2: `elcd_3_2_greendelta_v2_18_correction_20220908.zolca`, free on
  openLCA Nexus. Process data is mostly 2008 to 2015.
- Method used for ELCD: `EF 3.0 Method (adapted)`, id
  `b4571628-4b7b-3e4f-81b1-9a8cca6cb3f8`. It came **bundled inside the ELCD
  zolca** (category `openLCA LCIA methods 2_1_3`). The separate openLCA LCIA
  Methods 2.8.2 package was downloaded but never imported.
- EF 3.1: will use the EF 3.1 LCIA method from the export itself, once the
  export is complete.

## Licensing caveat

The output copies documentation text from the source datasets. ELCD
process records are flagged copyright protected and carry GaBi licence
restrictions (internal use). EF 3.1 data comes with its own end-user
licence. The EF 3.1 LCIA method files allow redistribution as long as
the owner is referenced. **Check the redistribution terms with the data
owner before publishing generated tables.** Generated outputs are kept out
of this public repository (`output/` is git-ignored).

## Known limitations

- Uncertainty: only exchange-level uncertainty and data quality entries
  that exist in the dataset are passed on. No Monte Carlo is run, so there
  is no uncertainty range on the impact values themselves.
- Geography names for codes missing from `geography_names.csv` stay as
  codes and are marked `code only` in `geography_source`.
- Category paths and process type filters depend on how the database was
  imported. Check `list_records.py Process` output before a full run.
