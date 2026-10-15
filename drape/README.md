---
title: Drape
sdk: docker
app_port: 7860
pinned: false
short_description: A styling prototype built around clothes people already own.
---

# Drape

A styling prototype built around clothes people already own.

Drape helps people see, style and track the clothes they already have, and review a possible purchase against that wardrobe before they buy. It is also a research instrument for one question: does seeing similar clothes you already own change a purchase decision?

Principles that shape every screen:

- Inform, do not push. Keep browsing is always an equal choice next to Save for 48 hours.
- Wear counts change only when the person confirms what they wore. Drape never counts a wear from a guess.
- Closet first. Suggestions favour pieces you own, especially ones you have not worn lately.
- Privacy first. Outfit photos are deleted after confirmation by default, EXIF is stripped, and only garment crops are kept.

## Contents

- [Screenshots](#screenshots)
- [What is in the app](#what-is-in-the-app)
- [Coverage checklist](#coverage-checklist)
- [How it is built](#how-it-is-built)
- [Run it in GitHub Codespaces](#run-it-in-github-codespaces)
- [Run it on Windows](#run-it-on-windows)
- [Tests](#tests)
- [Environment variables](#environment-variables)
- [Deploy](#deploy)
- [Free-tier limits](#free-tier-limits)
- [Running the study](#running-the-study)
- [Exporting data](#exporting-data)
- [Model licenses](#model-licenses)
- [Privacy notes](#privacy-notes)
- [Known limits](#known-limits)

## Screenshots

Every screen at 390px and 1280px wide is in [`docs/screenshots`](docs/screenshots). Regenerate them with `npm run screens` in `frontend/`.

| Home | Closet | Review |
|---|---|---|
| ![Home on a phone](docs/screenshots/home-390.png) | ![Closet on a phone](docs/screenshots/closet-390.png) | ![Review on a phone](docs/screenshots/review-detail-390.png) |

| History | Garment matches | Compare |
|---|---|---|
| ![History](docs/screenshots/history-1280.png) | ![Review garment matches](docs/screenshots/match-review-390.png) | ![Compare](docs/screenshots/compare-1280.png) |

## What is in the app

Four tabs (Home, Closet, Review, History), a bottom tab bar on phones and top navigation on desktop. Account and settings sit behind the avatar menu, which also links to Ask, Compare, notifications, study participation and the study admin page.

| Area | Where | What it does |
|---|---|---|
| Closet | `/closet` | Grid with filter chips (All, Tops, Bottoms, Layers, Shoes, plus Dresses and Accessories when owned), search by name or color, sort by recently added, least worn, most worn. A Check details dot marks unsure scans. |
| Add garment | `/closet/add` | One photo or a batch, scanned 6 at a time with a progress bar. Optional "These are all tops" picker. Review details screen before anything is saved. Exact duplicates are skipped, near-duplicates flagged. Drafts and edits survive a refresh. |
| Garment details | `/closet/:id` | All fields editable, wear count, last worn, cost per wear, outfits it works in, wear history, care fields with plain advice, optional Scan care label, next use (keep wearing, sell, donate, keepsake), nudges for unworn pieces, delete with confirmation. |
| Home | `/` | Today's outfit by occasion with optional weather, From your wardrobe panel with swaps, Save this look, Plan another day, Choose colors, Wear this today (asks first), Show another, More outfits from these pieces, Planned days strip, Pieces that work in several outfits and a small capsule. |
| Compare | `/compare` | Outfit A and Outfit B side by side, swap pieces in either, save either. From Home or from two saved looks in History. |
| Ask | `/ask` | Chat grounded in your own data, with outfit cards and Save this outfit. Works without any AI key. |
| Review | `/review` | Add a photo or paste a product link. Already in your wardrobe, Works with, new outfit count, Save for 48 hours or Keep browsing, waiting list with countdown, Still want it? follow-up. |
| History | `/history` | Cards with flat-lay, weekday and occasion, Garments confirmed. or Needs review. Save an outfit photo, Review garment matches, manual logging, month filter, saved looks, insights with charts and tables. |
| Settings | `/settings` | Units, nudge days, notifications, photo defaults, consents, export my data, delete my account. Color preferences and color-profile photos at `/settings/colors`. |
| Study | `/study`, `/admin` | Consent, withdrawal, session timers; admin summary and CSV downloads. Only when `STUDY_MODE=true`. |

## Coverage checklist

Each item from the deck, where it lives, and the test that exercises it.

| Deck | Item | Where | Tested by |
|---|---|---|---|
| Slide 4 | Add a garment: photo, review details | Add garment | `e2e/closet.spec.ts`, `tests/test_closet_api.py` |
| Slide 4 | Find it later: browse and filter | Closet | `e2e/closet.spec.ts` |
| Slide 4 | Track its use: wear history, care information | Garment details | `tests/test_closet_api.py`, `e2e/history.spec.ts` |
| Slide 5 | Daily suggestions for the day or an occasion | Home | `e2e/home.spec.ts`, `tests/test_engine.py` |
| Slide 5 | A small set of clothes that work in several outfits | Home, versatility and capsule | `tests/test_home_api.py` |
| Slide 5 | Personal choices: color preferences, plans for upcoming days | Choose colors, Planned days | `e2e/home.spec.ts` |
| Slide 5 | Save this look, Plan another day, Choose colors, More outfits from these pieces | Home | `e2e/home.spec.ts` |
| Slide 6 | Add a photo or product link | Review | `e2e/review.spec.ts`, `tests/test_review_api.py`, `tests/test_ssrf.py` |
| Slide 6 | Compare with the wardrobe: similar pieces, possible outfits | Review detail | `e2e/review.spec.ts` |
| Slide 6 | Save for 48 hours | Review detail, waiting list, cron | `tests/test_review_api.py`, `e2e/review.spec.ts` |
| Slide 7 | Save an outfit photo | History | `e2e/history.spec.ts` |
| Slide 7 | Confirm the garment matches before recording use | Review garment matches | `e2e/history.spec.ts`, `tests/test_history_api.py` |
| Slide 7 | Revisit past outfits | History cards, month filter, re-save | `e2e/history.spec.ts` |
| Slide 7 | See which clothes appear repeatedly | History insights | `e2e/history.spec.ts`, `tests/test_history_api.py` |
| Slide 8 | Study design and records: decision, reasons, confidence, later purchase check | Study layer | `tests/test_study.py`, `e2e/study.spec.ts` |
| Slide 11 | Compare outfits, A and B, save either | Compare | `e2e/ask-compare-account.spec.ts` |
| Slide 11 | Ask about your wardrobe, with Save this outfit | Ask | `e2e/ask-compare-account.spec.ts`, `tests/test_chat.py` |
| Slide 12 | Garment care | Garment details, Care | `tests/test_closet_api.py` |
| Slide 12 | Mark for sale or donation | Garment details, Next use | `tests/test_closet_api.py` |
| Slide 12 | Manage color-profile photos and account settings | Settings, Choose colors | `tests/test_account.py`, `e2e/ask-compare-account.spec.ts` |
| Slide 12 | Confirm before leaving unsaved work | Every form | `e2e/closet.spec.ts`, `e2e/home.spec.ts`, `e2e/ask-compare-account.spec.ts` |
| Slide 12 | Testing kit: setup, outfit choices, purchase review, photo matching | [`docs/usability-test.md`](docs/usability-test.md), Study page timers | manual |

## How it is built

```
Browser (React 18 PWA, Vite, Tailwind, TanStack Query)
   |  Authorization: Bearer <Supabase JWT or Drape demo JWT>
FastAPI on one Hugging Face Docker Space, port 7860
   |- /api/*        JSON API, every query scoped by user_id
   |- /internal/*   hourly jobs, X-Cron-Secret header
   |- /*            the built React app
Supabase: Postgres with pgvector (RLS on every table, no policies), Auth magic link, private Storage
GitHub Actions: CI, and an hourly call to /internal/run-due
```

- `drape/backend/app/engine.py` is the deterministic outfit engine: color harmony, formality, weather, freshness, color preferences and learned taste, with seeded variety and plain reasons.
- `drape/backend/app/scan.py` does the cutout, colors, pattern and category guess; `embed.py` the 512-number embeddings; `segment.py` the outfit photo regions and matching.
- `drape/backend/app/ssrf.py` fetches product pages safely.
- `drape/supabase/migrations/` is the schema. `PLAN.md` and `DECISIONS.md` record the plan and every choice the spec left open.

## Run it in GitHub Codespaces

This is the recommended way on a Windows machine with little disk space. Everything runs in the cloud.

1. On GitHub, open the repository, choose Code, then Codespaces, then the three dots, then New with options. Pick the dev container configuration named **Drape**.
2. Wait for the setup script to finish. It installs Python and Node packages, creates the databases with pgvector and copies `.env.example` to `.env`.
3. In the Codespace terminal:

```bash
cd drape
printf 'AUTH_DEV_LOGIN=true\nDEMO_MODE=true\n' >> .env
(cd frontend && npm run build)
(cd backend && ../.venv/bin/python -m app.migrate --bootstrap && ../.venv/bin/uvicorn app.main:app --port 7860)
```

4. Open the forwarded port 7860. Sign in with any email (developer sign-in) or press Try the demo.

For frontend work with hot reload, run `npm run dev` in `frontend/` in a second terminal and open port 5173. It proxies `/api` to port 7860.

You can also start a Codespace from PowerShell with the GitHub CLI:

```powershell
gh codespace create --repo <owner>/<repo> --devcontainer-path .devcontainer/drape/devcontainer.json
gh codespace code
```

## Run it on Windows

Only if you want to run Drape on your own machine. You need Python 3.11, Node 22, and PostgreSQL 16 with the pgvector extension. In PowerShell from the repository root:

```powershell
cd drape
py -3.11 -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements-dev.txt
Copy-Item .env.example .env
Add-Content .env "AUTH_DEV_LOGIN=true"
Add-Content .env "DEMO_MODE=true"
Add-Content .env "DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/drape"
Set-Location frontend; npm ci; npm run build; Set-Location ..
Set-Location backend
..\.venv\Scripts\python -m app.migrate --bootstrap
..\.venv\Scripts\uvicorn app.main:app --port 7860
```

Open http://localhost:7860.

## Tests

From `drape/` (bash shown; in PowerShell use `.venv\Scripts\python` instead of `.venv/bin/python`):

| What | Command | Count at last run |
|---|---|---|
| Backend (pytest) | `cd backend && ../.venv/bin/python -m pytest -q` | 137 passed |
| Frontend unit (Vitest) | `cd frontend && npm test` | 6 passed |
| End to end with axe (Playwright, production build) | `cd frontend && npm run build && npx playwright test` | 28 passed |
| Screenshots of every screen | `cd frontend && npm run screens` | 4 runs |
| Closet with 100 items, mid-range phone, fast 4G | `cd frontend && npm run perf` | see below |

Playwright starts its own servers with fresh databases `drape_e2e` and `drape_e2e_study` and uses the Chromium that Playwright installs. Set `E2E_DATABASE_URL` to point at another Postgres.

Performance, measured with Chromium at 390 by 844, Chrome's Fast 4G profile (9 Mbps down, 60 ms latency), a 4x slower CPU, HTTP cache disabled and the service worker blocked, on a closet of 100 scanned garments: the Closet is usable after a median of 1.25 seconds and the largest contentful paint is at 1.32 seconds. Thumbnails load lazily. Raw numbers are in [`docs/perf-closet-100.json`](docs/perf-closet-100.json).

## Environment variables

Every variable is listed with a comment in [`.env.example`](.env.example). The ones you must set for a real deployment:

| Variable | Where | Notes |
|---|---|---|
| `ENVIRONMENT` | server | `production` turns off developer sign-in and API docs, and refuses a weak `APP_SECRET`. |
| `DATABASE_URL` | server secret | Supabase session pooler connection string. |
| `SUPABASE_URL` | server | Also sent to the browser for magic-link sign-in. |
| `SUPABASE_ANON_KEY` | server | Public key, sent to the browser. RLS blocks it from every table. |
| `SUPABASE_SERVICE_ROLE_KEY` | server secret | Storage access and deleting auth users. Never sent to the browser. |
| `SUPABASE_JWT_SECRET` | server secret | Only for projects on the legacy HS256 secret. Projects with JWT signing keys are verified through JWKS, leave it empty. |
| `APP_SECRET` | server secret | At least 32 random characters. Signs demo sessions. |
| `STORAGE_DRIVER` | server | `supabase` in production. Space disks are not persistent. |
| `LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` | server secret | Optional. `none` keeps everything free. |
| `RESEND_API_KEY`, `EMAIL_FROM` | server secret | Optional email reminders. |
| `STUDY_MODE`, `STUDY_DESIGN`, `STUDY_SEED`, `ADMIN_EMAILS` | server | Study settings, see below. |
| `DEMO_MODE` | server | Shows Try the demo. |
| `INTERNAL_CRON_SECRET` | server secret | Same value as the `DRAPE_CRON_SECRET` GitHub secret. |
| `FEATURE_COLOR_PROFILE` | server | Off by default. |

## Deploy

### 1. Supabase

1. Create a project at supabase.com.
2. In SQL editor, run each file in `drape/supabase/migrations/` in name order. The first one enables `vector`, creates every table with RLS on and no policies, and creates the four private buckets (`garments`, `outfit-photos`, `review-items`, `profile-photos`). If you prefer the CLI: `supabase link` then `supabase db push`.
3. In Authentication, URL configuration, set Site URL to your Space URL (for example `https://<you>-drape.hf.space`) and add it to Redirect URLs. Email magic link is on by default.
4. Note the project URL, anon key, service role key, and the session pooler connection string (Project settings, Database). The pooler works over IPv4, which Spaces need.

### 2. Hugging Face Space

1. Create a Space with the Docker SDK and CPU basic hardware.
2. In the Space settings add secrets: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `INTERNAL_CRON_SECRET`, and any of `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_JWT_SECRET`, `STUDY_SEED`. Add variables: `ENVIRONMENT=production`, `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DEMO_MODE`, `STUDY_MODE`, `LLM_PROVIDER`, `ADMIN_EMAILS`, `PUBLIC_BASE_URL`.
3. Push the contents of the `drape/` folder as the root of the Space repository. In PowerShell from the repository root:

```powershell
git subtree split --prefix drape -b drape-space
git remote add space https://huggingface.co/spaces/<you>/drape
git push space drape-space:main --force
```

The Space builds the `Dockerfile`: Node builds the React app, Python serves it with FastAPI on port 7860, and model weights are downloaded during the build. The container runs the migrations on start. The YAML block at the top of this README is the Space configuration.

### 3. GitHub Actions

Add repository secrets `DRAPE_URL` (the Space URL) and `DRAPE_CRON_SECRET` (same as `INTERNAL_CRON_SECRET`). `.github/workflows/drape-cron.yml` calls `/internal/run-due` every hour and retries while a sleeping Space wakes up. `.github/workflows/drape-ci.yml` runs backend tests, frontend tests and Playwright against a production build on every push that touches `drape/`.

## Free-tier limits

Checked in October 2026 from public summaries; confirm on the official pricing pages before relying on them.

- Supabase free plan: 500 MB database and 1 GB file storage per project, two active projects, and projects pause after a week without activity. A paused project keeps its data but is unreachable until you restore it from the dashboard. The hourly cron keeps the database active while the Space is up.
- Hugging Face CPU basic: 2 vCPU, 16 GB memory, free. Free Spaces go to sleep when unused (documented as 48 hours) and the sleep time cannot be changed on free hardware. The first request after sleeping waits for the container to start. Disks are not persistent, which is why production uses Supabase Storage.
- Drape keeps a per-user photo quota (300 MB by default) so one account cannot fill the free storage.

## Running the study

1. Replace `drape/study/consent-v1.md` with your IRB-approved text. If you change it after people have joined, bump `CONSENT_VERSION` in `backend/app/study_config.py`.
2. Set `STUDY_MODE=true`, `STUDY_SEED` to a long random string, `STUDY_DESIGN` (`between_subject` or `within_subject_counterbalanced`) and `ADMIN_EMAILS`.
3. Adjust sample size, block size and the reasons list in `backend/app/study_config.py`.
4. Participants open Study participation from the avatar menu, read the consent and join. They get a pseudonymous code. Assignment is blocked randomization, stored when they join.
5. Control participants see the product only, with the same two buttons. Treatment participants see the full comparison. After choosing, everyone answers reasons and confidence; 48 hours later they answer whether they bought it.
6. Admins open `/admin` for counts per condition, decision rates, mean confidence, follow-up purchase rate, and two CSV downloads. Columns are described in [`docs/codebook.md`](docs/codebook.md).
7. For observed sessions use [`docs/usability-test.md`](docs/usability-test.md) and the session timers on the Study page.

## Exporting data

- A person: Account and settings, Export my data. A zip with `data.json` (every record) and an `images/` folder.
- The study team: `/admin`, Download CSV. No names, emails, account ids, photos or links.

## Model licenses

| Model | Used for | License | Status here |
|---|---|---|---|
| rembg with u2netp | Background cutout | rembg MIT; U²-Net Apache 2.0 | Running and tested |
| FashionCLIP (`patrickjohncyh/fashion-clip`) | Embeddings and zero-shot category and fabric | MIT (built on OpenAI CLIP, MIT) | Code path written, not run here |
| SegFormer clothes (`mattmdjaga/segformer_b2_clothes`) | Outfit photo regions | MIT per the model card; trained on the ATR dataset, check its terms for commercial use | Code path written, not run here |
| Claude (`claude-opus-5-5` by default) | Optional chat and care labels | Anthropic commercial terms | Request shape unit tested with a fake client |
| Gemini (`gemini-2.5-flash` by default) | Optional chat and care labels | Google API terms | Not run |

Confirm each license on its model card before a public launch; this table records what the cards said when the code was written.

## Privacy notes

- Every API request needs a verified token and every query is scoped by `user_id`. RLS is enabled on every table with no policies, so the Supabase REST API returns nothing even with the anon key. Tests prove one user cannot read, change or delete another user's rows or files.
- Buckets are private. Images are served by short-lived signed links.
- Uploads are checked by content, capped at 12 MB and 40 megapixels, and re-encoded, which removes EXIF including location.
- Outfit photos: the original is deleted after you confirm the matches unless you turn on Keep my original photo. Thumbnails are garment crops, never faces.
- Location is only used for weather after you tap Use my local weather, and it goes from your browser straight to Open-Meteo, not to Drape's server.
- The chat sends names and details of your clothes to the AI provider you configure, never photos. With `LLM_PROVIDER=none` nothing leaves the server.
- Logs record method, path, status, timing and a request id. No emails, no request bodies, no image bytes.
- Delete my account removes database rows, storage files and the Supabase Auth user, and leaves only a tombstone (account id and time) so old sessions cannot recreate the account.

## Known limits

Things that are untested, mocked or faked. Read before relying on them.

- **FashionCLIP and SegFormer were never run.** Hugging Face was not reachable from the build sandbox. Their code paths are written but unexecuted. Every test used the fallbacks: a 512-number color, silhouette and edge embedding, shape rules for the category guess, and body bands for outfit photos. With the fallbacks, category guesses are often marked Check details, fabric is never guessed, and outfit photo matching depends on colors and works best when clothes contrast with the background. The prepared test photo uses a mid-grey wall for that reason.
- **The 8-second scan budget is verified only for the fallback path.** rembg u2netp took about 1 second per 1400px photo here; FashionCLIP timing on CPU basic is unmeasured.
- **The Docker image was never built.** There was no Docker daemon in the build environment. The production start path (migrations, then uvicorn serving the built app in production mode) was run locally without Docker.
- **Nothing ran against a real Supabase project.** Magic-link sign-in, JWKS verification against a live project, Storage uploads and signed URLs, and deleting the Auth user were not exercised. JWT verification is unit tested with locally signed HS256 and ES256 tokens, and the Storage driver's requests are checked against a mock server.
- **End-to-end tests sign in with developer sign-in**, not a magic link, and run with `ENVIRONMENT=e2e` against the production frontend build. Product links in e2e come from a fake shop inside the test server launcher, and a test-only hook moves saved items 49 hours into the past.
- **No real AI provider was called.** The Anthropic provider's tool loop and refusal handling are tested with a fake client; Gemini is untested. Care-label reading has never read a real label.
- **Email through Resend was never sent.** Reminders were verified in the in-app notification center only.
- **Weather** was tested with a mocked Open-Meteo response; the real service was blocked here.
- **PWA installability** could not be confirmed: Chrome refuses the installability check in a test profile. The manifest, icons and service worker are generated and load.
- **The Lighthouse PWA category no longer exists** in current Lighthouse, so performance was measured with the Playwright script above instead.
- **Free-tier limits** come from public summaries, not from the providers' own pricing pages.
- **Rate limits are per process.** That is correct for one Space, but they reset when the Space restarts.
- **Consent text is a placeholder.** Replace it with IRB-approved text before recruiting anyone.
- **Dark mode** is not included.
