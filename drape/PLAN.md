# Drape build plan

Drape is a mobile-first styling app built around clothes people already own. It doubles as a research instrument for one question: does seeing similar clothes you already own change a purchase decision?

## Architecture

```
Browser (React 18 PWA)
  |  HTTPS, Supabase JWT or Drape session JWT in Authorization header
  v
FastAPI (one Hugging Face Docker Space, port 7860)
  |- /api/*        JSON API, every query scoped by user_id
  |- /internal/*   cron endpoints, secret header
  |- /media/*      HMAC-signed local file URLs (local storage driver only)
  |- /*            built React app (static files, SPA fallback)
  |
  |- engine.py     deterministic outfit engine (numpy, seeded)
  |- scan.py       cutout (rembg u2netp, border-color fallback), color, pattern, category guess
  |- embed.py      FashionCLIP 512-d embeddings, handcrafted 512-d fallback
  |- segment.py    SegFormer clothes parsing, body-band fallback
  |- llm/          LLMProvider: anthropic, gemini, none (rule based)
  |- ssrf.py       safe product page fetch
  v
Supabase: Postgres + pgvector (RLS on, no policies), Auth (magic link), private Storage buckets
GitHub Actions: CI (pytest, vitest, Playwright) and hourly cron for 48-hour reminders
```

### Folder layout

```
drape/
  backend/app/          FastAPI app, routers, services
  backend/tests/        pytest suite
  frontend/             React app (Vite)
  frontend/e2e/         Playwright tests and screenshot script
  supabase/migrations/  SQL migrations, source of truth for the schema
  docs/                 codebook, usability test kit, screenshots
  Dockerfile            multi-stage build for the Space
```

Repo-level files: `.devcontainer/drape/devcontainer.json` (a second Codespaces config next to the existing openLCA one) and `.github/workflows/drape-*.yml`.

### Key seams that keep it testable without cloud accounts

| Concern | Production | Local and CI |
|---|---|---|
| Auth | Supabase magic link, JWT verified with JWKS or the project JWT secret | Dev sign-in (`AUTH_DEV_LOGIN=true`) mints a Drape JWT |
| Demo users | Drape-issued JWT, no Supabase Auth user | same |
| Storage | Supabase Storage REST with signed URLs | Local folder with HMAC signed, expiring URLs |
| Database | Supabase Postgres | Local Postgres 16 with pgvector |
| Models | Prefetched in the Docker image | Fallbacks when a model is missing |
| LLM | anthropic or gemini by env | `none` rule-based provider |
| Email | Resend when the key is set | In-app notification center |

## Milestones

- [ ] M0 Foundation: repo layout, devcontainer, migrations, auth, app shell with four tabs, tokens, FlatLay with fixtures, demo seed, CI. Accept: sign in, tabs render, isolation tests pass.
- [ ] M1 Closet: add garment single and batch, scan, review details, grid, filters, search, sort, details, care, status, delete. Accept: 12 synthetic photos in one batch, fix a wrong category, filter and search, survives reload.
- [ ] M2 Home: engine, today's outfit, swap, save look, plan a day, colors, more outfits, versatility, wear today, weather. Accept: engine property tests, saved looks persist, planned strip.
- [ ] M3 History: wear logs, history cards, outfit photo upload, segmentation, matching, confirm, insights. Accept: wear counts change only after confirm, exactly once per garment, original deleted by default.
- [ ] M4 Review: photo and link input, SSRF-safe fetch, similar, works with, new outfit count, 48-hour save, waiting list, follow-up. Accept: demo candidate shows navy cardigan, due at T plus 48 hours, cron marks it due.
- [ ] M5 Ask, Compare, care, preferences: chat with tools and fallback, compare, nudges, color-profile flag, export, delete account, unsaved guard. Accept: chat never returns a missing id, export and delete verified.
- [ ] M6 Study layer: consent, randomization, control and treatment, events, follow-ups, admin, CSV, codebook, usability kit. Accept: 40 simulated participants balanced, CSV has no personal fields.
- [ ] M7 Hardening and deploy: rate limits, quotas, error states, accessibility, README, Dockerfile, demo polish. Accept: full e2e suite passes against a production build.

## Risks

1. Hugging Face is not reachable from the build sandbox, so FashionCLIP and SegFormer cannot be exercised here. Mitigation: lazy loading with tested fallbacks, Docker build prefetches the models, Known limits says so plainly.
2. CPU basic Space has 2 vCPU and 16 GB RAM. FashionCLIP plus SegFormer plus rembg in one process is heavy. Mitigation: lazy load, one shared torch thread pool, models loaded only on first use.
3. Free tiers sleep and pause. Mitigation: cron through GitHub Actions, reminders are computed from `due_at`, not from in-process timers.
4. Supabase Auth magic link cannot be end-to-end tested without an inbox. Mitigation: dev sign-in path for tests, JWT verification unit tested with JWKS and HS256 tokens.
5. Outfit enumeration grows fast with wardrobe size. Mitigation: numpy tensor counting, per-slot pruning above a combination budget, cached versatility.
6. Body photos are sensitive. Mitigation: original deleted after confirm by default, EXIF stripped, only garment crops shown, private buckets.
7. Study validity depends on the consent text and randomization. Mitigation: placeholder text clearly labeled, server-side blocked randomization stored at assignment time, balance test.
