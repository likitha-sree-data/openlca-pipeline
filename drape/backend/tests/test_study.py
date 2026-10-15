import csv
import io
import re
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from app import study_config as cfg
from app.config import get_settings
from app.db import get_engine, session_scope
from app.routers.internal import run_due
from app.study_export import codebook_markdown
from app.testing.synth import garment_photo, jpeg_bytes
from tests.conftest import login


@pytest.fixture
def study(monkeypatch):
    monkeypatch.setattr(get_settings(), "study_mode", True)
    with get_engine().begin() as c:
        c.execute(text("delete from study_participants"))
        c.execute(text("update study_state set next_index = 0"))
    yield


def join(client, h):
    r = client.post("/api/study/consent", json={"version": cfg.CONSENT_VERSION, "agree": True}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def review(client, h, seed=0):
    r = client.post("/api/reviews", files={"file": ("x.jpg", jpeg_bytes(garment_photo("top", "#1F2D4D", seed=seed)), "image/jpeg")},
                    data={"title": "Navy jumper"}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_40_participants_balanced_between_subject(client, study):
    arms = Counter()
    for _ in range(40):
        h = login(client)
        join(client, h)
    with get_engine().connect() as c:
        rows = c.execute(text("select arm, alloc_index from study_participants order by alloc_index")).all()
    arms = Counter(a for a, _ in rows)
    assert sum(arms.values()) == 40
    assert abs(arms["control"] - arms["treatment"]) <= 1
    # balanced inside every block of 4 too
    for b in range(10):
        block = Counter(a for a, i in rows if i // cfg.BLOCK_SIZE == b)
        assert block["control"] == block["treatment"] == 2


def test_40_participants_balanced_within_subject(client, study, monkeypatch):
    monkeypatch.setattr(cfg, "DESIGN", "within_subject_counterbalanced")
    for _ in range(40):
        join(client, login(client))
    with get_engine().connect() as c:
        arms = Counter(a for (a,) in c.execute(text("select arm from study_participants")))
    assert arms["AB"] == arms["BA"] == 20


def test_concurrent_consents_get_distinct_slots(client, study):
    headers = [login(client) for _ in range(8)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda h: join(client, h), headers))
    with get_engine().connect() as c:
        idx = [i for (i,) in c.execute(text("select alloc_index from study_participants"))]
    assert sorted(idx) == list(range(8))


def test_full_trial_records_and_csv_has_no_personal_fields(client, study):
    email = f"person-{uuid.uuid4().hex[:6]}@example.com"
    h = login(client, email)
    code = join(client, h)["participant_code"]
    rv = review(client, h, seed=1)
    with get_engine().connect() as c:
        arm = c.execute(text("select arm from study_participants where code = :c"), {"c": code}).scalar()
    assert rv["condition"] == arm
    if arm == "control":
        assert rv["similar"] is None and rv["works_with"] is None and rv["new_outfit_count"] is None
    else:
        assert rv["similar"] is not None
    assert rv["study"]["needs_questions"] is True
    client.get(f"/api/reviews/{rv['id']}", headers=h)  # first view
    r = client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "save"}, headers=h)
    assert r.status_code == 400  # questions required for participants
    r = client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "save", "reasons": ["love_it", "other"],
                                                               "reason_other": "ask me at me@mail.com", "confidence": 6}, headers=h)
    assert r.status_code == 200, r.text
    w = r.json()["waiting"]
    client.post(f"/api/waiting/{w['id']}/answer", json={"status": "skipped", "still_want": 2}, headers=h)

    rv2 = review(client, h, seed=2)
    client.post(f"/api/reviews/{rv2['id']}/decision", json={"decision": "keep_browsing", "reasons": ["price"], "confidence": 4}, headers=h)
    with session_scope() as db:
        assert run_due(db, now=datetime.now(UTC) + timedelta(hours=49))["study_followups"] == 1
    notes = client.get("/api/notifications", headers=h).json()
    assert any(n["title"] == "A quick question" for n in notes)
    assert client.get(f"/api/reviews/{rv2['id']}", headers=h).json()["study"]["needs_followup"] is False
    assert client.post(f"/api/study/reviews/{rv2['id']}/followup", json={"bought": "no", "still_want": 3}, headers=h).status_code == 200

    admin = login(client, "admin@example.com")
    s = client.get("/api/admin/study/summary", headers=admin).json()
    assert s["participants"] >= 1 and s["by_condition"][arm]["decisions"] == 2
    wide = client.get("/api/admin/study/export?kind=wide", headers=admin).text
    long = client.get("/api/admin/study/export?kind=long", headers=admin).text
    rows = list(csv.DictReader(io.StringIO(wide)))
    mine = [r for r in rows if r["participant_code"] == code]
    assert [r["decision"] for r in mine] == ["save", "keep_browsing"]
    assert mine[0]["reason_love_it"] == "1" and mine[0]["confidence"] == "6" and mine[0]["followup_bought"] == "no"
    assert mine[0]["followup_still_want"] == "2" and mine[1]["followup_bought"] == "no"
    assert "[redacted]" in mine[0]["reason_other_text"]
    me_id = client.get("/api/me", headers=h).json()["id"]
    for blob in (wide, long):
        assert email not in blob and "@" not in blob
        assert me_id not in blob and rv["id"] not in blob
        assert not re.search(r"\.(png|jpe?g|webp|svg)\b", blob) and "/media/" not in blob and "demo:" not in blob
        header = blob.splitlines()[0].lower()
        for bad in ("email", "name", "user_id", "image", "url", "path"):
            assert bad not in header


def test_admin_only(client, study):
    h = login(client)
    assert client.get("/api/admin/study/summary", headers=h).status_code == 403
    assert client.get("/api/admin/study/export", headers=h).status_code == 403


def test_withdraw_stops_collection_and_can_delete(client, study):
    h = login(client)
    join(client, h)
    client.post("/api/study/withdraw", json={"delete_data": False}, headers=h)
    rv = review(client, h, seed=3)
    assert rv["condition"] == "treatment" and rv["study"] is None
    client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "save"}, headers=h)
    with get_engine().connect() as c:
        assert c.execute(text("select count(*) from study_decisions d join study_participants p on p.id = d.participant_id "
                              "where p.withdrawn_at is not null")).scalar() == 0
    h2 = login(client)
    join(client, h2)
    rv2 = review(client, h2, seed=4)
    client.post(f"/api/reviews/{rv2['id']}/decision", json={"decision": "save", "confidence": 5}, headers=h2)
    client.post("/api/study/withdraw", json={"delete_data": True}, headers=h2)
    with get_engine().connect() as c:
        assert c.execute(text("select count(*) from study_decisions where review_id = :r"), {"r": rv2["id"]}).scalar() == 0
    status = client.get("/api/study", headers=h2).json()
    assert status["enrolled"] is False


def test_study_off_records_nothing(client):
    assert get_settings().study_mode is False
    h = login(client)
    assert client.get("/api/study", headers=h).status_code == 404
    with get_engine().connect() as c:
        before = c.execute(text("select count(*) from study_events")).scalar()
    rv = review(client, h, seed=5)
    assert rv["condition"] == "treatment" and rv["study"] is None
    client.post(f"/api/reviews/{rv['id']}/decision", json={"decision": "keep_browsing"}, headers=h)
    with get_engine().connect() as c:
        assert c.execute(text("select count(*) from study_events")).scalar() == before


def test_consent_version_must_match(client, study):
    h = login(client)
    r = client.post("/api/study/consent", json={"version": "old", "agree": True}, headers=h)
    assert r.status_code == 409
    status = client.get("/api/study", headers=h).json()
    assert "Replace with IRB-approved text before recruiting anyone" in status["consent_text"]


def test_codebook_is_current():
    path = Path(__file__).resolve().parents[2] / "docs" / "codebook.md"
    assert path.read_text(encoding="utf-8") == codebook_markdown()
