from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user
from ..db import get_db
from ..models import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(100))
    return [{"id": str(n.id), "kind": n.kind, "title": n.title, "body": n.body, "link": n.link, "read": n.read_at is not None,
             "emailed": n.emailed, "created_at": n.created_at.isoformat()} for n in rows]


@router.get("/unread")
def unread(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    n = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    return {"unread": n or 0}


@router.post("/read", status_code=204)
def mark_read(ids: list[uuid.UUID] | None = None, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    q = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if ids:
        q = q.where(Notification.id.in_(ids))
    db.execute(q.values(read_at=datetime.now(UTC)))
