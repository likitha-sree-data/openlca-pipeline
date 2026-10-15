"""Cached versatility counts, recomputed when the wardrobe changes."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .engine import valid_outfit_count, versatility
from .models import Profile
from .services import load_pieces


def invalidate(profile: Profile) -> None:
    profile.versatility_cache = None


def get_versatility(db: Session, profile: Profile) -> dict[str, Any]:
    cache = profile.versatility_cache
    if cache and "counts" in cache:
        return cache
    pieces, _ = load_pieces(db, profile.id)
    counts = versatility(pieces)
    cache = {"counts": counts, "total": valid_outfit_count(pieces)}
    profile.versatility_cache = cache
    return cache
