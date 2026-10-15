"""Structured logs with request ids. Never log personal data or image bytes."""
from __future__ import annotations

import contextvars
import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "t": round(record.created, 3),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "rid": request_id.get(),
        }
        for key in ("path", "method", "status", "ms"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        if record.exc_info:
            data["exc"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(data)


def setup(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    logging.getLogger("uvicorn.access").disabled = True


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id.set(rid)
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["x-request-id"] = rid
            return response
        finally:
            # path only, never query strings (signed URLs, tokens) or bodies
            if not request.url.path.startswith(("/assets", "/media", "/demo-garments", "/fonts")):
                logging.getLogger("drape.http").info(
                    "request", extra={"path": request.url.path, "method": request.method, "status": status,
                                      "ms": round((time.perf_counter() - start) * 1000, 1)})
            request_id.reset(token)
