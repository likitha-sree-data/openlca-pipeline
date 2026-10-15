import io
import json
import os
import zipfile

from app.config import get_settings
from tests.helpers import add_garment


def test_export_contains_data_and_images(client, user_a):
    g = add_garment(client, user_a, "top", "#B8302F", seed=60, name="Red tee", price=20)
    client.put("/api/prefs/colors", json={"favorites": ["red"], "avoid": []}, headers=user_a)
    r = client.get("/api/account/export", headers=user_a)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    data = json.loads(z.read("data.json"))
    assert data["garments"][0]["name"] == "Red tee" and "embedding" not in data["garments"][0]
    assert data["color_prefs"][0]["favorites"] == ["red"]
    imgs = [n for n in z.namelist() if n.startswith("images/garments/")]
    assert any(n.endswith("cutout.png") for n in imgs) and any(n.endswith("thumb.webp") for n in imgs)
    assert g["id"] in " ".join(imgs)


def test_export_isolated(client, user_a, user_b):
    add_garment(client, user_a, "top", "#B8302F", seed=61, name="A only")
    z = zipfile.ZipFile(io.BytesIO(client.get("/api/account/export", headers=user_b).content))
    data = json.loads(z.read("data.json"))
    assert data["garments"] == [] and not [n for n in z.namelist() if n.startswith("images/")]


def test_delete_account_removes_rows_and_files(client, user_a, user_b):
    g = add_garment(client, user_a, "shoes", "#6B4A32", seed=62)
    gb = add_garment(client, user_b, "shoes", "#6B4A32", seed=63)
    me = client.get("/api/me", headers=user_a).json()
    folder = os.path.join(get_settings().local_storage_dir, "garments", me["id"])
    assert os.path.isdir(folder)
    assert client.post("/api/account/delete", json={"confirm": "nope"}, headers=user_a).status_code == 400
    assert client.post("/api/account/delete", json={"confirm": "delete my account"}, headers=user_a).status_code == 204
    assert not os.path.exists(folder)
    from sqlalchemy import text

    from app.db import get_engine
    with get_engine().connect() as c:
        assert c.execute(text("select count(*) from garments where id = :i"), {"i": g["id"]}).scalar() == 0
        assert c.execute(text("select count(*) from profiles where id = :i"), {"i": me["id"]}).scalar() == 0
        assert c.execute(text("select count(*) from garments where id = :i"), {"i": gb["id"]}).scalar() == 1
    # the old session cannot recreate the account
    r = client.get("/api/me", headers=user_a)
    assert r.status_code == 401 and "deleted" in r.json()["detail"]
    # B is untouched
    assert client.get(f"/api/garments/{gb['id']}", headers=user_b).status_code == 200


def test_color_profile_flag_and_consent(client, user_a, monkeypatch):
    assert client.get("/api/account/color-photos", headers=user_a).status_code == 404
    monkeypatch.setattr(get_settings(), "feature_color_profile", True)
    from app.testing.synth import garment_photo, jpeg_bytes
    photo = jpeg_bytes(garment_photo("top", "#3E7B4A", seed=64))
    assert client.post("/api/account/color-photos", files={"file": ("p.jpg", photo, "image/jpeg")}, headers=user_a).status_code == 403
    client.post("/api/account/consents", json={"kind": "color_profile", "granted": True}, headers=user_a)
    r = client.post("/api/account/color-photos", files={"file": ("p.jpg", photo, "image/jpeg")}, headers=user_a)
    assert r.status_code == 201 and any(c["name"] == "green" for c in r.json()["palette"])
    listing = client.get("/api/account/color-photos", headers=user_a).json()
    assert listing["consented"] and len(listing["photos"]) == 1
    # withdrawing consent deletes the photos
    client.post("/api/account/consents", json={"kind": "color_profile", "granted": False}, headers=user_a)
    assert client.get("/api/account/color-photos", headers=user_a).json()["photos"] == []
