"""Request shapes for the Supabase Storage driver, checked against a mock server."""
import json

import httpx
import pytest

from app.storage import StorageError, SupabaseStorage


def make(handler):
    seen = []

    def h(req):
        seen.append(req)
        return handler(req)

    return SupabaseStorage("https://proj.supabase.co", "service-key", 600, transport=httpx.MockTransport(h)), seen


def test_upload_sign_delete_list():
    def handler(req):
        p = req.url.path
        if p.startswith("/storage/v1/object/sign/"):
            return httpx.Response(200, json={"signedURL": "/object/sign/garments/u/g/cutout.png?token=abc"})
        if p == "/storage/v1/object/list/garments":
            body = json.loads(req.content)
            if body["prefix"] == "u":
                return httpx.Response(200, json=[{"name": "g", "id": None}])
            return httpx.Response(200, json=[{"name": "cutout.png", "id": "1"}, {"name": "thumb.webp", "id": "2"}])
        return httpx.Response(200, json={})

    s, seen = make(handler)
    s.put("garments", "u/g/cutout.png", b"png", "image/png")
    up = seen[-1]
    assert up.method == "POST" and up.url.path == "/storage/v1/object/garments/u/g/cutout.png"
    assert up.headers["authorization"] == "Bearer service-key" and up.headers["x-upsert"] == "true"
    url = s.sign("garments", "u/g/cutout.png")
    assert url == "https://proj.supabase.co/storage/v1/object/sign/garments/u/g/cutout.png?token=abc"
    assert json.loads(seen[-1].content) == {"expiresIn": 600}
    assert s.list_prefix("garments", "u") == ["u/g/cutout.png", "u/g/thumb.webp"]
    s.delete_prefix("garments", "u")
    d = seen[-1]
    assert d.method == "DELETE" and json.loads(d.content) == {"prefixes": ["u/g/cutout.png", "u/g/thumb.webp"]}


def test_errors_and_path_checks():
    s, _ = make(lambda req: httpx.Response(400, json={"error": "nope"}))
    with pytest.raises(StorageError):
        s.put("garments", "u/x.png", b"", "image/png")
    with pytest.raises(StorageError):
        s.put("garments", "../other/x.png", b"", "image/png")
    with pytest.raises(StorageError):
        s.put("public", "u/x.png", b"", "image/png")


def test_production_refuses_weak_secret(monkeypatch):
    from app.config import get_settings
    from app.main import create_app

    monkeypatch.setattr(get_settings(), "environment", "production")
    monkeypatch.setattr(get_settings(), "app_secret", "dev-only-change-me-0123456789abcdef")
    with pytest.raises(RuntimeError):
        create_app()
