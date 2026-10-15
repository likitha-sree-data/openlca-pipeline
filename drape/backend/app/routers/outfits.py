"""Home: suggestions, swaps, saved looks, plans, wear today, colors and versatility."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser, current_user
from ..colors import COLOR_NAMES
from ..db import get_db
from ..engine import Engine, Outfit as EOutfit, capsule, update_taste
from ..models import ColorPrefs, Outfit, Plan, WearLog
from ..services import (
    create_outfit,
    garments_by_id,
    load_pieces,
    make_context,
    outfits_out,
)
from ..versatility import get_versatility

router = APIRouter(prefix="/api", tags=["home"])

Occasion = Literal["everyday", "work", "meeting", "date", "formal", "weekend"]
SlotName = Literal["layer", "top", "dress", "bottom", "shoes"]


class PieceIn(BaseModel):
    slot: SlotName
    garment_id: str


class Ctx(BaseModel):
    occasion: Occasion = "everyday"
    temp_c: float | None = Field(default=None, ge=-60, le=60)
    seed: int = Field(default=0, ge=0, le=2**31)


def _engine(db: Session, user: CurrentUser, ctx: Ctx) -> Engine:
    pieces, _ = load_pieces(db, user.id)
    return Engine(pieces, make_context(db, user.profile, ctx.occasion, ctx.temp_c, ctx.seed))


def _render(db: Session, user: CurrentUser, outfits: list[EOutfit]) -> list[dict]:
    ids = {pid for o in outfits for pid in o.ids}
    gmap = garments_by_id(db, user.id, ids)
    out = []
    for o in outfits:
        d = o.to_dict()
        for p in d["pieces"]:
            p["garment"] = gmap.get(p["garment_id"])
        out.append(d)
    return out


def _from_pieces(eng: Engine, pieces: list[PieceIn]) -> EOutfit:
    o = eng.outfit_from_ids([p.garment_id for p in pieces])
    if o is None:
        raise HTTPException(400, "One of these pieces is not in your closet anymore. Get a new suggestion.")
    return o


class SuggestIn(Ctx):
    pinned: str | None = None
    exclude: list[list[str]] = []
    avoid: list[str] = []  # prefer outfits that share few of these pieces (Compare)


@router.post("/outfits/suggest")
def suggest(body: SuggestIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    eng = _engine(db, user, body)
    missing = eng.missing()
    if missing:
        return {"outfit": None, "more": [], "missing": missing}
    main = eng.suggest(n=1, pinned=body.pinned, exclude={frozenset(x) for x in body.exclude}, avoid=set(body.avoid))
    if not main and body.exclude:
        main = eng.suggest(n=1, pinned=body.pinned)
    if not main:
        return {"outfit": None, "more": [], "missing": [], "note": "No outfit fits those rules yet. Add a few more pieces or try another occasion."}
    more = eng.more_from(main[0], n=3)
    rendered = _render(db, user, main + more)
    return {"outfit": rendered[0], "more": rendered[1:], "missing": []}


class Alternatives(Ctx):
    pieces: list[PieceIn]
    slot: SlotName


@router.post("/outfits/alternatives")
def alternatives(body: Alternatives, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    eng = _engine(db, user, body)
    current = _from_pieces(eng, body.pieces)
    alts = eng.alternatives(current, body.slot, limit=12)
    rendered = _render(db, user, [o for _, o in alts])
    return {"slot": body.slot, "options": [{"garment_id": p.id, "outfit": r} for (p, _), r in zip(alts, rendered)]}


class PiecesCtx(Ctx):
    pieces: list[PieceIn]


@router.post("/outfits/more")
def more(body: PiecesCtx, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    eng = _engine(db, user, body)
    current = _from_pieces(eng, body.pieces)
    return {"outfits": _render(db, user, eng.more_from(current, n=3))}


@router.post("/outfits/score")
def score(body: PiecesCtx, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    eng = _engine(db, user, body)
    o = _from_pieces(eng, body.pieces)
    return {"outfit": _render(db, user, [o])[0], "valid": eng.is_valid(o)}


def _learn(db: Session, user: CurrentUser, piece_ids: list[str], liked: bool) -> None:
    pieces, _ = load_pieces(db, user.id)
    chosen = [p for p in pieces if p.id in set(piece_ids)]
    if chosen:
        user.profile.taste = update_taste(dict(user.profile.taste or {}), chosen, liked)


@router.post("/outfits/dismiss", status_code=204)
def dismiss(body: PiecesCtx, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    _learn(db, user, [p.garment_id for p in body.pieces], liked=False)


class SaveOutfit(BaseModel):
    pieces: list[PieceIn] = Field(min_length=2, max_length=5)
    name: str | None = Field(default=None, max_length=60)
    occasion: Occasion = "everyday"
    source: Literal["generated", "chat", "manual", "compare"] = "generated"
    reasons: list[str] = Field(default=[], max_length=3)


def _check_shape(pieces: list[PieceIn]) -> None:
    slots = [p.slot for p in pieces]
    if len(set(slots)) != len(slots):
        raise HTTPException(400, "An outfit can have only one piece per slot.")
    if "shoes" not in slots or not ("dress" in slots or ("top" in slots and "bottom" in slots)):
        raise HTTPException(400, "An outfit needs shoes and either a dress or a top and a bottom.")
    if "dress" in slots and ("top" in slots or "bottom" in slots):
        raise HTTPException(400, "A dress is not worn with a separate top or bottom here.")


@router.post("/outfits", status_code=201)
def save_outfit(body: SaveOutfit, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    _check_shape(body.pieces)
    o = create_outfit(db, user.id, [p.model_dump() for p in body.pieces], name=body.name, occasion=body.occasion,
                      source=body.source, saved=True, reasons=[r[:120] for r in body.reasons])
    _learn(db, user, [p.garment_id for p in body.pieces], liked=True)
    return outfits_out(db, user.id, [o])[0]


@router.get("/outfits")
def list_outfits(saved: bool = True, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    q = select(Outfit).where(Outfit.user_id == user.id)
    if saved:
        q = q.where(Outfit.saved.is_(True))
    rows = list(db.scalars(q.order_by(Outfit.created_at.desc()).limit(200)))
    return outfits_out(db, user.id, rows)


def _owned_outfit(db: Session, user: CurrentUser, outfit_id: uuid.UUID) -> Outfit:
    o = db.scalar(select(Outfit).where(Outfit.id == outfit_id, Outfit.user_id == user.id))
    if o is None:
        raise HTTPException(404, "That outfit was not found.")
    return o


@router.get("/outfits/{outfit_id}")
def get_outfit(outfit_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return outfits_out(db, user.id, [_owned_outfit(db, user, outfit_id)])[0]


@router.delete("/outfits/{outfit_id}", status_code=204)
def delete_outfit(outfit_id: uuid.UUID, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    o = _owned_outfit(db, user, outfit_id)
    if o.worn_on is not None:
        # keep history, just unsave the look
        o.saved = False
    else:
        db.delete(o)


class WearIn(BaseModel):
    pieces: list[PieceIn] = Field(min_length=1, max_length=6)
    occasion: Occasion = "everyday"
    worn_on: date | None = None
    name: str | None = Field(default=None, max_length=60)
    confirmed: bool = False


@router.post("/outfits/wear", status_code=201)
def wear(body: WearIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Record what was worn. The client asks the person to confirm first."""
    if not body.confirmed:
        raise HTTPException(400, "Confirm what you wore before it is recorded.")
    worn = body.worn_on or date.today()
    if worn > date.today() + timedelta(days=1):
        raise HTTPException(400, "You can only log outfits you have already worn.")
    o = create_outfit(db, user.id, [p.model_dump() for p in body.pieces], name=body.name, occasion=body.occasion,
                      source="manual", saved=False, worn_on=worn)
    now = datetime.now(UTC)
    for it in o.items:
        db.add(WearLog(user_id=user.id, garment_id=it.garment_id, outfit_id=o.id, worn_on=worn, source="manual", confirmed_at=now))
    db.flush()
    return outfits_out(db, user.id, [o])[0]


# ---------------------------------------------------------------- plans

class PlanIn(BaseModel):
    plan_date: date
    occasion: Occasion = "everyday"
    pieces: list[PieceIn] = Field(min_length=2, max_length=5)


def _plan_out(db: Session, user: CurrentUser, plans: list[Plan]) -> list[dict]:
    found = [o for o in (db.get(Outfit, p.outfit_id) for p in plans if p.outfit_id) if o is not None]
    rendered = {r["id"]: r for r in outfits_out(db, user.id, found)}
    return [{"id": str(p.id), "plan_date": p.plan_date.isoformat(), "occasion": p.occasion,
             "outfit": rendered.get(str(p.outfit_id))} for p in plans]


@router.get("/plans")
def list_plans(start: date | None = None, days: int = 7, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    start = start or date.today()
    days = max(1, min(days, 62))
    plans = list(db.scalars(select(Plan).where(Plan.user_id == user.id, Plan.plan_date >= start,
                                               Plan.plan_date < start + timedelta(days=days)).order_by(Plan.plan_date)))
    return _plan_out(db, user, plans)


@router.put("/plans")
def put_plan(body: PlanIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if body.plan_date < date.today() - timedelta(days=1):
        raise HTTPException(400, "Pick today or a day ahead.")
    _check_shape(body.pieces)
    old = db.scalar(select(Plan).where(Plan.user_id == user.id, Plan.plan_date == body.plan_date))
    if old is not None:
        if old.outfit_id:
            prev = db.get(Outfit, old.outfit_id)
            if prev is not None and not prev.saved and prev.worn_on is None:
                db.delete(prev)
        db.delete(old)
        db.flush()
    o = create_outfit(db, user.id, [p.model_dump() for p in body.pieces], occasion=body.occasion, source="generated", saved=False,
                      name=f"Plan for {body.plan_date.isoformat()}")
    plan = Plan(user_id=user.id, plan_date=body.plan_date, occasion=body.occasion, outfit_id=o.id)
    db.add(plan)
    db.flush()
    return _plan_out(db, user, [plan])[0]


@router.delete("/plans/{plan_date}", status_code=204)
def delete_plan(plan_date: date, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> None:
    db.execute(delete(Plan).where(Plan.user_id == user.id, Plan.plan_date == plan_date))


# ---------------------------------------------------------------- color preferences

class ColorsIn(BaseModel):
    favorites: list[str] = Field(default=[], max_length=12)
    avoid: list[str] = Field(default=[], max_length=12)


@router.get("/prefs/colors")
def get_colors(user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    p = db.get(ColorPrefs, user.id)
    return {"favorites": p.favorites if p else [], "avoid": p.avoid if p else [], "palette": COLOR_NAMES}


@router.put("/prefs/colors")
def put_colors(body: ColorsIn, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    bad = [c for c in body.favorites + body.avoid if c not in COLOR_NAMES]
    if bad:
        raise HTTPException(400, f"Unknown color: {bad[0]}.")
    if set(body.favorites) & set(body.avoid):
        raise HTTPException(400, "A color cannot be both a favorite and one to avoid.")
    p = db.get(ColorPrefs, user.id)
    if p is None:
        p = ColorPrefs(user_id=user.id)
        db.add(p)
    p.favorites, p.avoid = body.favorites, body.avoid
    db.flush()
    return {"favorites": p.favorites, "avoid": p.avoid, "palette": COLOR_NAMES}


# ---------------------------------------------------------------- versatility

@router.get("/versatility")
def versatility_view(capsule_size: int = 8, user: CurrentUser = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    cache = get_versatility(db, user.profile)
    gmap = garments_by_id(db, user.id)
    ranked = sorted(((gid, n) for gid, n in cache["counts"].items() if gid in gmap and n > 0), key=lambda kv: (-kv[1], gmap[kv[0]]["name"]))
    pieces, _ = load_pieces(db, user.id)
    size = max(3, min(capsule_size, 15))
    cap_ids, cap_count = capsule(pieces, size=size)
    return {
        "total_outfits": cache["total"],
        "ranked": [{"garment": gmap[gid], "outfits": n} for gid, n in ranked[:12]],
        "capsule": {"size": size, "outfits": cap_count, "garments": [gmap[i] for i in cap_ids if i in gmap]},
    }
