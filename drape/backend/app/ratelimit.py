"""In-process token bucket rate limits, keyed by user and endpoint group.

One Space runs one process, so in-memory limits are enough. Daily caps that
must survive restarts (chat) are counted in Postgres instead.
"""
from __future__ import annotations

import threading
import time

from fastapi import Depends, HTTPException, Request

from .config import get_settings

_buckets: dict[tuple[str, str], tuple[float, float]] = {}
_lock = threading.Lock()


def check(group: str, key: str) -> None:
    rate, per = get_settings().rate_limits.get(group, (60, 60))
    now = time.monotonic()
    with _lock:
        tokens, last = _buckets.get((group, key), (float(rate), now))
        tokens = min(float(rate), tokens + (now - last) * rate / per)
        if tokens < 1:
            wait = int((1 - tokens) * per / rate) + 1
            raise HTTPException(429, f"Too many requests. Wait {wait} seconds and try again.", headers={"Retry-After": str(wait)})
        _buckets[(group, key)] = (tokens - 1, now)


def reset() -> None:
    with _lock:
        _buckets.clear()


def limit(group: str):
    """FastAPI dependency: limit by signed-in user."""
    from .auth import CurrentUser, current_user

    def dep(user: CurrentUser = Depends(current_user)) -> None:
        check(group, str(user.id))

    return dep


def limit_ip(group: str):
    """FastAPI dependency for endpoints used before sign-in."""

    def dep(request: Request) -> None:
        check(group, request.client.host if request.client else "anon")

    return dep
