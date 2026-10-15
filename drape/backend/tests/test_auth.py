import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app import auth
from app.config import get_settings


def _claims(**kw):
    now = int(time.time())
    base = {"sub": str(uuid.uuid4()), "email": "s@example.com", "aud": "authenticated", "iat": now, "exp": now + 600,
            "iss": "https://proj.supabase.co/auth/v1"}
    base.update(kw)
    return base


@pytest.fixture
def supabase_settings(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(s, "supabase_jwt_secret", "super-secret-jwt-key-for-tests-0123456789")
    return s


def test_supabase_hs256_token_accepted(client, supabase_settings):
    token = jwt.encode(_claims(), supabase_settings.supabase_jwt_secret, algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["email"] == "s@example.com"


def test_wrong_secret_and_expired_rejected(client, supabase_settings):
    bad = jwt.encode(_claims(), "another-secret-0123456789-abcdefghijkl", algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401
    old = jwt.encode(_claims(exp=int(time.time()) - 10), supabase_settings.supabase_jwt_secret, algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {old}"})
    assert r.status_code == 401 and "expired" in r.json()["detail"]
    wrong_aud = jwt.encode(_claims(aud="anon"), supabase_settings.supabase_jwt_secret, algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {wrong_aud}"}).status_code == 401


def test_supabase_es256_jwks_token_accepted(client, supabase_settings, monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())

    class FakeKey:
        def __init__(self, k):
            self.key = k

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return FakeKey(key.public_key())

    monkeypatch.setattr(auth, "_jwks_client", lambda url: FakeClient())
    token = jwt.encode(_claims(email="es@example.com"), key, algorithm="ES256", headers={"kid": "k1"})
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200 and r.json()["email"] == "es@example.com"
    other = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode(_claims(), other, algorithm="ES256", headers={"kid": "k1"})
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_alg_none_rejected(client):
    token = jwt.encode(_claims(iss="drape"), None, algorithm="none")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_dev_login_refused_in_production(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "environment", "production")
    assert client.post("/api/auth/dev-login", json={"email": "x@example.com"}).status_code == 404


def test_admin_email_gets_admin_flag(client):
    r = client.post("/api/auth/dev-login", json={"email": "admin@example.com"})
    me = client.get("/api/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["is_admin"] is True
