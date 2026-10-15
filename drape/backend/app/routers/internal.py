"""Scheduled jobs, called hourly by GitHub Actions with a secret header."""
from __future__ import annotations

import hmac
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Profile, Review, ScanDraft, WaitingItem
from ..notify import notify
from ..storage import get_storage

router = APIRouter(prefix="/internal", tags=["internal"])


def check_secret(x_cron_secret: str = Header(default="")) -> None:
    secret = get_settings().internal_cron_secret
    if not secret or not hmac.compare_digest(secret, x_cron_secret):
        raise HTTPException(403, "Forbidden")


def run_due(db: Session, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    due = list(db.scalars(select(WaitingItem).where(WaitingItem.notified_at.is_(None), WaitingItem.due_at <= now,
                                                    WaitingItem.status == "waiting").with_for_update(skip_locked=True)))
    for w in due:
        review = db.get(Review, w.review_id)
        profile = db.get(Profile, w.user_id)
        if review is None or profile is None:
            continue
        name = review.title or "the item you saved"
        notify(db, profile, "waiting_due", "Still want it?",
               f"48 hours have passed since you saved {name}. Did you buy it, skip it, or are you still thinking?",
               link=f"/review?waiting={w.id}")
        w.notified_at = now
    # study: a later purchase check for Keep browsing decisions too
    study_followups = 0
    if get_settings().study_mode:
        from ..models import StudyDecision, StudyParticipant
        from ..study_config import FOLLOWUP_HOURS

        rows = db.execute(select(StudyDecision, StudyParticipant).join(StudyParticipant, StudyParticipant.id == StudyDecision.participant_id)
                          .where(StudyDecision.decision == "keep_browsing", StudyDecision.followup_notified_at.is_(None),
                                 StudyDecision.decided_at <= now - timedelta(hours=FOLLOWUP_HOURS),
                                 StudyParticipant.withdrawn_at.is_(None))).all()
        for d, p in rows:
            review = db.get(Review, d.review_id) if d.review_id else None
            profile = db.get(Profile, p.user_id)
            if review is not None and profile is not None:
                notify(db, profile, "study_followup", "A quick question",
                       f"Two days ago you looked at {review.title or 'an item'} and kept browsing. Did you end up buying it?",
                       link=f"/review/{review.id}")
            d.followup_notified_at = now
            study_followups += 1
    # expired demo sandboxes
    demos = list(db.scalars(select(Profile).where(Profile.is_demo.is_(True), Profile.demo_expires_at < now)))
    for p in demos:
        db.delete(p)
    # scan drafts nobody saved
    store = get_storage()
    stale = list(db.scalars(select(ScanDraft).where(ScanDraft.created_at < now - timedelta(hours=24))))
    for d in stale:
        store.delete("garments", [x for x in (d.image_path, d.thumb_path) if x])
        prof = db.get(Profile, d.user_id)
        if prof:
            prof.storage_bytes = max(0, prof.storage_bytes - d.bytes)
        db.delete(d)
    db.flush()
    return {"reminders": len(due), "study_followups": study_followups, "demo_accounts_deleted": len(demos), "drafts_deleted": len(stale), "ran_at": now.isoformat()}


@router.post("/run-due", dependencies=[Depends(check_secret)])
def run_due_endpoint(db: Session = Depends(get_db)) -> dict:
    return run_due(db)
