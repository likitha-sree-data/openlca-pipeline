#!/usr/bin/env bash
# One-time setup inside the Codespace. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v psql >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client)
python -m venv .venv
.venv/bin/pip install -q -r backend/requirements-dev.txt
for db in drape_test drape_e2e; do
  PGPASSWORD=postgres psql -h db -U postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 \
    || PGPASSWORD=postgres psql -h db -U postgres -c "create database $db"
done
(cd backend && ../.venv/bin/python -m app.migrate --bootstrap)
(cd frontend && npm ci && npx playwright install --with-deps chromium)
[ -f .env ] || cp .env.example .env
echo "Drape is ready. See README for how to run it."
