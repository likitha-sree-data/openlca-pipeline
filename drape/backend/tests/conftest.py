import os
import tempfile
import uuid

_tmp = tempfile.mkdtemp(prefix="drape-test-")
os.environ.update({
    "ENVIRONMENT": "test",
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/drape_test"),
    "AUTH_DEV_LOGIN": "true",
    "APP_SECRET": "test-secret-0123456789abcdef0123456789",
    "STORAGE_DRIVER": "local",
    "LOCAL_STORAGE_DIR": os.path.join(_tmp, "storage"),
    "ENABLE_FASHION_CLIP": "false",
    "ENABLE_SEGFORMER": "false",
    "ENABLE_REMBG": os.environ.get("TEST_ENABLE_REMBG", "false"),
    "LLM_PROVIDER": "none",
    "INTERNAL_CRON_SECRET": "cron-secret",
    "STATIC_DIR": os.path.join(_tmp, "nostatic"),
    "DEMO_MODE": "true",
    "STUDY_MODE": "false",
    "ADMIN_EMAILS": "admin@example.com",
    "SUPABASE_URL": "",
    "SUPABASE_JWT_SECRET": "",
    "RESEND_API_KEY": "",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app import ratelimit  # noqa: E402
from app.db import get_engine  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    from app import migrate

    eng = get_engine()
    with eng.begin() as conn:
        conn.execute(text("drop schema public cascade"))
        conn.execute(text("create schema public"))
        conn.execute(text("grant all on schema public to public"))
    migrate.apply(bootstrap=True)
    yield eng


@pytest.fixture(autouse=True)
def _reset_limits():
    ratelimit.reset()
    yield


@pytest.fixture(scope="session")
def app():
    from app.main import create_app

    return create_app()


@pytest.fixture
def client(app):
    return TestClient(app)


def login(client, email=None):
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/api/auth/dev-login", json={"email": email})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def user_a(client):
    return login(client)


@pytest.fixture
def user_b(client):
    return login(client)
