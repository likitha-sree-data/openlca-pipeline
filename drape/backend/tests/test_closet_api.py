import io

from PIL import Image

from app.testing.synth import BATCH_12, garment_photo, jpeg_bytes
from tests.helpers import add_garment, scan_one


def test_config_and_me(client, user_a):
    assert client.get("/api/config").json()["dev_login"] is True
    me = client.get("/api/me", headers=user_a).json()
    assert me["units"] == "c" and me["nudge_days"] == 90


def test_requires_auth(client):
    assert client.get("/api/garments").status_code == 401
    assert client.get("/api/garments", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_batch_of_12_scan_save_filter_search(client, user_a):
    drafts = []
    for i in range(0, 12, 6):
        files = []
        for j, (cat, color, name) in enumerate(BATCH_12[i:i + 6]):
            bg = "#2B2B2B" if name in ("white", "cream") else "#E9E6E1"
            files.append(("files", (f"{name}-{cat}.jpg", jpeg_bytes(garment_photo(cat, color, bg=bg, seed=i + j)), "image/jpeg")))
        r = client.post("/api/scan", files=files, headers=user_a)
        assert r.status_code == 200, r.text
        drafts += r.json()["results"]
    assert len(drafts) == 12
    assert all(d["status"] == "ready" for d in drafts), [d.get("error") for d in drafts]
    assert len(client.get("/api/drafts", headers=user_a).json()) == 12
    # nothing is a garment yet
    assert client.get("/api/garments", headers=user_a).json()["total"] == 0
    for d, (cat, color, name) in zip(drafts, BATCH_12):
        wrong = "accessory" if cat == "layer" and name == "olive" else cat
        r = client.post("/api/garments", json={"draft_id": d["id"], "name": f"{name.capitalize()} {cat}", "category": wrong,
                                                "color_name": name}, headers=user_a)
        assert r.status_code == 201, r.text
    listing = client.get("/api/garments", headers=user_a).json()
    assert listing["total"] == 12
    olive = next(g for g in listing["items"] if g["name"] == "Olive layer")
    assert olive["category"] == "accessory"
    # correct the wrong category
    fixed = client.patch(f"/api/garments/{olive['id']}", json={"category": "layer"}, headers=user_a).json()
    assert fixed["category"] == "layer"
    layers = client.get("/api/garments?category=layer", headers=user_a).json()["items"]
    assert {g["name"] for g in layers} == {"Olive layer", "Black layer"}
    assert len(client.get("/api/garments?category=top", headers=user_a).json()["items"]) == 4
    assert [g["name"] for g in client.get("/api/garments?q=navy", headers=user_a).json()["items"]] == ["Navy bottom"]
    assert client.get("/api/drafts", headers=user_a).json() == []


def test_exact_duplicate_skipped_near_duplicate_flagged(client, user_a):
    data = jpeg_bytes(garment_photo("top", "#2F5DA8", seed=1))
    r = client.post("/api/scan", files=[("files", ("a.jpg", data, "image/jpeg")), ("files", ("b.jpg", data, "image/jpeg"))], headers=user_a)
    res = r.json()["results"]
    assert res[0]["status"] == "ready" and res[1]["status"] == "duplicate"
    client.post("/api/garments", json={"draft_id": res[0]["id"], "name": "Blue tee", "category": "top"}, headers=user_a)
    near = scan_one(client, user_a, "top", "#2F5DA8", seed=2, hint="top")
    assert near["status"] == "ready"
    assert near["near_duplicate"] and near["near_duplicate"]["name"] == "Blue tee"


def test_upload_validation(client, user_a):
    r = client.post("/api/scan", files=[("files", ("x.jpg", b"not an image", "image/jpeg"))], headers=user_a)
    assert r.json()["results"][0]["status"] == "error"
    gif = io.BytesIO()
    Image.new("RGB", (50, 50)).save(gif, "GIF")
    r = client.post("/api/scan", files=[("files", ("x.gif", gif.getvalue(), "image/gif"))], headers=user_a)
    assert "not supported" in r.json()["results"][0]["error"]
    big = b"\xff\xd8" + b"0" * (13 * 1024 * 1024)
    r = client.post("/api/scan", files=[("files", ("big.jpg", big, "image/jpeg"))], headers=user_a)
    assert "larger than" in r.json()["results"][0]["error"]
    too_many = [("files", (f"{i}.jpg", b"x", "image/jpeg")) for i in range(7)]
    assert client.post("/api/scan", files=too_many, headers=user_a).status_code == 400


def test_exif_is_stripped(client, user_a):
    img = garment_photo("top", "#B8302F", seed=9)
    exif = Image.Exif()
    exif[0x010F] = "SecretCam"
    exif[0x8825] = {2: (51.0, 30.0, 0.0)}
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    r = client.post("/api/scan", files=[("files", ("e.jpg", buf.getvalue(), "image/jpeg"))], headers=user_a)
    d = r.json()["results"][0]
    for url in (d["image_url"], d["thumb_url"]):
        data = client.get(url).content
        stored = Image.open(io.BytesIO(data))
        assert not stored.getexif(), url


def test_garment_detail_edit_care_status_delete(client, user_a):
    g = add_garment(client, user_a, "layer", "#5F6136", seed=3, name="Olive cardigan", price=60)
    gid = g["id"]
    d = client.get(f"/api/garments/{gid}", headers=user_a).json()
    assert d["wear_count"] == 0 and d["cost_per_wear"] is None and d["nudge"]["never_worn"] is True
    r = client.patch(f"/api/garments/{gid}", json={"care": {"wash": "cold", "dry": "flat", "iron": "low"},
                                                   "fiber_content": [{"fiber": "wool", "percent": 80}, {"fiber": "nylon", "percent": 20}],
                                                   "status": "for_sale"}, headers=user_a)
    d = r.json()
    assert d["care_advice"] == "Wash cold, dry flat, iron on low"
    assert d["status"] == "for_sale" and d["fiber_content"][0]["fiber"] == "wool"
    assert any("vinted" in link["url"] for link in d["resale_links"])
    image = client.get(d["image_url"])
    assert image.status_code == 200
    assert client.delete(f"/api/garments/{gid}", headers=user_a).status_code == 204
    assert client.get(f"/api/garments/{gid}", headers=user_a).status_code == 404
    assert client.get(d["image_url"]).status_code == 404


def test_signed_media_rejects_tampering(client, user_a):
    g = add_garment(client, user_a, "shoes", "#6B4A32", seed=4)
    url = g["image_url"]
    assert client.get(url).status_code == 200
    assert client.get(url.replace("sig=", "sig=x")).status_code == 403
    assert client.get(url.split("?")[0] + "?exp=99999999999&sig=abc").status_code == 403


def test_care_label_without_provider_explains(client, user_a):
    g = add_garment(client, user_a, "top", "#EDE4CF", seed=5)
    r = client.post(f"/api/garments/{g['id']}/care-label", files={"file": ("l.jpg", jpeg_bytes(garment_photo("top", "#FFFFFF")), "image/jpeg")}, headers=user_a)
    assert r.status_code == 503 and "by hand" in r.json()["detail"]


def test_validation_errors_are_readable(client, user_a):
    r = client.post("/api/garments", json={"draft_id": "not-a-uuid", "name": "", "category": "hat"}, headers=user_a)
    assert r.status_code == 422
    assert r.json()["detail"].startswith("Check these fields")
