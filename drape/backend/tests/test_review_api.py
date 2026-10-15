from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import select

from app import ssrf
from app.db import session_scope
from app.models import WaitingItem
from app.routers.internal import run_due
from app.testing.synth import garment_photo, jpeg_bytes


def demo(client):
    return {"Authorization": f"Bearer {client.post('/api/demo/start').json()['access_token']}"}


def test_demo_candidate_similar_and_works_with(client):
    h = demo(client)
    reviews = client.get("/api/reviews", headers=h).json()
    assert len(reviews) == 1
    r = reviews[0]
    assert r["title"] == "Navy knit sweater"
    assert r["similar"][0]["garment"]["name"] == "Navy cardigan"
    assert r["similar"][0]["reason"] == "Similar color and purpose"
    works = [g["name"] for g in r["works_with"]]
    assert "Beige trousers" in works and "White trainers" in works
    assert "Navy cardigan" not in works
    assert r["new_outfit_count"] > 0
    assert r["image_url"] == "/demo-garments/navy-knit-sweater.svg"


def test_photo_review_and_48_hour_due(client, user_a):
    # a regular account: demo sandboxes expire after 24 hours, before the reminder
    from tests.helpers import add_garment

    h = user_a
    add_garment(client, h, "layer", "#26355A", seed=42, name="Navy cardigan")
    add_garment(client, h, "bottom", "#D3C0A0", seed=43, name="Beige trousers")
    add_garment(client, h, "shoes", "#F4F4F0", seed=44, name="White trainers")
    photo = jpeg_bytes(garment_photo("top", "#1F2D4D", seed=40))
    r = client.post("/api/reviews", files={"file": ("sweater.jpg", photo, "image/jpeg")}, data={"title": "Navy jumper", "price": "49.90"}, headers=h)
    assert r.status_code == 201, r.text
    rv = r.json()
    assert rv["title"] == "Navy jumper" and rv["price"] == 49.9 and rv["category"] == "top" and rv["color"] == "navy"
    assert any(s["garment"]["name"] == "Navy cardigan" for s in rv["similar"])
    t0 = datetime.now(UTC)
    saved = client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "save"}, headers=h).json()
    w = saved["waiting"]
    saved_at, due_at = datetime.fromisoformat(w["saved_at"]), datetime.fromisoformat(w["due_at"])
    assert due_at - saved_at == timedelta(hours=48)
    assert abs((saved_at - t0).total_seconds()) < 30
    assert not w["due"] and w["seconds_left"] > 47 * 3600
    assert client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "keep_browsing"}, headers=h).status_code == 409

    with session_scope() as db:
        assert run_due(db, now=due_at - timedelta(minutes=1))["reminders"] == 0
    with session_scope() as db:
        assert run_due(db, now=due_at + timedelta(minutes=1))["reminders"] >= 1
        item = db.scalar(select(WaitingItem).where(WaitingItem.id == w["id"]))
        assert item.notified_at is not None
    with session_scope() as db:  # never twice
        run_due(db, now=due_at + timedelta(hours=2))
        item = db.scalar(select(WaitingItem).where(WaitingItem.id == w["id"]))
        assert item.notified_at <= due_at + timedelta(minutes=1)
    notes = client.get("/api/notifications", headers=h).json()
    assert notes[0]["title"] == "Still want it?" and "Navy jumper" in notes[0]["body"]
    assert client.get("/api/notifications/unread", headers=h).json()["unread"] == 1
    client.post("/api/notifications/read", headers=h)
    assert client.get("/api/notifications/unread", headers=h).json()["unread"] == 0
    a = client.post(f"/api/waiting/{w['id']}/answer", json={"status": "skipped", "note": "Already own the cardigan"}, headers=h).json()
    assert a["waiting"]["status"] == "skipped" and a["waiting"]["note"] == "Already own the cardigan"


def test_cron_endpoint_requires_secret(client):
    assert client.post("/internal/run-due").status_code == 403
    assert client.post("/internal/run-due", headers={"X-Cron-Secret": "wrong"}).status_code == 403
    r = client.post("/internal/run-due", headers={"X-Cron-Secret": "cron-secret"})
    assert r.status_code == 200 and "reminders" in r.json()


def test_keep_browsing_creates_no_waiting(client):
    h = demo(client)
    rv = client.get("/api/reviews", headers=h).json()[0]
    out = client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "keep_browsing"}, headers=h).json()
    assert out["decision"] == "keep_browsing" and out["waiting"] is None


def test_link_review_uses_open_graph(client, monkeypatch):
    h = demo(client)
    page = b'<html><head><meta property="og:title" content="Navy knit sweater"><meta property="og:image" content="https://cdn.shop.example/s.jpg"><meta property="product:price:amount" content="65.00"></head></html>'
    img = jpeg_bytes(garment_photo("top", "#1F2D4D", seed=41))

    def handler(request):
        if request.headers["host"] == "cdn.shop.example":
            return httpx.Response(200, content=img, headers={"content-type": "image/jpeg"})
        return httpx.Response(200, content=page, headers={"content-type": "text/html"})

    real = ssrf.safe_fetch
    monkeypatch.setattr("app.routers.reviews.safe_fetch", lambda url, cap=ssrf.PAGE_CAP, **kw: real(
        url, cap, resolver=lambda host, port: ["93.184.216.34"], transport=httpx.MockTransport(handler), **kw))
    r = client.post("/api/reviews", data={"url": "https://shop.example/p/1"}, headers=h)
    assert r.status_code == 201, r.text
    rv = r.json()
    assert rv["title"] == "Navy knit sweater" and rv["price"] == 65.0 and rv["source_url"] == "https://shop.example/p/1"


def test_link_to_private_address_is_refused(client):
    h = demo(client)
    r = client.post("/api/reviews", data={"url": "http://169.254.169.254/latest/meta-data/"}, headers=h)
    assert r.status_code == 400 and "private" in r.json()["detail"]
    r = client.post("/api/reviews", data={"url": "file:///etc/passwd"}, headers=h)
    assert r.status_code == 400


def test_review_isolation(client, user_a):
    h = demo(client)
    rv = client.get("/api/reviews", headers=h).json()[0]
    assert client.get(f"/api/reviews/{rv['id']}", headers=user_a).status_code == 404
    assert client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "save"}, headers=user_a).status_code == 404
    assert client.delete(f"/api/reviews/{rv['id']}", headers=user_a).status_code == 404
