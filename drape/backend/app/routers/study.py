"""Research layer. Active only when STUDY_MODE=true.

Consent comes first. Assignment is server-side blocked randomization,
stored at assignment time. Records are keyed by a pseudonymous participant
code and never hold names, emails or images.
"""
from __future__ import annotations

import random
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import study_config as cfg
from ..auth import CurrentUser, admin_user, current_user
from ..config import get_settings
from ..db import get_db
from ..models import (
    Consent,
    Review,
    StudyDecision,
    StudyEvent,
    StudyFollowup,
    StudyParticipant,
    StudyState,
    StudyTaskTimer,
)

router = APIRouter(prefix="/api", tags=["study"])
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def study_on() -> None:
    if not get_settings().study_mode:
        raise HTTPException(404, "The study is not running on this server.")


def design() -> str:
    d = cfg.DESIGN if cfg.DESIGN in cfg.DESIGNS else "between_subject"
    return d


def block_arms(block: int, d: str | None = None) -> list[str]:
    arms = cfg.ARMS[d or design()]
    size = cfg.BLOCK_SIZE if cfg.BLOCK_SIZE % len(arms) == 0 else len(arms) * 2
    seq = arms * (size // len(arms))
    random.Random(f"{cfg.SEED}:{d or design()}:{block}").shuffle(seq)
    return seq


def allocate(db: Session) -> tuple[int, int, str]:
    """Next slot in the blocked sequence. The row lock keeps concurrent sign-ups balanced."""
    state = db.scalar(select(StudyState).where(StudyState.id == 1).with_for_update())
    if state is None:
        state = StudyState(id=1, next_index=0)
        db.add(state)
        db.flush()
    i = state.next_index
    state.next_index = i + 1
    arms = block_arms(0)
    size = len(arms)
    block, pos = divmod(i, size)
    return i, block, block_arms(block)[pos]


def active_participant(db: Session, user_id: uuid.UUID) -> StudyParticipant | None:
    if not get_settings().study_mode:
        return None
    p = db.scalar(select(StudyParticipant).where(StudyParticipant.user_id == user_id))
    return p if p is not None and p.withdrawn_at is None else None


def condition_for_next_review(db: Session, user: CurrentUser) -> str:
    """Treatment for anyone outside the study. Inside it, the stored assignment decides."""
    p = active_participant(db, user.id)
    if p is None:
        return "treatment"
    trial = p.review_count
    p.review_count = trial + 1
    if p.design == "between_subject":
        return p.arm
    first, second = ("control", "treatment") if p.arm == "AB" else ("treatment", "control")
    return first if trial % 2 == 0 else second


def log_event(db: Session, p: StudyParticipant, event: str, review: Review | None = None, **payload) -> None:
    db.add(StudyEvent(participant_id=p.id, review_id=review.id if review else None,
                      condition=review.condition if review else None, event=event, payload=payload))


def study_info(db: Session, user_id: uuid.UUID, review: Review) -> dict | None:
    p = active_participant(db, user_id)
    if p is None:
        return None
    d = db.scalar(select(StudyDecision).where(StudyDecision.review_id == review.id))
    needs_followup = False
    if d is not None:
        has_followup = db.scalar(select(StudyFollowup.id).where(StudyFollowup.decision_id == d.id)) is not None
        needs_followup = not has_followup and d.decided_at <= datetime.now(UTC) - timedelta(hours=cfg.FOLLOWUP_HOURS)
    return {"needs_questions": review.decision is None, "needs_followup": needs_followup,
            "decision_id": str(d.id) if d else None}


# ---------------------------------------------------------------- participant endpoints

@router.get("/study")
def study_status(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    study_on()
    p = db.scalar(select(StudyParticipant).where(StudyParticipant.user_id == user.id))
    return {
        "consent_version": cfg.CONSENT_VERSION,
        "consent_text": cfg.CONSENT_FILE.read_text(encoding="utf-8"),
        "enrolled": p is not None and p.withdrawn_at is None,
        "withdrawn": p is not None and p.withdrawn_at is not None,
        "participant_code": p.code if p else None,
        "reasons": [{"id": k, "label": v} for k, v in cfg.REASONS],
        "confidence_scale": cfg.CONFIDENCE_SCALE,
        "still_want_scale": cfg.STILL_WANT_SCALE,
        "tasks": list(cfg.TASKS),
    }


class ConsentIn(BaseModel):
    version: str
    agree: bool


@router.post("/study/consent")
def give_consent(body: ConsentIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    study_on()
    if not body.agree:
        raise HTTPException(400, "Tick the box to show you agree before joining.")
    if body.version != cfg.CONSENT_VERSION:
        raise HTTPException(409, "The consent text changed. Reload the page and read the new version.")
    p = db.scalar(select(StudyParticipant).where(StudyParticipant.user_id == user.id))
    if p is not None and p.withdrawn_at is None:
        return {"enrolled": True, "participant_code": p.code}
    if p is not None:
        raise HTTPException(409, "You left the study earlier, so you cannot rejoin with this account.")
    i, block, arm = allocate(db)
    p = StudyParticipant(user_id=user.id, code="P" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6)), design=design(),
                         alloc_index=i, block_index=block, arm=arm, consent_version=cfg.CONSENT_VERSION)
    db.add(p)
    db.add(Consent(user_id=user.id, kind="study", version=cfg.CONSENT_VERSION))
    user.profile.study_opt_in = True
    db.flush()
    log_event(db, p, "consented", version=cfg.CONSENT_VERSION)
    return {"enrolled": True, "participant_code": p.code}


class WithdrawIn(BaseModel):
    delete_data: bool = False


@router.post("/study/withdraw")
def withdraw(body: WithdrawIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    study_on()
    p = db.scalar(select(StudyParticipant).where(StudyParticipant.user_id == user.id))
    if p is None:
        raise HTTPException(404, "You are not in the study.")
    now = datetime.now(UTC)
    for c in db.scalars(select(Consent).where(Consent.user_id == user.id, Consent.kind == "study", Consent.withdrawn_at.is_(None))):
        c.withdrawn_at = now
    user.profile.study_opt_in = False
    if body.delete_data:
        db.delete(p)  # cascades to decisions, follow-ups, events and timers
        db.flush()
        # keep the allocation slot used so the sequence stays balanced; the row itself is gone
        return {"withdrawn": True, "data_deleted": True}
    p.withdrawn_at = now
    log_event(db, p, "withdrew")
    return {"withdrawn": True, "data_deleted": False}


class StudyDecisionIn(BaseModel):
    decision: Literal["save", "keep_browsing"]
    reasons: list[str] = Field(default=[], max_length=7)
    reason_other: str | None = Field(default=None, max_length=300)
    confidence: int = Field(ge=1, le=7)
    shown_at: datetime | None = None


def record_study_decision(db: Session, user: CurrentUser, review: Review, body: StudyDecisionIn) -> None:
    p = active_participant(db, user.id)
    if p is None:
        return
    valid = {k for k, _ in cfg.REASONS}
    reasons = [r for r in dict.fromkeys(body.reasons) if r in valid]
    if "other" in reasons and not (body.reason_other or "").strip():
        raise HTTPException(400, "Say a few words for Other, or untick it.")
    first_view = db.scalar(select(StudyEvent.created_at).where(StudyEvent.review_id == review.id, StudyEvent.event == "review_viewed")
                           .order_by(StudyEvent.created_at).limit(1))
    shown = first_view or review.created_at
    decided = review.decided_at or datetime.now(UTC)
    trial = db.scalar(select(StudyDecision.trial_index).where(StudyDecision.participant_id == p.id).order_by(StudyDecision.trial_index.desc()).limit(1))
    db.add(StudyDecision(
        participant_id=p.id, review_id=review.id, trial_index=(trial or 0) + 1, condition=review.condition,
        decision=body.decision, reasons=reasons, reason_other=(body.reason_other or "").strip() or None, confidence=body.confidence,
        shown_at=shown, decided_at=decided, time_on_page_ms=max(0, int((decided - shown).total_seconds() * 1000)),
        similar_count=len(review.similar or []), new_outfit_count=review.new_outfit_count,
    ))
    log_event(db, p, "decided", review, decision=body.decision)


def record_view(db: Session, user_id: uuid.UUID, review: Review) -> None:
    p = active_participant(db, user_id)
    if p is not None and review.decision is None:
        log_event(db, p, "review_viewed", review)


class FollowupIn(BaseModel):
    bought: Literal["yes", "no", "unsure"]
    still_want: int | None = Field(default=None, ge=1, le=7)


def save_followup(db: Session, user_id: uuid.UUID, review: Review, bought: str, still_want: int | None) -> None:
    p = active_participant(db, user_id)
    if p is None:
        return
    d = db.scalar(select(StudyDecision).where(StudyDecision.review_id == review.id, StudyDecision.participant_id == p.id))
    if d is None:
        return
    f = db.scalar(select(StudyFollowup).where(StudyFollowup.decision_id == d.id))
    if f is None:
        db.add(StudyFollowup(decision_id=d.id, bought=bought, still_want=still_want))
    else:
        f.bought, f.still_want = bought, still_want
    log_event(db, p, "followup", review, bought=bought)


@router.post("/study/reviews/{review_id}/followup")
def followup(review_id: uuid.UUID, body: FollowupIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    study_on()
    r = db.scalar(select(Review).where(Review.id == review_id, Review.user_id == user.id))
    if r is None:
        raise HTTPException(404, "That item was not found.")
    save_followup(db, user.id, r, body.bought, body.still_want)
    return {"ok": True}


class TimerIn(BaseModel):
    task: Literal["setup", "outfit_choice", "purchase_review", "photo_matching"]
    action: Literal["start", "stop"]
    completed: bool | None = None


@router.post("/study/timers")
def timer(body: TimerIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    study_on()
    p = active_participant(db, user.id)
    if p is None:
        raise HTTPException(403, "Join the study first.")
    now = datetime.now(UTC)
    open_t = db.scalar(select(StudyTaskTimer).where(StudyTaskTimer.participant_id == p.id, StudyTaskTimer.task == body.task,
                                                    StudyTaskTimer.ended_at.is_(None)))
    if body.action == "start":
        if open_t is None:
            open_t = StudyTaskTimer(participant_id=p.id, task=body.task, started_at=now)
            db.add(open_t)
    else:
        if open_t is None:
            raise HTTPException(400, "That timer is not running.")
        open_t.ended_at = now
        open_t.completed = body.completed
    db.flush()
    return {"task": body.task, "running": open_t.ended_at is None, "started_at": open_t.started_at.isoformat(),
            "seconds": int(((open_t.ended_at or now) - open_t.started_at).total_seconds())}


# ---------------------------------------------------------------- admin

@router.get("/admin/study/summary")
def summary(user: CurrentUser = Depends(admin_user), db: Session = Depends(get_db)) -> dict:
    from ..study_export import summarize

    return summarize(db)


@router.get("/admin/study/export")
def export(kind: Literal["long", "wide"] = "wide", user: CurrentUser = Depends(admin_user), db: Session = Depends(get_db)):
    from fastapi.responses import Response

    from ..study_export import to_csv

    stamp = datetime.now(UTC).strftime("%Y%m%d")
    return Response(to_csv(db, kind), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="drape-study-{kind}-{stamp}.csv"', "Cache-Control": "no-store"})
