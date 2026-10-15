"""Account: export my data, delete my account, consents, color-profile photos."""
from __future__ import annotations

import io
import json
import logging
import uuid
import zipfile
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user
from ..config import get_settings
from ..db import get_db
from ..images import encode_jpeg, fit, validate_upload
from ..models import (
    AccountTombstone,
    ChatMessage,
    ColorPrefs,
    ColorProfilePhoto,
    Consent,
    Garment,
    Notification,
    Outfit,
    OutfitPhoto,
    Plan,
    Profile,
    Review,
    StudyDecision,
    StudyFollowup,
    StudyParticipant,
    WaitingItem,
    WearLog,
)
from ..ratelimit import limit
from ..scan import palette
from ..services import jsonable, release_files, store_file
from ..storage import BUCKETS, get_storage, url_for

router = APIRouter(prefix="/api/account", tags=["account"])
log = logging.getLogger("drape.account")
COLOR_PROFILE_CONSENT = "color-profile-v1"
SKIP_COLUMNS = {"embedding", "versatility_cache"}


def _row(obj: Any) -> dict[str, Any]:
    out = {}
    for col in sa_inspect(obj).mapper.column_attrs:
        if col.key in SKIP_COLUMNS:
            continue
        out[col.key] = jsonable(getattr(obj, col.key))
    return out


def collect(db: Session, uid: uuid.UUID) -> dict[str, Any]:
    def rows(model, *where):
        return [_row(r) for r in db.scalars(select(model).where(*where))]

    outfits = list(db.scalars(select(Outfit).where(Outfit.user_id == uid)))
    participant = db.scalar(select(StudyParticipant).where(StudyParticipant.user_id == uid))
    study: dict[str, Any] | None = None
    if participant:
        decisions = list(db.scalars(select(StudyDecision).where(StudyDecision.participant_id == participant.id)))
        study = {"participant": _row(participant), "decisions": [_row(d) for d in decisions],
                 "followups": [_row(f) for d in decisions for f in db.scalars(select(StudyFollowup).where(StudyFollowup.decision_id == d.id))]}
    profile = db.get(Profile, uid)
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "format": "drape-export-v1",
        "profile": _row(profile),
        "color_prefs": rows(ColorPrefs, ColorPrefs.user_id == uid),
        "garments": rows(Garment, Garment.user_id == uid),
        "outfits": [_row(o) | {"items": [_row(i) for i in o.items]} for o in outfits],
        "wear_logs": rows(WearLog, WearLog.user_id == uid),
        "outfit_photos": rows(OutfitPhoto, OutfitPhoto.user_id == uid),
        "plans": rows(Plan, Plan.user_id == uid),
        "reviews": rows(Review, Review.user_id == uid),
        "waiting_list": rows(WaitingItem, WaitingItem.user_id == uid),
        "notifications": rows(Notification, Notification.user_id == uid),
        "chat_messages": rows(ChatMessage, ChatMessage.user_id == uid),
        "consents": rows(Consent, Consent.user_id == uid),
        "color_profile_photos": rows(ColorProfilePhoto, ColorProfilePhoto.user_id == uid),
        "study": study,
    }


@router.get("/export", dependencies=[Depends(limit("export"))])
def export(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    data = collect(db, user.id)
    store = get_storage()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data.json", json.dumps(data, indent=2, default=str))
        z.writestr("README.txt", "Your Drape data. data.json holds every record linked to your account. "
                                 "The images folder holds your photos, organised by storage bucket.\n")
        for bucket in BUCKETS:
            for path in store.list_prefix(bucket, str(user.id)):
                try:
                    z.writestr(f"images/{bucket}/{path.split('/', 1)[1]}", store.get(bucket, path))
                except Exception:
                    log.warning("export skipped a missing file")
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="drape-export-{stamp}.zip"', "Cache-Control": "no-store"})


class DeleteIn(BaseModel):
    confirm: str


def delete_user_everything(db: Session, uid: uuid.UUID, is_demo: bool) -> None:
    store = get_storage()
    for bucket in BUCKETS:
        store.delete_prefix(bucket, str(uid))
    profile = db.get(Profile, uid)
    if profile is not None:
        db.delete(profile)  # cascades to every user table
    db.merge(AccountTombstone(user_id=uid, deleted_at=datetime.now(UTC)))
    db.flush()
    s = get_settings()
    if not is_demo and s.supabase_url and s.supabase_service_role_key:
        try:
            r = httpx.delete(f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users/{uid}", timeout=10,
                             headers={"Authorization": f"Bearer {s.supabase_service_role_key}", "apikey": s.supabase_service_role_key})
            if r.status_code >= 300 and r.status_code != 404:
                log.warning("supabase auth user not deleted: status %s", r.status_code)
        except httpx.HTTPError:
            log.warning("supabase auth user not deleted: network error")


@router.post("/delete", status_code=204)
def delete_account(body: DeleteIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    if body.confirm.strip().lower() != "delete my account":
        raise HTTPException(400, "Type delete my account to confirm.")
    delete_user_everything(db, user.id, user.profile.is_demo)


# ---------------------------------------------------------------- consents

class ConsentIn(BaseModel):
    kind: str
    granted: bool


@router.get("/consents")
def consents(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Consent).where(Consent.user_id == user.id).order_by(Consent.granted_at.desc()))
    return [{"id": str(c.id), "kind": c.kind, "version": c.version, "granted_at": c.granted_at.isoformat(),
             "withdrawn_at": c.withdrawn_at.isoformat() if c.withdrawn_at else None} for c in rows]


def active_consent(db: Session, uid: uuid.UUID, kind: str) -> Consent | None:
    return db.scalar(select(Consent).where(Consent.user_id == uid, Consent.kind == kind, Consent.withdrawn_at.is_(None)))


@router.post("/consents")
def set_consent(body: ConsentIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if body.kind not in ("color_profile", "email"):
        raise HTTPException(400, "Use the study page to change study consent.")
    current = active_consent(db, user.id, body.kind)
    if body.granted and current is None:
        db.add(Consent(user_id=user.id, kind=body.kind, version=COLOR_PROFILE_CONSENT if body.kind == "color_profile" else "email-v1"))
    elif not body.granted and current is not None:
        current.withdrawn_at = datetime.now(UTC)
        if body.kind == "color_profile":
            _delete_profile_photos(db, user)
    if body.kind == "email":
        user.profile.notify_email = body.granted
    db.flush()
    return {"kind": body.kind, "granted": body.granted}


# ---------------------------------------------------------------- color-profile photos (feature flag)

def _flag() -> None:
    if not get_settings().feature_color_profile:
        raise HTTPException(404, "Color-profile photos are not turned on for this server.")


def _photo_out(p: ColorProfilePhoto) -> dict:
    return {"id": str(p.id), "url": url_for("profile-photos", p.path), "palette": p.palette, "created_at": p.created_at.isoformat()}


@router.get("/color-photos")
def list_color_photos(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    _flag()
    rows = list(db.scalars(select(ColorProfilePhoto).where(ColorProfilePhoto.user_id == user.id).order_by(ColorProfilePhoto.created_at.desc())))
    return {"consented": active_consent(db, user.id, "color_profile") is not None, "photos": [_photo_out(p) for p in rows]}


@router.post("/color-photos", status_code=201, dependencies=[Depends(limit("upload"))])
async def add_color_photo(file: UploadFile = File(...), user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    _flag()
    if active_consent(db, user.id, "color_profile") is None:
        raise HTTPException(403, "Give consent for color-profile photos first.")
    img = validate_upload(await file.read())
    small = fit(img, 1200)
    pal, _, _ = palette(small, None, k=5)
    pid = uuid.uuid4()
    path = f"{user.id}/{pid}.jpg"
    size = store_file(db, user.profile, "profile-photos", path, encode_jpeg(small), "image/jpeg")
    p = ColorProfilePhoto(id=pid, user_id=user.id, path=path, palette=[c for c in pal if c["share"] >= 0.08], bytes=size)
    db.add(p)
    db.flush()
    return _photo_out(p)


@router.delete("/color-photos/{photo_id}", status_code=204)
def delete_color_photo(photo_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    _flag()
    p = db.scalar(select(ColorProfilePhoto).where(ColorProfilePhoto.id == photo_id, ColorProfilePhoto.user_id == user.id))
    if p is None:
        raise HTTPException(404, "That photo was not found.")
    release_files(db, user.profile, "profile-photos", [p.path], p.bytes)
    db.delete(p)


def _delete_profile_photos(db: Session, user: CurrentUser) -> None:
    for p in db.scalars(select(ColorProfilePhoto).where(ColorProfilePhoto.user_id == user.id)):
        release_files(db, user.profile, "profile-photos", [p.path], p.bytes)
        db.delete(p)

