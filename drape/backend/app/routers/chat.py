"""Chat endpoint: rate limited, capped per day, grounded in the person's own data."""
from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user
from ..chat import SYSTEM, TOOLS, ChatTools, rule_based
from ..config import get_settings
from ..db import get_db
from ..llm import get_provider
from ..models import ChatMessage
from ..ratelimit import limit
from ..services import garments_by_id

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger("drape.chat")
UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)
HISTORY_TURNS = 8


class Ask(BaseModel):
    message: str = Field(min_length=1, max_length=500)


def message_out(m: ChatMessage, gmap: dict[str, dict[str, Any]]) -> dict[str, Any]:
    outfit = None
    if m.outfit:
        outfit = {**m.outfit, "pieces": [{**p, "garment": gmap.get(p["garment_id"])} for p in m.outfit["pieces"] if p["garment_id"] in gmap]}
    return {"id": str(m.id), "role": m.role, "content": m.content, "outfit": outfit,
            "garments": [gmap[str(i)] for i in m.garment_ids if str(i) in gmap], "created_at": m.created_at.isoformat() if m.created_at else None}


def _render(db: Session, user: CurrentUser, msgs: list[ChatMessage]) -> list[dict[str, Any]]:
    ids = {str(i) for m in msgs for i in m.garment_ids} | {p["garment_id"] for m in msgs if m.outfit for p in m.outfit["pieces"]}
    gmap = garments_by_id(db, user.id, ids)
    return [message_out(m, gmap) for m in msgs]


@router.get("")
def history(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    msgs = list(db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.created_at.desc()).limit(40)))
    return _render(db, user, msgs[::-1])


@router.delete("", status_code=204)
def clear(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    db.execute(delete(ChatMessage).where(ChatMessage.user_id == user.id))


@router.post("", dependencies=[Depends(limit("chat"))])
def ask(body: Ask, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    s = get_settings()
    start = datetime.combine(datetime.now(UTC).date(), time.min, tzinfo=UTC)
    today = db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.user_id == user.id, ChatMessage.role == "user",
                                                                          ChatMessage.created_at >= start)) or 0
    if today >= s.chat_daily_cap:
        raise HTTPException(429, f"You have reached today's limit of {s.chat_daily_cap} questions. It resets at midnight UTC.")

    tools = ChatTools(db, user.profile)
    provider = get_provider()
    text, used = "", "rules"
    if provider.can_chat:
        past = list(db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.created_at.desc()).limit(HISTORY_TURNS)))
        convo = [{"role": m.role, "content": m.content} for m in past[::-1]] + [{"role": "user", "content": body.message}]
        try:
            result = provider.chat(convo, TOOLS, system=SYSTEM, execute=tools.execute)
            text, used = result["text"], provider.name
        except Exception as exc:  # network or API trouble: the rule-based assistant still answers
            log.warning("llm chat failed: %s", type(exc).__name__)
    if not text:
        text, used = rule_based(body.message, tools), "rules"
    text = UUID_RE.sub("", text).strip()

    # Validate every id before anything is rendered.
    owned = set(tools.garments)
    outfit = None
    if tools.outfits and "error" not in tools.outfits[0]:
        first = tools.outfits[0]
        if all(p["garment_id"] in owned for p in first["pieces"]):
            outfit = {"pieces": [{"slot": p["slot"], "garment_id": p["garment_id"]} for p in first["pieces"]],
                      "reasons": first.get("reasons", [])[:3], "occasion": first.get("occasion", "everyday")}
    outfit_ids = {p["garment_id"] for p in outfit["pieces"]} if outfit else set()
    lowered = text.lower()
    mentioned = [gid for gid in tools.returned_ids if gid in owned and gid not in outfit_ids and tools.garments[gid].name.lower() in lowered]

    now = datetime.now(UTC)
    db.add(ChatMessage(user_id=user.id, role="user", content=body.message, provider=used, created_at=now))
    db.flush()
    reply = ChatMessage(user_id=user.id, role="assistant", content=text, outfit=outfit, garment_ids=[uuid.UUID(g) for g in mentioned[:8]], provider=used,
                        created_at=now + timedelta(milliseconds=1))
    db.add(reply)
    db.flush()
    return {"reply": _render(db, user, [reply])[0], "provider": used, "remaining_today": max(0, s.chat_daily_cap - today - 1)}
