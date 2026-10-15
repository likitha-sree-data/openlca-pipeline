#!/bin/sh
# Container entrypoint: apply migrations, then serve the API and the built app on port 7860.
set -e
cd /app/backend
python -m app.migrate
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}" --proxy-headers --forwarded-allow-ips="*" --workers 1
