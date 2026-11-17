# TruSemble

A sourced record of US wildfire mitigation: the projects, the money that paid for them, and the high-risk places nobody has funded yet.
This repository holds two apps in one Next.js project:

| App | Where | Who |
|---|---|---|
| **Public app** | `/`, `/projects`, `/funding`, `/calculator`, `/data`, `/request-funding`, `/submit-project`, `/contact`, `/fund` | funders, communities, insurers, agencies |
| **Team tool** | `/ops/*` (sign-in required) | the TruSemble team, in five places: **Today**, **People**, **Projects and funding**, **Check data**, **Settings** |

Built from screenshots of the existing operations app and public site. See [What is and is not verified](#what-is-and-is-not-verified).

## Quick start

Needs Node 22.13 or later. With no `DATABASE_URL` set, the app uses an embedded Postgres kept in `./data/pglite`, so there is nothing else to install. Only one process can use it at a time, so stop the dev server before seeding.

```bash
npm install
cp .env.example .env.local      # then edit; see Configuration
npm run db:seed                 # operators, programs, pipeline, sources, and demo geography
npm run dev                     # http://localhost:3000
```

Sign in at `/ops/login` as `adam@example.org`, `likitha@example.org` or `mike@example.org` with the `SEED_PASSWORD` (default `trusemble-dev`, development only).
Add real operators with `npm run user:create -- "Full Name" email@example.org "a-long-password"`.

The seed marks all generated geography as **demo** (names start with "(Demo)"). The public site shows a banner while `PUBLIC_INCLUDE_DEMO=true`.
After a real ingest, run `npm run ingest -- clear-demo` and set `PUBLIC_INCLUDE_DEMO=false`.

## The team tool in plain terms

- **Today**: what needs a person now (new website requests, overdue follow-ups, records to check), where requests stand, what closes soon, and how much of the data a person has checked. The pilot goals sit one tab over.
- **People**: requests, contacts, suggested matches. Each request opens as one page built around the job: what they asked, who to reply to (with email and phone links), where it stands (one click to move it), the next step (what, who, by when), and "make the introduction", which asks who was introduced to whom so there is a real record. The list filters to Mine, Nobody yet and Overdue.
- **Projects and funding**: each project and each funding program opens as one page built around the job.
  - A **project** shows what it is, where it stands (one click to change), the money, which programs could pay for it (Choose or Not a fit), and an **On the website** checklist: it cannot be shown to the public until it has a county, a state and a description, and the page says plainly what is missing.
  - A **funding program** shows the facts, whether it is open, a "Is this still current?" box with a one-click "I looked at the program page today", the projects that could use it, and the same On the website checklist (it needs who runs it, a real link and who can apply).
  - Lists have one-click filters: Need funding, Ready to show, Hidden for projects; Open now, Always open, Closing soon, Closed, Hidden for programs. Today reminds the team when projects are ready to show or program pages have not been looked at in 90 days.
  - An **organization** shows who they are, the people we know there (one-click email and call), the projects they run, requests from them and money they received. If another group has the same name in a place that could be the same, a **May be listed twice** card offers a merge: it moves projects, people, requests and money into the group you keep, fills blanks without overwriting, archives the other and leaves a record. Same-named groups in different counties or states are never flagged.
  - A **contact** shows how to reach them, requests that involve them, who on the team knows them, and where they are on the outreach list. "They asked us to stop" marks do not contact, which hides their email and phone buttons and takes them off the outreach list.
  - Lists have one-click filters too: Funders, Communities, No website, Kind not set, May be listed twice (groups); Mine, No email or phone, No group, Do not contact (contacts).
- **Check data**: **To check** shows one record next to where it came from, with one button for "it matches". Also problems, importing a file, sources and an all-records map.
- **Settings**: alerts and the calculator's cost-per-acre figures.

Records say **Checked by a person**, **Not yet checked** or **Sample**. There is no other jargon to learn.

### Alerts and automatic upkeep

- A new website request alerts the team straight away (group and project only, never contact details). Set `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_TO` for email and/or `NOTIFY_WEBHOOK_URL` for Slack, Teams or Zapier. `/ops/settings` shows what is set up and sends a test.
- `npm run summary` sends the weekly summary (run it Monday morning). `npm run refresh` brings in fresh public data and alerts the team if a source stopped working (run it nightly). Example cron: `0 3 * * * cd /app && npm run refresh`.

## Getting real data in

Three routes, all of which create **unverified** rows with a source:

1. **Fetchers** (`npm run ingest -- <name|all|list|clear-demo> [--limit N]`): `tiger-counties`, `fema-nri`, `grants-gov`, `nfpa-firewise`, `odf-fuels`, `fs-facts`, `openfema`, `usaspending`.
   Run `--limit 50` first to try one. Each run is logged on `/ops/sources` and `/data`. Rows are keyed by `(source, external id)`, so re-running updates instead of duplicating. A row a person verified is never changed by a fetch.
   Field names for the ArcGIS layers and OpenFEMA are matched from candidate lists; if a run reports `skipped N: no site name found`, extend the list at the top of `src/lib/ingest/arcgis.ts` or `federal.ts`.
2. **Spreadsheet import** (`/ops/imports`): CSV or xlsx up to 10 MB, any layout. Match columns to fields, review every new row and change, then apply. Re-uploading the same file changes nothing. A value that disagrees with a verified record becomes an issue on `/ops/data-quality` rather than an overwrite.
3. **Public forms** (`/request-funding`, `/submit-project`, `/contact`, project "Request an introduction"): arrive in `/ops/requests` as `new`, with the person, organization and project created unpublished.

Nothing reaches the public map until an operator publishes it.

## How verification and privacy work

- Every row is `verified`, `unverified` or `demo`. Counts everywhere show that split. "Mark as checked" on a record writes a review that feeds the pilot scorecard.
- Public queries select only published, non-archived rows and never select contact details (see `src/lib/visibility.ts` and `src/lib/public-data.ts`). Contacts, requests, imports and private sources exist only behind `/ops`.
- Public forms: server-side validation (zod), honeypot, minimum fill time, and a per-caller hourly rate limit keyed on a salted hash of the address.
- Operator sessions are HMAC-signed, httpOnly cookies (12 h). Passwords are scrypt hashes. Login is rate limited. `SESSION_SECRET` is required in production.

## The pilot scorecard

`/ops/pilot` computes progress from what is logged, never typed in: sources fetched, new records, reviews, briefs, validation asks, and the people on the outreach list with their dated steps. Demo rows do not count. Targets and lanes are in `src/lib/pilot.ts`; the pilot window is the single row in the `pilot` table.

## Project map

```
src/app/(public)/      public pages          src/app/ops/(app)/   operator pages
src/app/api/           public + operator APIs  src/app/ops/actions.ts  every operator mutation
src/lib/entities.ts    field specs that drive forms, lists and validation for five record types
src/lib/crud.ts        generic insert/update/list/verify    src/lib/public-data.ts  public queries
src/lib/import/        parse, plan (dry run), apply          src/lib/ingest/         fetchers
src/lib/matches.ts     program suggestions                   src/lib/calculator.ts   defensible-space estimate
scripts/               seed, ingest, create-user, smoke, e2e
```

## Checks

```bash
npm run typecheck
npm test                                        # 95 unit tests: calculator, imports, ingest, matching, visibility, sessions
npm run build && npm start &
BASE=http://localhost:3000 npm run smoke        # every route and API
BASE=http://localhost:3000 npm run test:e2e     # real browser: forms, login, imports, mobile layout (needs Playwright)
```

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | hosted Postgres connection string (Neon, Supabase, RDS, any Postgres 13+). Add `?sslmode=require` if the host asks for it. Leave empty for local work (embedded Postgres) |
| `ALLOW_EMBEDDED_DB` | set to `1` to let a production build use the embedded database (demos only) |
| `SESSION_SECRET` | 16+ characters, required in production |
| `SEED_PASSWORD` | password for seeded operators |
| `PUBLIC_INCLUDE_DEMO` | `true` shows demo rows on the public site |
| `SITE_URL`, `CONTACT_EMAIL` | sitemap/links and footer |
| `NEXT_PUBLIC_MAP_STYLE` | MapLibre style URL (default OpenFreeMap). Add `?basemap=blank` to any map page to draw data without tiles |
| `INGEST_USER_AGENT` | identify your fetchers to public APIs |

## Dependency notes

`maplibre-gl` is pinned to 5.24.1. `npm audit` flags it (and 6.x requires a different worker setup that was not completed); the advisory concerns the HTML sanitizer behind `setHTML`, which this code never calls (popups are built with `setDOMContent`). Revisit when moving to MapLibre 6.
`npm audit` also reports advisories in build-time PostCSS (bundled by Next) and `uuid` (inside exceljs, used only to read uploaded spreadsheets); neither processes untrusted CSS or uses the affected `uuid` calls.

## Deploying

The app keeps everything in Postgres, including small uploaded files, so it runs on any host, serverless ones such as Vercel included. Nothing is written to disk.

1. Create a Postgres database with any provider and copy its connection string.
2. Set `DATABASE_URL` and `SESSION_SECRET` (16+ characters) on the host. In production the app refuses to start without `DATABASE_URL`.
3. From your own machine, point the same `DATABASE_URL` at the scripts, once: `npm run db:seed` (or `npm run user:create` for real operators only), then `npm run ingest -- all`.

```bash
docker build -t trusemble .
docker run -p 3000:3000 -e DATABASE_URL=postgres://... -e SESSION_SECRET=... trusemble
```

The tables are created on first start. Back up with your provider's snapshots, or `pg_dump`. Tests can run against a real server with `TEST_DATABASE_URL=postgres://... npm run test:pg`.

## What is and is not verified

Verified here: typecheck, 95 unit tests, a smoke run over every route and API, and a browser run (public forms, calculator, operator login, create/edit/verify, spreadsheet import and re-import, pilot accept, phone layout, map layers drawn on a blank basemap).

Not verified:
- **Live public APIs.** The build sandbox could reach none of the source APIs, so the fetchers are tested against canned payloads only. Field names for NFPA, ODF, FACTS, OpenFEMA, USAspending and the National Risk Index are best-effort and logged when unmatched.
- **Base map tiles.** OpenFreeMap was unreachable from the sandbox. Layers were checked on a blank basemap.
- **The live reference sites.** `trusemble.com` and the existing app were not reachable. Layout, copy and behaviour come from PDF print-outs of: Overview, Pilot, Requests, Projects, Matches, Organizations, Contacts, Funding, Map, Sources, Imports, Data quality, and the public home, map, funding, calculator and data pages. Unseen: board views, record detail pages, the new-record forms, the import review screen, the Friday review contents, and any admin settings. These are designed rather than copied.
- **Seed data is not the live data.** Programs, the 33 pipeline requests and the source list are transcribed from the screens; contact details were deliberately left out. Geography, awards and county risk scores are generated demo values.
- Privacy and Terms pages are plain-language drafts and need legal review. There is no email notification on new submissions.
