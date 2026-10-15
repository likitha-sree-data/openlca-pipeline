"""Create an expiring demo sandbox with fictional, illustrated garments."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache

from sqlalchemy.orm import Session

from .. import colors
from ..embed import get_embedder
from ..models import ColorPrefs, Garment, Outfit, OutfitItem, Profile, WearLog
from .art import CANDIDATE, GARMENTS, DemoGarment, rasterize

DEMO_HOURS = 24
HISTORY = [
    # weekday (0 = Monday), outfit name, occasion, garment slugs
    (0, "Office", "work", ["cream-cotton-shirt", "black-blazer", "beige-trousers", "brown-loafers"]),
    (1, "Everyday", "everyday", ["grey-crew-tee", "navy-straight-jeans", "white-trainers"]),
    (2, "Meeting", "meeting", ["sage-linen-shirt", "navy-cardigan", "beige-trousers", "brown-loafers"]),
]
SLOT = {"top": "top", "bottom": "bottom", "layer": "layer", "dress": "dress", "shoes": "shoes"}


@lru_cache
def demo_embedding(slug: str) -> list[float]:
    g = next(x for x in GARMENTS + [CANDIDATE] if x.slug == slug)
    return get_embedder().embed(rasterize(g)).tolist()


def last_weekday(weekday: int, today: date) -> date:
    """Most recent date before today that falls on weekday, within the last week."""
    delta = (today.weekday() - weekday) % 7 or 7
    return today - timedelta(days=delta)


def garment_from_art(user_id: uuid.UUID, g: DemoGarment) -> Garment:
    h, s, v = colors.hsv(g.color_hex)
    warm_seasons = {1: ["spring", "summer"], 2: ["spring", "autumn"], 3: ["autumn", "winter"]}[g.warmth]
    return Garment(
        id=uuid.uuid4(), user_id=user_id, name=g.name, category=g.category, subtype=g.subtype,
        color_name=colors.name_color(g.color_hex), color_hex=g.color_hex, hue=h, sat=s, val=v, pattern="solid",
        formality=g.formality, warmth=g.warmth, seasons=warm_seasons,
        fiber_content=[{"fiber": g.fiber, "percent": 100}] if g.fiber else [], care={}, price=g.price,
        status="active", image_path=f"demo:{g.slug}.svg", thumb_path=f"demo:{g.slug}.svg", cutout_ok=True,
        embedding=demo_embedding(g.slug), sha256=f"demo-{g.slug}", needs_review=False, bytes=0,
    )


def seed_demo(db: Session, today: date | None = None) -> Profile:
    today = today or date.today()
    uid = uuid.uuid4()
    profile = Profile(id=uid, email=None, display_name="Demo", is_demo=True,
                      demo_expires_at=datetime.now(UTC) + timedelta(hours=DEMO_HOURS), taste={})
    db.add(profile)
    db.flush()
    db.add(ColorPrefs(user_id=uid, favorites=["navy", "olive"], avoid=[]))
    by_slug: dict[str, Garment] = {}
    for art in GARMENTS:
        g = garment_from_art(uid, art)
        by_slug[art.slug] = g
        db.add(g)
    db.flush()
    for weekday, name, occasion, slugs in HISTORY:
        worn = last_weekday(weekday, today)
        o = Outfit(id=uuid.uuid4(), user_id=uid, name=name, occasion=occasion, source="manual", saved=True, worn_on=worn,
                   reasons=[])
        o.items = [OutfitItem(garment_id=by_slug[s].id, slot=SLOT[by_slug[s].category]) for s in slugs]
        db.add(o)
        db.flush()
        for s in slugs:
            db.add(WearLog(user_id=uid, garment_id=by_slug[s].id, outfit_id=o.id, worn_on=worn, source="manual",
                           confirmed_at=datetime.now(UTC)))
    db.flush()
    try:
        from ..routers.reviews import create_demo_review
    except ImportError:
        create_demo_review = None
    if create_demo_review is not None:
        create_demo_review(db, profile)
    return profile
