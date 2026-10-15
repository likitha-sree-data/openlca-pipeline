"""User A must not be able to read, change or delete user B's rows or files."""
import uuid

import pytest
from sqlalchemy import text

from app.db import get_engine
from tests.helpers import add_garment, scan_one


def test_api_isolation_garments(client, user_a, user_b):
    ga = add_garment(client, user_a, "top", "#B8302F", seed=31, name="A red top")
    gid = ga["id"]
    assert client.get(f"/api/garments/{gid}", headers=user_b).status_code == 404
    assert client.patch(f"/api/garments/{gid}", json={"name": "hacked"}, headers=user_b).status_code == 404
    assert client.delete(f"/api/garments/{gid}", headers=user_b).status_code == 404
    assert all(g["id"] != gid for g in client.get("/api/garments", headers=user_b).json()["items"])
    assert client.get(f"/api/garments/{gid}", headers=user_a).json()["name"] == "A red top"


def test_api_isolation_drafts(client, user_a, user_b):
    d = scan_one(client, user_a, "bottom", "#1F2D4D", seed=32, hint="bottom")
    assert client.post("/api/garments", json={"draft_id": d["id"], "name": "Stolen", "category": "bottom"}, headers=user_b).status_code == 404
    assert client.delete(f"/api/drafts/{d['id']}", headers=user_b).status_code == 404
    assert client.get("/api/drafts", headers=user_b).json() == []


def test_files_live_under_owner_prefix(client, user_a):
    g = add_garment(client, user_a, "shoes", "#6B4A32", seed=33)
    me = client.get("/api/me", headers=user_a).json()
    assert f"/media/garments/{me['id']}/" in g["image_url"]


def test_rls_blocks_supabase_api_roles(client, user_a):
    add_garment(client, user_a, "top", "#EDE4CF", seed=34)
    eng = get_engine()
    with eng.connect() as conn:
        assert conn.execute(text("select count(*) from garments")).scalar() > 0
        for role in ("anon", "authenticated"):
            conn.execute(text(f"set role {role}"))
            assert conn.execute(text("select count(*) from garments")).scalar() == 0
            assert conn.execute(text("select count(*) from profiles")).scalar() == 0
            with pytest.raises(Exception):
                conn.execute(text("insert into profiles (id) values (:i)"), {"i": str(uuid.uuid4())})
            conn.rollback()
            conn.execute(text("reset role"))


def test_every_table_has_rls_enabled():
    with get_engine().connect() as conn:
        rows = conn.execute(text("select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                                 "where n.nspname = 'public' and c.relkind = 'r'")).all()
        assert rows
        assert all(sec for _, sec in rows), [name for name, sec in rows if not sec]
        policies = conn.execute(text("select count(*) from pg_policies where schemaname = 'public'")).scalar()
        assert policies == 0
