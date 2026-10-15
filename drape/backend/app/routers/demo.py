"""Try the demo: an expiring sandbox account with fictional data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import issue_token
from ..config import get_settings
from ..db import get_db
from ..demo.seed import DEMO_HOURS, seed_demo
from ..ratelimit import limit_ip

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/start", dependencies=[Depends(limit_ip("auth"))])
def start_demo(db: Session = Depends(get_db)) -> dict:
    if not get_settings().demo_mode:
        raise HTTPException(404, "The demo is not turned on for this server.")
    profile = seed_demo(db)
    return {"access_token": issue_token(profile.id, None, hours=DEMO_HOURS, demo=True), "user_id": str(profile.id),
            "expires_at": profile.demo_expires_at.isoformat()}
