"""Public config, sign-in helpers, profile and settings."""
from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user, ensure_profile, issue_token
from ..config import get_settings
from ..db import get_db
from ..ratelimit import limit_ip

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/config")
def public_config() -> dict:
    s = get_settings()
    return {
        "supabase_url": s.supabase_url or None,
        "supabase_anon_key": s.supabase_anon_key or None,
        "dev_login": s.auth_dev_login and not s.is_production,
        "demo_mode": s.demo_mode,
        "study_mode": s.study_mode,
        "feature_color_profile": s.feature_color_profile,
        "llm_provider": s.llm_provider,
    }


@router.get("/health")
def health() -> dict:
    return {"ok": True}


class DevLogin(BaseModel):
    email: EmailStr


@router.post("/auth/dev-login", dependencies=[Depends(limit_ip("auth"))])
def dev_login(body: DevLogin, db: Session = Depends(get_db)) -> dict:
    s = get_settings()
    if not s.auth_dev_login or s.is_production:
        raise HTTPException(404, "Not found")
    uid = uuid.uuid5(uuid.NAMESPACE_URL, f"drape-dev:{body.email.lower()}")
    ensure_profile(db, uid, body.email.lower())
    return {"access_token": issue_token(uid, body.email.lower(), hours=24 * 7), "user_id": str(uid)}


def profile_out(user: CurrentUser) -> dict:
    p = user.profile
    s = get_settings()
    return {
        "id": str(p.id),
        "email": p.email,
        "display_name": p.display_name,
        "is_admin": p.is_admin,
        "is_demo": p.is_demo,
        "demo_expires_at": p.demo_expires_at.isoformat() if p.demo_expires_at else None,
        "units": p.units,
        "nudge_days": p.nudge_days,
        "notify_in_app": p.notify_in_app,
        "notify_email": p.notify_email,
        "study_opt_in": p.study_opt_in,
        "keep_original_photos": p.keep_original_photos,
        "chat_photos_opt_in": p.chat_photos_opt_in,
        "storage_bytes": p.storage_bytes,
        "storage_quota_bytes": s.storage_quota_mb * 1024 * 1024,
        "email_available": bool(s.resend_api_key),
    }


@router.get("/me")
def me(user: CurrentUser = Depends(current_user)) -> dict:
    return profile_out(user)


class SettingsPatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    units: Literal["c", "f"] | None = None
    nudge_days: int | None = Field(default=None, ge=14, le=730)
    notify_in_app: bool | None = None
    notify_email: bool | None = None
    keep_original_photos: bool | None = None
    chat_photos_opt_in: bool | None = None


@router.patch("/me")
def update_me(body: SettingsPatch, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(user.profile, key, value)
    db.flush()
    return profile_out(user)
