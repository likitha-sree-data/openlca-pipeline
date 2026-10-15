"""Authentication.

Two token issuers are accepted:
  * Supabase Auth (magic link). Verified with the project JWKS (asymmetric
    signing keys) or the legacy HS256 JWT secret.
  * Drape itself, for demo sandboxes and the dev sign-in used in tests.
    HS256 with APP_SECRET and issuer "drape".
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AccountTombstone, ColorPrefs, Profile

DRAPE_ISSUER = "drape"


@dataclass
class CurrentUser:
    id: uuid.UUID
    email: str | None
    profile: Profile


def issue_token(user_id: uuid.UUID, email: str | None, hours: int = 24, demo: bool = False) -> str:
    now = datetime.now(UTC)
    claims = {
        "iss": DRAPE_ISSUER,
        "sub": str(user_id),
        "email": email,
        "aud": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=hours)).timestamp()),
        "demo": demo,
    }
    return jwt.encode(claims, get_settings().app_secret, algorithm="HS256")


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


def verify_token(token: str) -> dict:
    s = get_settings()
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Your session is not valid. Sign in again.") from exc

    try:
        if unverified.get("iss") == DRAPE_ISSUER:
            return jwt.decode(token, s.app_secret, algorithms=["HS256"], audience="authenticated", issuer=DRAPE_ISSUER)
        alg = header.get("alg", "")
        issuer = f"{s.supabase_url.rstrip('/')}/auth/v1" if s.supabase_url else None
        if alg == "HS256":
            if not s.supabase_jwt_secret:
                raise HTTPException(401, "Supabase JWT secret is not configured on the server.")
            return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience=s.supabase_jwt_audience, issuer=issuer)
        if alg in ("ES256", "RS256", "EdDSA"):
            if not s.supabase_url:
                raise HTTPException(401, "Supabase URL is not configured on the server.")
            key = _jwks_client(f"{s.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json").get_signing_key_from_jwt(token)
            return jwt.decode(token, key.key, algorithms=[alg], audience=s.supabase_jwt_audience, issuer=issuer)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "Your session expired. Sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Your session is not valid. Sign in again.") from exc
    raise HTTPException(401, "Your session is not valid. Sign in again.")


def ensure_profile(db: Session, user_id: uuid.UUID, email: str | None) -> Profile:
    profile = db.get(Profile, user_id)
    if profile is None:
        s = get_settings()
        profile = Profile(id=user_id, email=email, is_admin=bool(email and email.lower() in s.admin_email_set), taste={})
        db.add(profile)
        db.flush()
        db.add(ColorPrefs(user_id=user_id, favorites=[], avoid=[]))
        db.flush()
    elif email and profile.email != email:
        profile.email = email
    return profile


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    raise HTTPException(401, "Sign in to continue.")


def current_user(request: Request, db: Session = Depends(get_db)) -> CurrentUser:
    claims = verify_token(_bearer(request))
    try:
        uid = uuid.UUID(claims["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(401, "Your session is not valid. Sign in again.") from exc
    tomb = db.get(AccountTombstone, uid)
    if tomb is not None and claims.get("iat", 0) <= tomb.deleted_at.timestamp():
        raise HTTPException(401, "This account was deleted. Sign in again to start fresh.")
    profile = ensure_profile(db, uid, claims.get("email"))
    if profile.is_demo and profile.demo_expires_at and profile.demo_expires_at < datetime.now(UTC):
        raise HTTPException(401, "This demo has expired. Start a new one from the sign-in page.")
    request.state.user_id = str(uid)
    return CurrentUser(id=uid, email=claims.get("email"), profile=profile)


def admin_user(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if not user.profile.is_admin:
        raise HTTPException(403, "This page is for study admins.")
    return user
