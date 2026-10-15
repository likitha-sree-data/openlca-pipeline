"""Review ("Before you buy."): compare a possible purchase with the wardrobe."""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import colors
from ..auth import CurrentUser, current_user
from ..config import get_settings
from ..db import get_db
from ..embed import cosine, get_embedder
from ..engine import Piece, new_outfit_count, works_with
from ..images import encode_jpeg, encode_png, fit, validate_upload
from ..models import Garment, Profile, Review, WaitingItem
from ..ratelimit import limit
from ..scan import SUBTYPE_TRAITS, scan_image
from ..services import garments_by_id, load_pieces, release_files, store_file
from ..ssrf import IMAGE_CAP, FetchBlocked, FetchFailed, parse_product, safe_fetch
from ..storage import url_for

router = APIRouter(prefix="/api", tags=["review"])
WAIT_HOURS = 48
FAMILY = {"top": "upper", "layer": "upper", "bottom": "lower", "dress": "dress", "shoes": "shoes", "accessory": "accessory"}
SIMILAR_THRESHOLD = 0.62


def similar_pieces(garments: list[Garment], category: str, color_hex: str, emb: np.ndarray | list[float], limit_n: int = 3) -> list[dict[str, Any]]:
    fam = FAMILY.get(category)
    out = []
    for g in garments:
        if FAMILY.get(g.category) != fam or g.status == "archived":
            continue
        sim = max(0.0, cosine(emb, g.embedding))
        dE = colors.delta_e(color_hex, g.color_hex) if g.color_hex else 60.0
        color_sim = max(0.0, 1 - dE / 40)
        score = 0.5 * sim + 0.5 * color_sim
        if score < SIMILAR_THRESHOLD:
            continue
        same_kind = g.category == category
        if color_sim > 0.7:
            reason = "Similar color and purpose" if same_kind or fam == "upper" else "Similar color"
        else:
            reason = "Similar shape and purpose"
        out.append({"garment_id": str(g.id), "score": round(score, 3), "reason": reason})
    out.sort(key=lambda x: -x["score"])
    return out[:limit_n]


def analyse(db: Session, user_id: uuid.UUID, category: str, subtype: str | None, color_name: str, color_hex: str,
            pattern: str, emb: np.ndarray | list[float], formality: int | None = None, warmth: int | None = None) -> dict[str, Any]:
    garments = list(db.scalars(select(Garment).where(Garment.user_id == user_id)))
    sim = similar_pieces(garments, category, color_hex, emb)
    pieces, _ = load_pieces(db, user_id)
    f, w = SUBTYPE_TRAITS.get(subtype or "", (formality or 1, warmth or 2))
    cand = Piece("candidate", "Candidate", category, color_name, color_hex, pattern, formality or f, warmth or w, subtype=subtype)
    if category in ("top", "bottom", "layer", "dress", "shoes"):
        partners = works_with(pieces, cand, limit=9)
        count = new_outfit_count(pieces, cand)
    else:
        partners, count = [], 0
    similar_ids = {s["garment_id"] for s in sim}
    return {"similar": sim, "works_with_ids": [pid for pid, _ in partners if pid not in similar_ids][:6], "new_outfit_count": count}


def review_out(db: Session, user: CurrentUser, r: Review) -> dict[str, Any]:
    ids = {s["garment_id"] for s in r.similar} | {str(i) for i in r.works_with_ids}
    gmap = garments_by_id(db, user.id, ids)
    w = r.waiting
    show_wardrobe = r.condition == "treatment"
    now = datetime.now(UTC)
    return {
        "id": str(r.id),
        "title": r.title,
        "source_url": r.source_url,
        "price": float(r.price) if r.price is not None else None,
        "image_url": url_for("review-items", r.image_path),
        "cutout_ok": bool((r.scan or {}).get("cutout_ok", True)),
        "category": r.category,
        "color": r.color,
        "color_hex": r.color_hex,
        "condition": r.condition,
        "decision": r.decision,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "similar": [{**s, "garment": gmap.get(s["garment_id"])} for s in r.similar if s["garment_id"] in gmap] if show_wardrobe else None,
        "works_with": [gmap[str(i)] for i in r.works_with_ids if str(i) in gmap] if show_wardrobe else None,
        "new_outfit_count": r.new_outfit_count if show_wardrobe else None,
        "study": _study(db, user, r),
        "waiting": None if w is None else {
            "id": str(w.id), "saved_at": w.saved_at.isoformat(), "due_at": w.due_at.isoformat(), "status": w.status,
            "note": w.note, "due": w.due_at <= now, "seconds_left": max(0, int((w.due_at - now).total_seconds())),
            "answered_at": w.answered_at.isoformat() if w.answered_at else None,
        },
    }


def _study(db: Session, user: CurrentUser, r: Review) -> dict[str, Any] | None:
    if not get_settings().study_mode:
        return None
    from .study import study_info

    return study_info(db, user.id, r)


def _price(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        d = Decimal(value.replace(",", ".").strip())
    except InvalidOperation as exc:
        raise HTTPException(400, "Enter the price as a number, like 65 or 65.50.") from exc
    if d < 0 or d > 100000:
        raise HTTPException(400, "Enter a price between 0 and 100000.")
    return d.quantize(Decimal("0.01"))


def _condition_for(db: Session, user: CurrentUser) -> str:
    """Treatment unless study mode assigns this person a condition."""
    if not get_settings().study_mode:
        return "treatment"
    try:
        from .study import condition_for_next_review
    except ImportError:
        return "treatment"
    return condition_for_next_review(db, user)


@router.post("/reviews", status_code=201, dependencies=[Depends(limit("fetch"))])
async def create_review(file: UploadFile | None = File(None), url: str | None = Form(None), title: str | None = Form(None),
                        price: str | None = Form(None), user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if file is None and not url:
        raise HTTPException(400, "Add a photo or paste a product link.")
    source_url, page_title, page_price = None, None, None
    if file is not None:
        data = await file.read()
    else:
        try:
            page = await asyncio.to_thread(safe_fetch, url)
            source_url = page.url
            if page.content_type.startswith("image/"):
                data = page.content
            else:
                info = parse_product(page.content, page.url)
                page_title, page_price = info["title"], info["price"]
                if not info["image"]:
                    raise HTTPException(422, "That page has no product image Drape can read. Add a screenshot or photo instead.")
                img = await asyncio.to_thread(safe_fetch, info["image"], IMAGE_CAP, accept="image/*")
                data = img.content
        except FetchBlocked as exc:
            raise HTTPException(400, str(exc)) from exc
        except FetchFailed as exc:
            raise HTTPException(422, str(exc)) from exc
    img = validate_upload(data)
    result, cut, emb = await asyncio.to_thread(scan_image, img, None)
    stats = analyse(db, user.id, result.category, result.subtype, result.color_name, result.color_hex, result.pattern, emb)
    rid = uuid.uuid4()
    if cut.ok:
        path, payload, ctype = f"{user.id}/{rid}/item.png", encode_png(fit(cut.image, 900)), "image/png"
    else:
        path, payload, ctype = f"{user.id}/{rid}/item.jpg", encode_jpeg(fit(cut.image, 900)), "image/jpeg"
    size = store_file(db, user.profile, "review-items", path, payload, ctype)
    name = (title or page_title or f"{result.color_name} {result.subtype}".capitalize()).strip()[:120]
    r = Review(id=rid, user_id=user.id, source_url=source_url, title=name, price=_price(price) if price else _price(page_price),
               image_path=path, category=result.category, color=result.color_name, color_hex=result.color_hex,
               scan=result.to_dict(), embedding=emb.tolist(), similar=stats["similar"],
               similar_ids=[uuid.UUID(s["garment_id"]) for s in stats["similar"]],
               works_with_ids=[uuid.UUID(i) for i in stats["works_with_ids"]], new_outfit_count=stats["new_outfit_count"],
               condition=_condition_for(db, user), bytes=size)
    db.add(r)
    db.flush()
    return review_out(db, user, r)


class ReviewPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: Literal["top", "bottom", "layer", "dress", "shoes", "accessory"] | None = None
    price: float | None = Field(default=None, ge=0, le=100000)


@router.patch("/reviews/{review_id}")
def update_review(review_id: uuid.UUID, body: ReviewPatch, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Fix the name or category. Changing the category recomputes the comparison."""
    r = _owned(db, user, review_id)
    if body.title:
        r.title = body.title.strip()
    if body.price is not None:
        r.price = Decimal(str(body.price)).quantize(Decimal("0.01"))
    if body.category and body.category != r.category:
        r.category = body.category
        stats = analyse(db, user.id, r.category, None, r.color or "grey", r.color_hex or "#808080",
                        (r.scan or {}).get("pattern", "solid"), r.embedding)
        r.similar = stats["similar"]
        r.similar_ids = [uuid.UUID(s["garment_id"]) for s in stats["similar"]]
        r.works_with_ids = [uuid.UUID(i) for i in stats["works_with_ids"]]
        r.new_outfit_count = stats["new_outfit_count"]
    db.flush()
    return review_out(db, user, r)


def _owned(db: Session, user: CurrentUser, review_id: uuid.UUID) -> Review:
    r = db.scalar(select(Review).where(Review.id == review_id, Review.user_id == user.id))
    if r is None:
        raise HTTPException(404, "That item was not found.")
    return r


@router.get("/reviews")
def list_reviews(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Review).where(Review.user_id == user.id).order_by(Review.created_at.desc()).limit(100))
    return [review_out(db, user, r) for r in rows]


@router.get("/reviews/{review_id}")
def get_review(review_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    r = _owned(db, user, review_id)
    if get_settings().study_mode:
        from .study import record_view

        record_view(db, user.id, r)
    return review_out(db, user, r)


@router.delete("/reviews/{review_id}", status_code=204)
def delete_review(review_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    r = _owned(db, user, review_id)
    release_files(db, user.profile, "review-items", [r.image_path], r.bytes)
    db.delete(r)


class DecisionIn(BaseModel):
    decision: Literal["save", "keep_browsing"]
    # study questions, required only for study participants
    reasons: list[str] = Field(default=[], max_length=7)
    reason_other: str | None = Field(default=None, max_length=300)
    confidence: int | None = Field(default=None, ge=1, le=7)
    shown_at: datetime | None = None


def record_decision(db: Session, r: Review, decision: str, now: datetime | None = None) -> None:
    now = now or datetime.now(UTC)
    if r.decision is not None:
        raise HTTPException(409, "You already made a choice for this item.")
    r.decision = decision
    r.decided_at = now
    if decision == "save":
        db.add(WaitingItem(review_id=r.id, user_id=r.user_id, saved_at=now, due_at=now + timedelta(hours=WAIT_HOURS)))
    db.flush()
    db.refresh(r)


@router.post("/reviews/{review_id}/decision")
def decide(review_id: uuid.UUID, body: DecisionIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    r = _owned(db, user, review_id)
    participant = None
    if get_settings().study_mode:
        from .study import StudyDecisionIn, active_participant, record_study_decision

        participant = active_participant(db, user.id)
        if participant is not None and body.confidence is None:
            raise HTTPException(400, "Answer how sure you feel before you choose.")
    record_decision(db, r, body.decision)
    if participant is not None:
        record_study_decision(db, user, r, StudyDecisionIn(decision=body.decision, reasons=body.reasons,
                                                           reason_other=body.reason_other, confidence=body.confidence))
        db.flush()
    return review_out(db, user, r)


class AnswerIn(BaseModel):
    status: Literal["bought", "skipped", "thinking"]
    note: str | None = Field(default=None, max_length=500)
    still_want: int | None = Field(default=None, ge=1, le=7)


@router.post("/waiting/{waiting_id}/answer")
def answer(waiting_id: uuid.UUID, body: AnswerIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    w = db.scalar(select(WaitingItem).where(WaitingItem.id == waiting_id, WaitingItem.user_id == user.id))
    if w is None:
        raise HTTPException(404, "That saved item was not found.")
    w.status = body.status
    w.note = body.note.strip() if body.note else None
    w.answered_at = datetime.now(UTC)
    db.flush()
    r = db.get(Review, w.review_id)
    if get_settings().study_mode:
        from .study import save_followup

        save_followup(db, user.id, r, {"bought": "yes", "skipped": "no", "thinking": "unsure"}[body.status], body.still_want)
        db.flush()
    db.refresh(r)
    return review_out(db, user, r)


# ---------------------------------------------------------------- demo

def create_demo_review(db: Session, profile: Profile) -> Review:
    from ..demo.art import CANDIDATE, rasterize

    img = rasterize(CANDIDATE)
    emb = get_embedder().embed(img)
    name = colors.name_color(CANDIDATE.color_hex)
    stats = analyse(db, profile.id, CANDIDATE.category, CANDIDATE.subtype, name, CANDIDATE.color_hex, "solid", emb,
                    CANDIDATE.formality, CANDIDATE.warmth)
    r = Review(user_id=profile.id, title=CANDIDATE.name, price=Decimal("65.00"), image_path=f"demo:{CANDIDATE.slug}.svg",
               category=CANDIDATE.category, color=name, color_hex=CANDIDATE.color_hex, scan={"cutout_ok": True},
               embedding=emb.tolist(), similar=stats["similar"], similar_ids=[uuid.UUID(s["garment_id"]) for s in stats["similar"]],
               works_with_ids=[uuid.UUID(i) for i in stats["works_with_ids"]], new_outfit_count=stats["new_outfit_count"],
               condition="treatment")
    db.add(r)
    db.flush()
    return r

