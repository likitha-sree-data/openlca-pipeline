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


@app.post("/e2e/seed-closet", include_in_schema=False)
def seed_closet(email: str, n: int = 100) -> dict:
    """Fill an account with n scanned synthetic garments, for the performance check."""
    import uuid as _uuid

    from app.auth import ensure_profile
    from app.images import dhash, encode_png, encode_webp, fit
    from app.models import Garment
    from app.scan import scan_image
    from app.services import store_file
    from app.testing.synth import garment_photo

    cats = ["top", "bottom", "layer", "shoes", "top", "bottom", "dress"]
    colors = ["#1F2D4D", "#EDE4CF", "#5F6136", "#B8302F", "#D3C0A0", "#2F5DA8", "#6B4A32", "#9CAA8C", "#3A3D40", "#E3A1B2"]
    uid = _uuid.uuid5(_uuid.NAMESPACE_URL, f"drape-dev:{email.lower()}")
    with session_scope() as db:
        profile = ensure_profile(db, uid, email.lower())
        for i in range(n):
            cat, color = cats[i % len(cats)], colors[i % len(colors)]
            res, cut, emb = scan_image(garment_photo(cat, color, seed=1000 + i, size=700), hint=cat)
            gid = _uuid.uuid4()
            img, thumb = f"{uid}/{gid}/cutout.png", f"{uid}/{gid}/thumb.webp"
            size = store_file(db, profile, "garments", img, encode_png(fit(cut.image, 1024)), "image/png")
            size += store_file(db, profile, "garments", thumb, encode_webp(fit(cut.image, 360)), "image/webp")
            db.add(Garment(id=gid, user_id=uid, name=f"{res.name} {i + 1}", category=cat, subtype=res.subtype, color_name=res.color_name,
                           color_hex=res.color_hex, hue=res.hue, sat=res.sat, val=res.val, pattern=res.pattern, formality=res.formality,
                           warmth=res.warmth, seasons=res.seasons, fiber_content=[], care={}, status="active", image_path=img,
                           thumb_path=thumb, cutout_ok=res.cutout_ok, embedding=emb.tolist(), sha256=f"perf-{gid}",
                           phash=dhash(cut.image), bytes=size))
        db.flush()
    return {"seeded": n}


# the SPA catch-all was registered first, so move the test routes ahead of it
for _ in range(2):
    app.router.routes.insert(0, app.router.routes.pop())

import uvicorn  # noqa: E402

uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("E2E_PORT", "7861")), log_level="warning")
