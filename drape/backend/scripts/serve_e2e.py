"""Start a clean server for Playwright: fresh database, empty storage, dev sign-in.

    python scripts/serve_e2e.py            (from backend/)
Environment overrides: E2E_DATABASE_URL, E2E_PORT, E2E_STUDY_MODE.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
data = ROOT / ".data" / "e2e"
shutil.rmtree(data, ignore_errors=True)
data.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("DATABASE_URL", os.environ.get("E2E_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/drape_e2e"))
os.environ.update({
    "ENVIRONMENT": "e2e",
    "AUTH_DEV_LOGIN": "true",
    "STORAGE_DRIVER": "local",
    "LOCAL_STORAGE_DIR": str(data / "storage"),
    "DEMO_MODE": "true",
    "STUDY_MODE": os.environ.get("E2E_STUDY_MODE", "false"),
    "INTERNAL_CRON_SECRET": "e2e-cron-secret",
    "ADMIN_EMAILS": "admin@example.com",
    "LLM_PROVIDER": "none",
    "ENABLE_FASHION_CLIP": os.environ.get("ENABLE_FASHION_CLIP", "false"),
    "ENABLE_SEGFORMER": os.environ.get("ENABLE_SEGFORMER", "false"),
    "STATIC_DIR": str(ROOT / "frontend" / "dist"),
    "LOG_LEVEL": "WARNING",
    "SUPABASE_URL": "",
    "SUPABASE_ANON_KEY": "",
})
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import create_engine, text  # noqa: E402

url = os.environ["DATABASE_URL"]
admin_url = url.rsplit("/", 1)[0] + "/postgres"
dbname = url.rsplit("/", 1)[1]
eng = create_engine(admin_url, isolation_level="AUTOCOMMIT")
with eng.connect() as conn:
    conn.execute(text(f'drop database if exists "{dbname}" with (force)'))
    conn.execute(text(f'create database "{dbname}"'))
eng.dispose()

from app import migrate  # noqa: E402

migrate.apply(bootstrap=True)

import uvicorn  # noqa: E402

uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("E2E_PORT", "7861")), log_level="warning")
