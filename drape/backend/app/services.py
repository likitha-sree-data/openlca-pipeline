"""Shared queries and serializers used by several routers."""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .engine import Context, Piece
from .models import ColorPrefs, Garment, Outfit, OutfitItem, Profile, WearLog
from .storage import get_storage, url_for


# ---------------------------------------------------------------- storage with quota

def store_file(db: Session, profile: Profile, bucket: str, path: str, data: bytes, content_type: str) -> int:
    quota = get_settings().storage_quota_mb * 1024 * 1024
    if profile.storage_bytes + len(data) > quota:
        raise HTTPException(413, "Your photo storage is full. Delete some garments or photos to make room.")
    if not path.startswith(f"{profile.id}/"):
        raise HTTPException(500, "Storage path does not belong to this account.")
    get_storage().put(bucket, path, data, content_type)
    profile.storage_bytes = (profile.storage_bytes or 0) + len(data)
    return len(data)


def release_files(db: Session, profile: Profile, bucket: str, paths: list[str | None], nbytes: int) -> None:
    real = [p for p in paths if p and not p.startswith("demo:")]
    if real:
        get_storage().delete(bucket, real)
    profile.storage_bytes = max(0, (profile.storage_bytes or 0) - (nbytes or 0))


# ---------------------------------------------------------------- wear stats

def wear_stats(db: Session, user_id: uuid.UUID, garment_ids: list[uuid.UUID] | None = None) -> dict[uuid.UUID, dict[str, Any]]:
    q = (select(WearLog.garment_id, func.count(WearLog.id), func.max(WearLog.worn_on))
         .where(WearLog.user_id == user_id).group_by(WearLog.garment_id))
    if garment_ids is not None:
        q = q.where(WearLog.garment_id.in_(garment_ids))
    return {gid: {"wear_count": int(n), "last_worn": last} for gid, n, last in db.execute(q)}


def garment_out(g: Garment, stats: dict[str, Any] | None = None, versatility: int | None = None, full: bool = False) -> dict[str, Any]:
    stats = stats or {"wear_count": 0, "last_worn": None}
    price = float(g.price) if g.price is not None else None
    cpw = round(price / stats["wear_count"], 2) if price is not None and stats["wear_count"] else None
    out: dict[str, Any] = {
        "id": str(g.id),
        "name": g.name,
        "category": g.category,
        "subtype": g.subtype,
        "color_name": g.color_name,
        "color_hex": g.color_hex,
        "pattern": g.pattern,
        "formality": g.formality,
        "warmth": g.warmth,
        "seasons": g.seasons or [],
        "status": g.status,
        "price": price,
        "purchased_on": g.purchased_on.isoformat() if g.purchased_on else None,
        "image_url": url_for("garments", g.image_path),
        "thumb_url": url_for("garments", g.thumb_path or g.image_path),
        "cutout_ok": g.cutout_ok,
        "needs_review": g.needs_review,
        "wear_count": stats["wear_count"],
        "last_worn": stats["last_worn"].isoformat() if stats["last_worn"] else None,
        "cost_per_wear": cpw,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }
    if versatility is not None:
        out["versatility"] = versatility
    if full:
        out["fiber_content"] = g.fiber_content or []
        out["care"] = g.care or {}
        out["care_label_url"] = url_for("garments", g.care_label_path)
    return out


def get_owned_garment(db: Session, user_id: uuid.UUID, garment_id: uuid.UUID | str) -> Garment:
    try:
        gid = uuid.UUID(str(garment_id))
    except ValueError as exc:
        raise HTTPException(404, "That garment was not found in your closet.") from exc
    g = db.scalar(select(Garment).where(Garment.id == gid, Garment.user_id == user_id))
    if g is None:
        raise HTTPException(404, "That garment was not found in your closet.")
    return g


def owned_ids(db: Session, user_id: uuid.UUID, ids: list[str]) -> list[uuid.UUID]:
    """Validate that every id is a real garment owned by the user."""
    try:
        parsed = [uuid.UUID(str(i)) for i in ids]
    except ValueError as exc:
        raise HTTPException(400, "One of the garments is not valid.") from exc
    found = set(db.scalars(select(Garment.id).where(Garment.user_id == user_id, Garment.id.in_(parsed))))
    if len(found) != len(set(parsed)):
        raise HTTPException(400, "One of the garments is not in your closet.")
    return parsed


# ---------------------------------------------------------------- engine glue

def load_pieces(db: Session, user_id: uuid.UUID) -> tuple[list[Piece], dict[str, Garment]]:
    garments = list(db.scalars(select(Garment).where(Garment.user_id == user_id)))
    stats = wear_stats(db, user_id)
    pieces = []
    for g in garments:
        st = stats.get(g.id, {"wear_count": 0, "last_worn": None})
        pieces.append(Piece(
            id=str(g.id), name=g.name, category=g.category, color_name=g.color_name, color_hex=g.color_hex,
            pattern=g.pattern or "solid", formality=g.formality, warmth=g.warmth, subtype=g.subtype,
            status=g.status, last_worn=st["last_worn"], wear_count=st["wear_count"]))
    return pieces, {str(g.id): g for g in garments}


def make_context(db: Session, profile: Profile, occasion: str = "everyday", temp_c: float | None = None,
                 seed: int = 0, today: date | None = None) -> Context:
    prefs = db.get(ColorPrefs, profile.id)
    return Context(
        occasion=occasion, temp_c=temp_c, seed=seed, today=today or date.today(),
        favorites=frozenset(prefs.favorites if prefs else []), avoid=frozenset(prefs.avoid if prefs else []),
        taste={k: float(v) for k, v in (profile.taste or {}).items()},
    )


def outfit_out(o: Outfit, garments: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "id": str(o.id),
        "name": o.name,
        "occasion": o.occasion,
        "source": o.source,
        "saved": o.saved,
        "worn_on": o.worn_on.isoformat() if o.worn_on else None,
        "reasons": o.reasons or [],
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "pieces": [{"slot": it.slot, "garment_id": str(it.garment_id),
                    "garment": (garments or {}).get(str(it.garment_id))} for it in sorted(o.items, key=_slot_rank)],
    }


SLOT_RANK = {"layer": 0, "top": 1, "dress": 2, "bottom": 3, "shoes": 4, "accessory": 5}


def _slot_rank(it: OutfitItem) -> int:
    return SLOT_RANK.get(it.slot, 9)


def garments_by_id(db: Session, user_id: uuid.UUID, ids: set[str] | None = None) -> dict[str, dict[str, Any]]:
    q = select(Garment).where(Garment.user_id == user_id)
    if ids is not None:
        if not ids:
            return {}
        q = q.where(Garment.id.in_([uuid.UUID(i) for i in ids]))
    gs = list(db.scalars(q))
    stats = wear_stats(db, user_id, [g.id for g in gs])
    return {str(g.id): garment_out(g, stats.get(g.id)) for g in gs}


def outfits_out(db: Session, user_id: uuid.UUID, outfits: list[Outfit]) -> list[dict[str, Any]]:
    ids = {str(it.garment_id) for o in outfits for it in o.items}
    gmap = garments_by_id(db, user_id, ids)
    return [outfit_out(o, gmap) for o in outfits]


def create_outfit(db: Session, user_id: uuid.UUID, pieces: list[dict[str, str]], **fields: Any) -> Outfit:
    ids = owned_ids(db, user_id, [p["garment_id"] for p in pieces])
    o = Outfit(user_id=user_id, **fields)
    o.items = [OutfitItem(garment_id=gid, slot=p["slot"]) for gid, p in zip(ids, pieces)]
    db.add(o)
    db.flush()
    return o


def jsonable(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


def group_by(items, key) -> dict:
    out: dict = defaultdict(list)
    for it in items:
        out[key(it)].append(it)
    return out
