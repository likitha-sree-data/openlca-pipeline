"""History: outfit photos, garment match review, confirmed wear logs, insights."""
from __future__ import annotations

import asyncio
import uuid
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user
from ..db import get_db
from ..images import encode_jpeg, encode_webp, fit, validate_upload
from ..models import Garment, Outfit, OutfitItem, OutfitPhoto, WearLog
from ..ratelimit import limit
from ..segment import match_regions, segment
from ..services import garments_by_id, outfits_out, owned_ids, release_files, store_file, wear_stats
from ..storage import url_for

router = APIRouter(prefix="/api", tags=["history"])
SLOT = {"top": "top", "bottom": "bottom", "layer": "layer", "dress": "dress", "shoes": "shoes", "accessory": "accessory"}
Occasion = Literal["everyday", "work", "meeting", "date", "formal", "weekend"]


def _photo_for(db: Session, user: CurrentUser, photo_id: uuid.UUID) -> OutfitPhoto:
    p = db.scalar(select(OutfitPhoto).where(OutfitPhoto.id == photo_id, OutfitPhoto.user_id == user.id))
    if p is None:
        raise HTTPException(404, "That outfit photo was not found.")
    return p


def _photo_out(db: Session, user: CurrentUser, p: OutfitPhoto) -> dict:
    outfit = db.get(Outfit, p.outfit_id)
    ids = {c["garment_id"] for d in p.detections for c in d.get("candidates", [])}
    ids |= {d["confirmed_garment_id"] for d in p.detections if d.get("confirmed_garment_id")}
    gmap = garments_by_id(db, user.id, ids)
    dets = []
    for d in p.detections:
        dd = {k: v for k, v in d.items() if k != "crop_path"}
        dd["crop_url"] = url_for("outfit-photos", d.get("crop_path"))
        dd["candidates"] = [{**c, "garment": gmap.get(c["garment_id"])} for c in d.get("candidates", []) if c["garment_id"] in gmap]
        dets.append(dd)
    return {
        "id": str(p.id),
        "outfit_id": str(p.outfit_id),
        "status": p.status,
        "keep_original": p.keep_original,
        "has_original": p.original_path is not None,
        "segmenter": p.segmenter,
        "worn_on": outfit.worn_on.isoformat() if outfit and outfit.worn_on else None,
        "occasion": outfit.occasion if outfit else None,
        "detections": dets,
        "outfit": outfits_out(db, user.id, [outfit])[0] if outfit else None,
    }


@router.post("/history/photos", status_code=201, dependencies=[Depends(limit("upload"))])
async def upload_outfit_photo(file: UploadFile = File(...), worn_on: date = Form(...), occasion: Occasion = Form("everyday"),
                              keep_original: bool | None = Form(None), user: CurrentUser = Depends(current_user),
                              db: Session = Depends(get_db)) -> dict:
    if worn_on > date.today() + timedelta(days=1):
        raise HTTPException(400, "Pick the day you wore this outfit, not a future day.")
    data = await file.read()
    img = validate_upload(data)
    img = fit(img, 1600)
    keep = user.profile.keep_original_photos if keep_original is None else keep_original
    regions, method = await asyncio.to_thread(segment, img)
    garments = [{"id": str(g.id), "name": g.name, "category": g.category, "color_hex": g.color_hex,
                 "embedding": list(g.embedding) if g.embedding is not None else None}
                for g in db.scalars(select(Garment).where(Garment.user_id == user.id, Garment.status != "archived"))]
    detections = await asyncio.to_thread(match_regions, regions, garments)

    outfit = Outfit(id=uuid.uuid4(), user_id=user.id, occasion=occasion, source="photo", saved=False, worn_on=worn_on)
    db.add(outfit)
    db.flush()
    pid = uuid.uuid4()
    base = f"{user.id}/{pid}"
    size = 0
    original_path = f"{base}/original.jpg"
    size += store_file(db, user.profile, "outfit-photos", original_path, encode_jpeg(img), "image/jpeg")  # re-encoded, no EXIF
    for d, r in zip(detections, regions):
        path = f"{base}/{d['id']}.webp"
        size += store_file(db, user.profile, "outfit-photos", path, encode_webp(fit(r.crop, 480)), "image/webp")
        d["crop_path"] = path
    photo = OutfitPhoto(id=pid, user_id=user.id, outfit_id=outfit.id, status="pending_review", detections=detections,
                        keep_original=keep, original_path=original_path, segmenter=method, bytes=size)
    db.add(photo)
    db.flush()
    return _photo_out(db, user, photo)


@router.get("/history/photos/{photo_id}")
def get_photo(photo_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return _photo_out(db, user, _photo_for(db, user, photo_id))


class MatchIn(BaseModel):
    detection_id: str
    garment_id: str | None = None  # None means "Not in my wardrobe"


class ConfirmIn(BaseModel):
    matches: list[MatchIn] = Field(max_length=12)
    extra_garment_ids: list[str] = Field(default=[], max_length=6)
    keep_original: bool | None = None


@router.post("/history/photos/{photo_id}/confirm")
def confirm_photo(photo_id: uuid.UUID, body: ConfirmIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Write wear logs only now, after the person confirmed each match."""
    p = _photo_for(db, user, photo_id)
    if p.status == "confirmed":
        raise HTTPException(409, "These matches were already confirmed.")
    known = {d["id"] for d in p.detections}
    if any(m.detection_id not in known for m in body.matches):
        raise HTTPException(400, "One of the matches does not belong to this photo.")
    chosen = [m.garment_id for m in body.matches if m.garment_id] + body.extra_garment_ids
    ids = list(dict.fromkeys(owned_ids(db, user.id, chosen)))  # validates ownership, keeps order, removes repeats
    garments = {g.id: g for g in db.scalars(select(Garment).where(Garment.id.in_(ids)))} if ids else {}
    slots: dict[str, uuid.UUID] = {}
    for gid in ids:
        slot = SLOT[garments[gid].category]
        if slot in slots and slot != "accessory":
            raise HTTPException(400, f"Two pieces were picked as the {slot}. Choose one.")
        slots[slot] = gid
    outfit = db.get(Outfit, p.outfit_id)
    now = datetime.now(UTC)
    for slot, gid in slots.items():
        db.add(OutfitItem(outfit_id=outfit.id, garment_id=gid, slot=slot))
        db.add(WearLog(user_id=user.id, garment_id=gid, outfit_id=outfit.id, worn_on=outfit.worn_on, source="photo_confirmed", confirmed_at=now))
    by_det = {m.detection_id: m.garment_id for m in body.matches}
    p.detections = [{**d, "confirmed_garment_id": by_det.get(d["id"]), "not_in_wardrobe": d["id"] in by_det and by_det[d["id"]] is None}
                    for d in p.detections]
    p.status = "confirmed"
    p.confirmed_at = now
    if body.keep_original is not None:
        p.keep_original = body.keep_original
    if not p.keep_original and p.original_path:
        release_files(db, user.profile, "outfit-photos", [p.original_path], 0)
        p.original_path = None
    db.flush()
    db.expire(outfit)
    return _photo_out(db, user, p)


@router.delete("/history/{outfit_id}", status_code=204)
def delete_entry(outfit_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    o = db.scalar(select(Outfit).where(Outfit.id == outfit_id, Outfit.user_id == user.id, Outfit.worn_on.is_not(None)))
    if o is None:
        raise HTTPException(404, "That history entry was not found.")
    photo = db.scalar(select(OutfitPhoto).where(OutfitPhoto.outfit_id == o.id))
    if photo is not None:
        paths = [photo.original_path] + [d.get("crop_path") for d in photo.detections]
        release_files(db, user.profile, "outfit-photos", paths, photo.bytes)
    for w in db.scalars(select(WearLog).where(WearLog.outfit_id == o.id, WearLog.user_id == user.id)):
        db.delete(w)
    db.delete(o)


@router.get("/history")
def history(month: str | None = None, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    q = select(Outfit).where(Outfit.user_id == user.id, Outfit.worn_on.is_not(None))
    if month:
        try:
            start = date.fromisoformat(f"{month}-01")
        except ValueError as exc:
            raise HTTPException(400, "Use a month like 2026-10.") from exc
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        q = q.where(Outfit.worn_on >= start, Outfit.worn_on < end)
    rows = list(db.scalars(q.order_by(Outfit.worn_on.desc(), Outfit.created_at.desc()).limit(200)))
    rendered = outfits_out(db, user.id, rows)
    photos = {p.outfit_id: p for p in db.scalars(select(OutfitPhoto).where(OutfitPhoto.outfit_id.in_([o.id for o in rows])))} if rows else {}
    for o, r in zip(rows, rendered):
        p = photos.get(o.id)
        r["status"] = "needs_review" if p is not None and p.status == "pending_review" else "confirmed"
        r["photo"] = {"id": str(p.id), "status": p.status, "crops": [url_for("outfit-photos", d.get("crop_path")) for d in p.detections]} if p else None
    months = sorted({o.worn_on.strftime("%Y-%m") for o in db.scalars(select(Outfit).where(Outfit.user_id == user.id, Outfit.worn_on.is_not(None)))}, reverse=True)
    return {"entries": rendered, "months": months}


@router.post("/history/{outfit_id}/resave", status_code=201)
def resave(outfit_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    o = db.scalar(select(Outfit).where(Outfit.id == outfit_id, Outfit.user_id == user.id))
    if o is None:
        raise HTTPException(404, "That outfit was not found.")
    if not o.items:
        raise HTTPException(400, "Confirm the garments in this photo first.")
    copy = Outfit(user_id=user.id, name=o.name, occasion=o.occasion, source="manual", saved=True, reasons=[])
    copy.items = [OutfitItem(garment_id=it.garment_id, slot=it.slot) for it in o.items]
    db.add(copy)
    db.flush()
    return outfits_out(db, user.id, [copy])[0]


@router.get("/wear-logs")
def wear_logs(garment_id: uuid.UUID | None = None, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    q = select(WearLog).where(WearLog.user_id == user.id)
    if garment_id:
        q = q.where(WearLog.garment_id == garment_id)
    return [{"id": str(w.id), "garment_id": str(w.garment_id), "outfit_id": str(w.outfit_id) if w.outfit_id else None,
             "worn_on": w.worn_on.isoformat(), "source": w.source, "confirmed_at": w.confirmed_at.isoformat()}
            for w in db.scalars(q.order_by(WearLog.worn_on.desc()).limit(1000))]


@router.get("/insights")
def insights(days: int = 90, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    garments = list(db.scalars(select(Garment).where(Garment.user_id == user.id, Garment.status != "archived")))
    stats = wear_stats(db, user.id)
    gmap = garments_by_id(db, user.id)
    logs = list(db.scalars(select(WearLog).where(WearLog.user_id == user.id)))
    log_ids: dict[uuid.UUID, list[str]] = defaultdict(list)
    for w in logs:
        log_ids[w.garment_id].append(str(w.id))
    cutoff = date.today() - timedelta(days=days)
    most = sorted((g for g in garments if stats.get(g.id)), key=lambda g: (-stats[g.id]["wear_count"], g.name))[:10]
    never = [g for g in garments if g.id not in stats]
    stale = [g for g in garments if g.id in stats and stats[g.id]["last_worn"] < cutoff]
    by_cat = Counter()
    for w in logs:
        g = next((x for x in garments if x.id == w.garment_id), None)
        if g is not None:
            by_cat[g.category] += 1
    cpw = sorted(({"garment": gmap[str(g.id)], "price": float(g.price), "wears": stats[g.id]["wear_count"],
                   "cost_per_wear": round(float(g.price) / stats[g.id]["wear_count"], 2)}
                  for g in garments if g.price is not None and g.id in stats), key=lambda x: x["cost_per_wear"])
    return {
        "total_wears": len(logs),
        "days": days,
        "most_worn": [{"garment": gmap[str(g.id)], "wears": stats[g.id]["wear_count"], "wear_log_ids": log_ids[g.id]} for g in most],
        "never_worn": [gmap[str(g.id)] for g in never],
        "not_worn_recently": [gmap[str(g.id)] for g in stale],
        "by_category": [{"category": c, "wears": n} for c, n in sorted(by_cat.items(), key=lambda kv: -kv[1])],
        "cost_per_wear": cpw,
        "priced_but_unworn": [gmap[str(g.id)] for g in garments if g.price is not None and g.id not in stats],
    }
