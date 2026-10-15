import logging

from app.config import get_settings
from app.testing.synth import garment_photo, jpeg_bytes
from tests.conftest import login
from tests.helpers import add_garment


def test_security_headers(client, user_a):
    r = client.get("/api/me", headers=user_a)
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["x-request-id"]


def test_storage_quota_blocks_uploads(client, monkeypatch):
    h = login(client)
    monkeypatch.setattr(get_settings(), "storage_quota_mb", 0)
    r = client.post("/api/scan", files=[("files", ("a.jpg", jpeg_bytes(garment_photo("top", "#B8302F", seed=90)), "image/jpeg"))], headers=h)
    assert r.status_code == 413 and "storage is full" in r.json()["detail"]


def test_scan_rate_limit(client, monkeypatch):
    h = login(client)
    monkeypatch.setitem(get_settings().rate_limits, "scan", (2, 60))
    codes = [client.post("/api/scan", files=[("files", (f"{i}.jpg", b"x", "image/jpeg"))], headers=h).status_code for i in range(3)]
    assert codes == [200, 200, 429]


def test_logs_have_request_ids_and_no_personal_data(client, caplog):
    email = "private.person@example.com"
    caplog.set_level(logging.INFO)
    h = login(client, email)
    add_garment(client, h, "top", "#B8302F", seed=91, name="Secret red top")
    text = "\n".join(r.getMessage() + " " + str(getattr(r, "path", "")) for r in caplog.records)
    assert email not in text and "Secret red top" not in text
    assert "\\xff\\xd8" not in text and "JFIF" not in text
    assert any(getattr(r, "path", None) == "/api/scan" for r in caplog.records)


def test_unknown_api_route_is_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and r.json()["detail"]
