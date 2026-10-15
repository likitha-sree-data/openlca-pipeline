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
data = ROOT / ".data" / os.environ.get("E2E_DATA_NAME", "e2e")
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

# ---- test-only fakes, never part of the app itself -------------------------
# A fake shop at shop.e2e.test (served without network) and a hook that ages
# saved items past 48 hours so the follow-up can be tested end to end.
from datetime import UTC, datetime, timedelta  # noqa: E402

from app.routers import reviews as reviews_router  # noqa: E402
from app.ssrf import Fetched, FetchFailed  # noqa: E402
from app.testing.synth import garment_photo, jpeg_bytes  # noqa: E402

_real_fetch = reviews_router.safe_fetch
SHOP_PAGE = (b'<html><head><title>Shop</title><meta property="og:title" content="Navy knit sweater">'
             b'<meta property="og:image" content="https://shop.e2e.test/sweater.jpg">'
             b'<meta property="product:price:amount" content="65.00"></head><body></body></html>')
SWEATER = jpeg_bytes(garment_photo("top", "#24345A", seed=77))


def fake_fetch(url, cap=None, **kw):
    from urllib.parse import urlsplit

    host = urlsplit(url).hostname
    if host == "shop.e2e.test":
        if url.endswith(".jpg"):
            return Fetched(url, SWEATER, "image/jpeg")
        return Fetched(url, SHOP_PAGE, "text/html")
    if host == "blocked.e2e.test":
        raise FetchFailed("This shop blocks automatic checks. Add a screenshot or photo of the item instead.")
    return _real_fetch(url, cap, **kw) if cap else _real_fetch(url, **kw)


reviews_router.safe_fetch = fake_fetch

from app.main import app  # noqa: E402
from app.db import session_scope  # noqa: E402
from app.models import WaitingItem  # noqa: E402
from app.routers.internal import run_due  # noqa: E402


@app.post("/e2e/age-waiting", include_in_schema=False)
def age_waiting() -> dict:
    with session_scope() as db:
        for w in db.query(WaitingItem).all():
            w.saved_at -= timedelta(hours=49)
            w.due_at -= timedelta(hours=49)
        db.flush()
        return run_due(db, now=datetime.now(UTC))


# the SPA catch-all was registered first, so move the test route ahead of it
app.router.routes.insert(0, app.router.routes.pop())

import uvicorn  # noqa: E402

uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("E2E_PORT", "7861")), log_level="warning")
