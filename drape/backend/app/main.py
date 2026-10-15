"""FastAPI application: JSON API, signed media, and the built React app."""
from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .logging_setup import RequestIdMiddleware, SecurityHeadersMiddleware, setup
from .storage import LocalStorage, get_storage

log = logging.getLogger("drape")


def _friendly_field(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "request"


def create_app() -> FastAPI:
    s = get_settings()
    setup(s.log_level)
    if s.is_production and (s.app_secret.startswith("dev-only") or len(s.app_secret) < 32):
        raise RuntimeError("Set APP_SECRET to a random string of at least 32 characters before running in production.")
    app = FastAPI(title="Drape API", version="1.0.0", docs_url="/api/docs" if not s.is_production else None,
                  openapi_url="/api/openapi.json" if not s.is_production else None)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIdMiddleware)
    if not s.is_production:
        app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"],
                           allow_headers=["*"], allow_credentials=True)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = {_friendly_field(tuple(e["loc"])): e["msg"] for e in exc.errors()}
        names = ", ".join(sorted(fields))
        return JSONResponse(status_code=422, content={"detail": f"Check these fields: {names}.", "fields": fields})

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def crash_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error")
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on the server. Try again in a moment."})

    from .routers import garments, system

    app.include_router(system.router)
    app.include_router(garments.router)
    for name in ("outfits", "history", "reviews", "notifications", "chat", "account", "study", "internal", "demo"):
        try:
            module = __import__(f"app.routers.{name}", fromlist=["router"])
        except ModuleNotFoundError:
            continue
        app.include_router(module.router)

    @app.get("/media/{bucket}/{path:path}", include_in_schema=False)
    def media(bucket: str, path: str, exp: int, sig: str) -> Response:
        store = get_storage()
        if not isinstance(store, LocalStorage) or not store.verify(bucket, path, exp, sig):
            raise HTTPException(403, "This link expired. Reload the page.")
        try:
            data = store.get(bucket, path)
        except Exception as exc:
            raise HTTPException(404, "File not found.") from exc
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        return Response(data, media_type=ctype, headers={"Cache-Control": "private, max-age=3000",
                                                         "X-Content-Type-Options": "nosniff"})

    static = Path(s.static_dir)

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> Response:
        if full_path.startswith(("api/", "internal/", "media/")):
            raise HTTPException(404, "Not found")
        if not static.exists():
            return JSONResponse({"detail": "Frontend not built. Run npm run build in frontend."}, status_code=404)
        target = (static / full_path).resolve()
        if full_path and target.is_file() and static.resolve() in target.parents:
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if full_path.startswith("assets/") else {}
            return FileResponse(target, headers=headers)
        return FileResponse(static / "index.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
