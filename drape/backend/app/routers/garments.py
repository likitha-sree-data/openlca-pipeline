"""Closet: scan photos into drafts, save drafts as garments, browse, edit, delete."""
from __future__ import annotations

import asyncio
import uuid
from datetime import date, datetime
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import colors
from ..auth import CurrentUser, current_user
from ..care import advice, clean_care
from ..config import get_settings
from ..db import get_db
from ..embed import cosine
from ..images import dhash, encode_jpeg, encode_png, encode_webp, fit, hamming, sha256, validate_upload
from ..models import Garment, Outfit, OutfitItem, ScanDraft, WearLog
from ..ratelimit import limit
from ..scan import SEASONS_BY_WARMTH, scan_image
from ..services import garment_out, get_owned_garment, release_files, store_file, wear_stats
from ..storage import get_storage, url_for
from ..versatility import get_versatility, invalidate

router = APIRouter(prefix="/api", tags=["closet"])

CATEGORIES = ("top", "bottom", "layer", "dress", "shoes", "accessory")
STATUSES = ("active", "for_sale", "donate", "keepsake", "archived")
MAX_FILES_PER_REQUEST = 6


def _near_duplicate(db: Session, user_id: uuid.UUID, category: str, color_hex: str, ph: str, emb: np.ndarray) -> dict | None:
    rows = db.execute(select(Garment.id, Garment.name, Garment.phash, Garment.color_hex, Garment.embedding)
                      .where(Garment.user_id == user_id, Garment.category == category)).all()
    for gid, name, gph, ghex, gemb in rows:
        color_close = ghex is not None and colors.delta_e(ghex, color_hex) < 12
        if (hamming(ph, gph) <= 10 and color_close) or (gemb is not None and cosine(emb, gemb) >= 0.94 and color_close):
            return {"id": str(gid), "name": name}
    return None


def draft_out(d: ScanDraft) -> dict[str, Any]:
    r = dict(d.result)
    return {
        "id": str(d.id),
        "status": "ready",
        "image_url": url_for("garments", d.image_path),
        "thumb_url": url_for("garments", d.thumb_path),
        **{k: r.get(k) for k in ("name", "category", "subtype", "category_confidence", "color_name", "color_hex", "palette",
                                 "pattern", "fiber_guess", "formality", "warmth", "seasons", "cutout_ok", "cutout_method",
                                 "needs_review", "tips", "near_duplicate", "filename", "timings")},
    }


@router.post("/scan", dependencies=[Depends(limit("scan"))])
async def scan(files: list[UploadFile] = File(...), hint: str | None = Form(default=None),
               user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(400, f"Send at most {MAX_FILES_PER_REQUEST} photos at a time.")
    if hint is not None and hint not in CATEGORIES:
        hint = None
    existing = {s for s in db.scalars(select(Garment.sha256).where(Garment.user_id == user.id))}
    existing |= {s for s in db.scalars(select(ScanDraft.sha256).where(ScanDraft.user_id == user.id))}
    results: list[dict[str, Any]] = []
    for f in files:
        data = await f.read()
        name = (f.filename or "photo")[:120]
        try:
            img = validate_upload(data)
        except HTTPException as exc:
            results.append({"status": "error", "filename": name, "error": exc.detail})
            continue
        digest = sha256(data)
        if digest in existing:
            results.append({"status": "duplicate", "filename": name,
                            "error": "This exact photo is already in your closet or in this batch, so it was skipped."})
            continue
        existing.add(digest)
        result, cut, emb = await asyncio.to_thread(scan_image, img, hint)
        draft_id = uuid.uuid4()
        base = f"{user.id}/drafts/{draft_id}"
        if cut.ok:
            main = encode_png(fit(cut.image, 1024))
            main_path, ctype = f"{base}/cutout.png", "image/png"
        else:
            main = encode_jpeg(fit(cut.image, 1024))
            main_path, ctype = f"{base}/photo.jpg", "image/jpeg"
        thumb = encode_webp(fit(cut.image, 360))
        size = store_file(db, user.profile, "garments", main_path, main, ctype)
        size += store_file(db, user.profile, "garments", f"{base}/thumb.webp", thumb, "image/webp")
        ph = dhash(cut.image)
        payload = result.to_dict()
        payload["filename"] = name
        payload["near_duplicate"] = _near_duplicate(db, user.id, result.category, result.color_hex, ph, emb)
        d = ScanDraft(id=draft_id, user_id=user.id, result=payload, image_path=main_path, thumb_path=f"{base}/thumb.webp",
                      embedding=emb.tolist(), sha256=digest, phash=ph, bytes=size)
        db.add(d)
        db.flush()
        results.append(draft_out(d))
    return {"results": results}


@router.get("/drafts")
def list_drafts(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(ScanDraft).where(ScanDraft.user_id == user.id).order_by(ScanDraft.created_at))
    return [draft_out(d) for d in rows]


def _discard_draft(db: Session, user: CurrentUser, d: ScanDraft) -> None:
    release_files(db, user.profile, "garments", [d.image_path, d.thumb_path], d.bytes)
    db.delete(d)


@router.delete("/drafts/{draft_id}", status_code=204)
def delete_draft(draft_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    d = db.scalar(select(ScanDraft).where(ScanDraft.id == draft_id, ScanDraft.user_id == user.id))
    if d is None:
        raise HTTPException(404, "That draft was already saved or discarded.")
    _discard_draft(db, user, d)


class Fiber(BaseModel):
    fiber: str = Field(max_length=40)
    percent: int | None = Field(default=None, ge=0, le=100)


class GarmentFields(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: Literal["top", "bottom", "layer", "dress", "shoes", "accessory"]
    subtype: str | None = Field(default=None, max_length=40)
    color_name: str | None = Field(default=None, max_length=30)
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    pattern: Literal["solid", "patterned"] = "solid"
    formality: int = Field(default=1, ge=1, le=3)
    warmth: int = Field(default=2, ge=1, le=3)
    seasons: list[Literal["spring", "summer", "autumn", "winter"]] = []
    fiber_content: list[Fiber] = []
    price: float | None = Field(default=None, ge=0, le=100000)
    purchased_on: date | None = None


class SaveDraft(GarmentFields):
    draft_id: uuid.UUID
    reviewed: bool = True


def _apply_color(g: Garment, color_name: str | None, color_hex: str | None) -> None:
    if color_hex:
        g.color_hex = color_hex.upper()
    if color_name:
        g.color_name = color_name
        if not color_hex:
            g.color_hex = next((h for n, h, _ in colors.PALETTE if n == color_name), g.color_hex)
    if g.color_hex:
        h, s, v = colors.hsv(g.color_hex)
        g.hue, g.sat, g.val = h, s, v


@router.post("/garments", status_code=201)
def save_draft(body: SaveDraft, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    d = db.scalar(select(ScanDraft).where(ScanDraft.id == body.draft_id, ScanDraft.user_id == user.id))
    if d is None:
        raise HTTPException(404, "That draft was already saved or discarded.")
    gid = uuid.uuid4()
    store = get_storage()
    ext = "png" if d.image_path.endswith(".png") else "jpg"
    new_image, new_thumb = f"{user.id}/{gid}/cutout.{ext}", f"{user.id}/{gid}/thumb.webp"
    store.put("garments", new_image, store.get("garments", d.image_path), "image/png" if ext == "png" else "image/jpeg")
    store.put("garments", new_thumb, store.get("garments", d.thumb_path), "image/webp")
    store.delete("garments", [d.image_path, d.thumb_path])
    r = d.result
    g = Garment(
        id=gid, user_id=user.id, name=body.name.strip(), category=body.category, subtype=body.subtype or r.get("subtype"),
        pattern=body.pattern, formality=body.formality, warmth=body.warmth,
        seasons=body.seasons or SEASONS_BY_WARMTH[body.warmth], fiber_content=[f.model_dump() for f in body.fiber_content],
        care={}, price=body.price, purchased_on=body.purchased_on, status="active", image_path=new_image, thumb_path=new_thumb,
        cutout_ok=bool(r.get("cutout_ok", True)), embedding=d.embedding, sha256=d.sha256, phash=d.phash, bytes=d.bytes,
        needs_review=bool(r.get("needs_review")) and not body.reviewed,
    )
    g.color_hex = r.get("color_hex")
    _apply_color(g, body.color_name or r.get("color_name"), body.color_hex if body.color_hex != r.get("color_hex") else None)
    db.add(g)
    db.delete(d)
    db.flush()
    invalidate(user.profile)
    return garment_out(g, full=True)


@router.get("/garments")
def list_garments(q: str | None = None, category: str | None = None, sort: str = "recent", status: str | None = None,
                  user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    query = select(Garment).where(Garment.user_id == user.id)
    if category and category != "all":
        query = query.where(Garment.category == category)
    if status == "all":
        pass
    elif status:
        query = query.where(Garment.status == status)
    if q:
        like = f"%{q.strip().lower()}%"
        query = query.where(or_(func.lower(Garment.name).like(like), func.lower(Garment.color_name).like(like),
                                func.lower(Garment.subtype).like(like)))
    garments = list(db.scalars(query.order_by(Garment.created_at.desc(), Garment.id)))
    stats = wear_stats(db, user.id)
    vers = get_versatility(db, user.profile)["counts"]
    items = [garment_out(g, stats.get(g.id), vers.get(str(g.id), 0)) for g in garments]
    if sort == "least_worn":
        items.sort(key=lambda x: (x["wear_count"], x["last_worn"] or ""))
    elif sort == "most_worn":
        items.sort(key=lambda x: (-x["wear_count"], x["name"]))
    counts = dict(db.execute(select(Garment.category, func.count()).where(Garment.user_id == user.id).group_by(Garment.category)).all())
    return {"items": items, "category_counts": counts, "total": sum(counts.values())}


@router.get("/garments/{garment_id}")
def garment_detail(garment_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    g = get_owned_garment(db, user.id, garment_id)
    st = wear_stats(db, user.id, [g.id]).get(g.id)
    vers = get_versatility(db, user.profile)["counts"].get(str(g.id), 0)
    out = garment_out(g, st, vers, full=True)
    logs = db.execute(select(WearLog, Outfit.occasion).outerjoin(Outfit, Outfit.id == WearLog.outfit_id)
                      .where(WearLog.garment_id == g.id, WearLog.user_id == user.id).order_by(WearLog.worn_on.desc())).all()
    out["wear_history"] = [{"id": str(w.id), "worn_on": w.worn_on.isoformat(), "source": w.source,
                            "outfit_id": str(w.outfit_id) if w.outfit_id else None, "occasion": occ} for w, occ in logs]
    out["saved_outfit_count"] = db.scalar(select(func.count()).select_from(OutfitItem).join(Outfit, Outfit.id == OutfitItem.outfit_id)
                                          .where(OutfitItem.garment_id == g.id, Outfit.saved.is_(True))) or 0
    out["care_advice"] = advice(g.care)
    days = user.profile.nudge_days
    last = out["last_worn"]
    ref = date.fromisoformat(last) if last else (g.created_at.date() if g.created_at else date.today())
    idle = (date.today() - ref).days
    out["nudge"] = {"due": g.status == "active" and idle >= days, "idle_days": idle, "threshold": days, "never_worn": last is None}
    out["resale_links"] = resale_links(g.name)
    return out


def resale_links(name: str) -> list[dict[str, str]]:
    from urllib.parse import quote_plus

    q = quote_plus(name)
    return [
        {"label": "Search Vinted", "url": f"https://www.vinted.com/catalog?search_text={q}"},
        {"label": "Search eBay", "url": f"https://www.ebay.com/sch/i.html?_nkw={q}"},
        {"label": "Search Depop", "url": f"https://www.depop.com/search/?q={q}"},
    ]


class Care(BaseModel):
    wash: Literal["cold", "30", "40", "60", "hand", "no"] | None = None
    dry: Literal["tumble_low", "tumble", "line", "flat", "no_tumble"] | None = None
    iron: Literal["low", "medium", "high", "no"] | None = None
    dry_clean: bool | None = None


class GarmentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    category: Literal["top", "bottom", "layer", "dress", "shoes", "accessory"] | None = None
    subtype: str | None = Field(default=None, max_length=40)
    color_name: str | None = Field(default=None, max_length=30)
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    pattern: Literal["solid", "patterned"] | None = None
    formality: int | None = Field(default=None, ge=1, le=3)
    warmth: int | None = Field(default=None, ge=1, le=3)
    seasons: list[Literal["spring", "summer", "autumn", "winter"]] | None = None
    fiber_content: list[Fiber] | None = None
    care: Care | None = None
    price: float | None = Field(default=None, ge=0, le=100000)
    purchased_on: date | None = None
    status: Literal["active", "for_sale", "donate", "keepsake", "archived"] | None = None
    needs_review: bool | None = None
    clear_price: bool = False
    clear_purchased_on: bool = False


@router.patch("/garments/{garment_id}")
def update_garment(garment_id: uuid.UUID, body: GarmentPatch, user: CurrentUser = Depends(current_user),
                   db: Session = Depends(get_db)) -> dict:
    g = get_owned_garment(db, user.id, garment_id)
    data = body.model_dump(exclude_unset=True)
    for key in ("name", "category", "subtype", "pattern", "formality", "warmth", "seasons", "price", "purchased_on", "status", "needs_review"):
        if key in data and data[key] is not None:
            setattr(g, key, data[key].strip() if key == "name" else data[key])
    if "fiber_content" in data and data["fiber_content"] is not None:
        g.fiber_content = data["fiber_content"]
    if "care" in data and data["care"] is not None:
        g.care = clean_care(data["care"])
    if body.clear_price:
        g.price = None
    if body.clear_purchased_on:
        g.purchased_on = None
    if "color_name" in data or "color_hex" in data:
        _apply_color(g, data.get("color_name"), data.get("color_hex"))
    if {"category", "color_name", "color_hex", "pattern", "formality", "status"} & set(data):
        invalidate(user.profile)
        if "category" in data:
            g.needs_review = False
    g.updated_at = datetime.now().astimezone()
    db.flush()
    return garment_detail(garment_id, user, db)


@router.delete("/garments/{garment_id}", status_code=204)
def delete_garment(garment_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    g = get_owned_garment(db, user.id, garment_id)
    release_files(db, user.profile, "garments", [g.image_path, g.thumb_path, g.original_path, g.care_label_path], g.bytes)
    db.delete(g)
    invalidate(user.profile)


@router.post("/garments/{garment_id}/care-label", dependencies=[Depends(limit("scan"))])
async def scan_care_label(garment_id: uuid.UUID, file: UploadFile = File(...), user: CurrentUser = Depends(current_user),
                          db: Session = Depends(get_db)) -> dict:
    from ..llm import get_provider

    g = get_owned_garment(db, user.id, garment_id)
    data = await file.read()
    img = validate_upload(data)
    provider = get_provider()
    if not provider.can_read_labels:
        raise HTTPException(503, "Reading care labels needs an AI provider, and none is set up. Fill in the care fields by hand.")
    jpeg = encode_jpeg(fit(img, 1400))
    try:
        fields = await asyncio.to_thread(provider.read_label, jpeg)
    except Exception as exc:
        raise HTTPException(502, "The care label could not be read. Try a sharper photo, or fill in the fields by hand.") from exc
    care = clean_care(fields.get("care") or {})
    fibers = [f for f in fields.get("fiber_content") or [] if isinstance(f, dict) and f.get("fiber")]
    return {"care": care, "fiber_content": fibers[:6], "care_advice": advice(care), "garment_id": str(g.id)}
