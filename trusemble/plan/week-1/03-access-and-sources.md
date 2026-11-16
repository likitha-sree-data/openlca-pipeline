# Access and real data samples

Nothing gets built until you have looked at the real thing. This file lists what to ask for and what to check.

## A. Access to ask for on Monday

| What | Who to ask | Why | Sent | Received |
|---|---|---|---|---|
| Admin login to the current operations app | Adam Wolfe | See every screen, not just screenshots | | |
| The live public site (trusemble.com) and its code | Adam Wolfe | Copy what works, skip what doesn't | | |
| Where the current data lives and a copy of it | Adam Wolfe | Do not start from zero | | |
| The spreadsheet of follow-ups (fups.xlsx) | Mike Duwe | The real pipeline | | |
| Hosting account (where it runs today) | Adam Wolfe | Decide whether to stay or move | | |
| Domain and email accounts | Adam Wolfe | Needed for alerts to the team | | |
| Maps account or tile provider details | Adam Wolfe | Maps need a provider | | |
| Written rules on what is public and what is private | Team | Everything depends on this | | |

## B. The data sources to look at

For each one: open it, look at 20 rows with your own eyes, and write one line on what looked wrong or surprising.

| Source | What we want from it | Where | Sample pulled | Looked wrong or surprising |
|---|---|---|---|---|
| USAspending federal grants | Who got federal wildfire money, how much, where | usaspending.gov (search by program numbers 10.720, 97.047, 97.039, 10.912, 10.664) | | |
| OpenFEMA mitigation applications | Projects asking FEMA for money, and what was approved | fema.gov/about/openfema | | |
| FEMA National Risk Index | Wildfire risk for each county | hazards.fema.gov/nri | | |
| Grants.gov | Programs that are open or coming soon | grants.gov | | |
| Census county outlines | Where each county is | census.gov, TIGERweb | | |
| NFPA Firewise sites | Which communities are recognized | nfpa.org Firewise map | | |
| US Forest Service fuels treatment data | Federal projects on the ground | data.fs.usda.gov | | |
| Oregon Department of Forestry fuels data | Oregon treatments | oregon.gov/odf | | |
| Oregon Department of Forestry Small Forestland Grant awards | Who was funded in 2026 and who was not | oregon.gov/odf (summary of awards) | | |
| Oregon State Fire Marshal grant lists | Awards by organization | oregon.gov/osfm | | |

## C. What to write about each sample
- How many rows? Does it have a date? A county? A dollar amount?
- Is the organization name clean, or does it need cleaning (all capitals, misspellings, "Inc" versus "Incorporated")?
- Does it say where in the county? Or only the state?
- How often does the source update?
- Is there any rule about reuse?
- **What would break if this source went away?**

## D. A rule of thumb
If a source needs more than half a day of cleanup to be useful, flag it. Cheap, clean sources go first.
