import io
from datetime import date

from PIL import Image

from app.config import get_settings
from app.testing.synth import jpeg_bytes, outfit_photo
from tests.helpers import add_garment


def wardrobe(client, h):
    ids = {}
    for key, cat, color, seed in [("cream_top", "top", "#EDE4CF", 1), ("red_top", "top", "#B8302F", 2),
                                  ("navy_bottom", "bottom", "#1F2D4D", 3), ("beige_bottom", "bottom", "#D3C0A0", 4),
                                  ("white_shoes", "shoes", "#F4F4F0", 5), ("brown_shoes", "shoes", "#6B4A32", 6)]:
        bg = "#2B2B2B" if color in ("#EDE4CF", "#F4F4F0") else "#E9E6E1"
        from app.testing.synth import garment_photo
        d = client.post("/api/scan", files=[("files", (f"{key}.jpg", jpeg_bytes(garment_photo(cat, color, bg=bg, seed=seed)), "image/jpeg"))],
                        data={"hint": cat}, headers=h).json()["results"][0]
        g = client.post("/api/garments", json={"draft_id": d["id"], "name": key.replace("_", " ").capitalize(), "category": cat}, headers=h).json()
        ids[key] = g["id"]
    return ids


def counts(client, h):
    return {g["id"]: g["wear_count"] for g in client.get("/api/garments", headers=h).json()["items"]}


def upload(client, h, keep=None):
    data = {"worn_on": date.today().isoformat(), "occasion": "work"}
    if keep is not None:
        data["keep_original"] = "true" if keep else "false"
    photo = jpeg_bytes(outfit_photo("#EDE4CF", "#1F2D4D", "#F4F4F0"))
    r = client.post("/api/history/photos", files={"file": ("me.jpg", photo, "image/jpeg")}, data=data, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_photo_matching_confirm_writes_logs_once_and_deletes_original(client, user_a):
    ids = wardrobe(client, user_a)
    before = counts(client, user_a)
    p = upload(client, user_a)
    assert p["status"] == "pending_review" and p["has_original"]
    kinds = {d["kind"]: d for d in p["detections"]}
    assert {"upper", "lower", "shoes"} <= set(kinds)
    assert kinds["upper"]["candidates"][0]["garment_id"] == ids["cream_top"]
    assert kinds["lower"]["candidates"][0]["garment_id"] == ids["navy_bottom"]
    assert kinds["shoes"]["candidates"][0]["garment_id"] == ids["white_shoes"]
    assert all(d["crop_url"] for d in p["detections"])
    # the crop never includes the head: upper band starts below the top of the figure
    assert kinds["upper"]["bbox"][1] > 0.12
    # nothing recorded yet
    assert counts(client, user_a) == before
    hist = client.get("/api/history", headers=user_a).json()["entries"]
    assert hist[0]["status"] == "needs_review"

    matches = [{"detection_id": kinds["upper"]["id"], "garment_id": ids["cream_top"]},
               {"detection_id": kinds["lower"]["id"], "garment_id": ids["navy_bottom"]},
               {"detection_id": kinds["shoes"]["id"], "garment_id": None}]
    r = client.post(f"/api/history/photos/{p['id']}/confirm", json={"matches": matches}, headers=user_a)
    assert r.status_code == 200, r.text
    after = counts(client, user_a)
    assert after[ids["cream_top"]] == before[ids["cream_top"]] + 1
    assert after[ids["navy_bottom"]] == before[ids["navy_bottom"]] + 1
    assert after[ids["white_shoes"]] == before[ids["white_shoes"]]
    assert sum(after.values()) == sum(before.values()) + 2
    assert r.json()["has_original"] is False
    original = get_settings().local_storage_dir + "/outfit-photos/" + client.get("/api/me", headers=user_a).json()["id"] + f"/{p['id']}/original.jpg"
    import os
    assert not os.path.exists(original)
    # confirming twice changes nothing
    assert client.post(f"/api/history/photos/{p['id']}/confirm", json={"matches": matches}, headers=user_a).status_code == 409
    assert counts(client, user_a) == after
    entry = client.get("/api/history", headers=user_a).json()["entries"][0]
    assert entry["status"] == "confirmed" and len(entry["pieces"]) == 2


def test_keep_original_toggle(client, user_a):
    wardrobe(client, user_a)
    p = upload(client, user_a, keep=True)
    r = client.post(f"/api/history/photos/{p['id']}/confirm", json={"matches": []}, headers=user_a).json()
    assert r["has_original"] is True


def test_photo_exif_stripped_and_isolation(client, user_a, user_b):
    wardrobe(client, user_a)
    img = outfit_photo("#EDE4CF", "#1F2D4D", "#F4F4F0")
    exif = Image.Exif()
    exif[0x010F] = "SecretCam"
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    r = client.post("/api/history/photos", files={"file": ("me.jpg", buf.getvalue(), "image/jpeg")},
                    data={"worn_on": date.today().isoformat()}, headers=user_a).json()
    for d in r["detections"]:
        assert not Image.open(io.BytesIO(client.get(d["crop_url"]).content)).getexif()
    assert client.get(f"/api/history/photos/{r['id']}", headers=user_b).status_code == 404
    assert client.post(f"/api/history/photos/{r['id']}/confirm", json={"matches": []}, headers=user_b).status_code == 404
    assert client.delete(f"/api/history/{r['outfit_id']}", headers=user_b).status_code == 404
    assert client.get("/api/history", headers=user_b).json()["entries"] == []


def test_cannot_confirm_someone_elses_garment(client, user_a, user_b):
    ids_b = wardrobe(client, user_b)
    wardrobe(client, user_a)
    p = upload(client, user_a)
    det = p["detections"][0]["id"]
    r = client.post(f"/api/history/photos/{p['id']}/confirm", json={"matches": [{"detection_id": det, "garment_id": ids_b["cream_top"]}]}, headers=user_a)
    assert r.status_code == 400
    assert counts(client, user_b)[ids_b["cream_top"]] == 0


def test_manual_log_resave_and_insights(client):
    h = {"Authorization": f"Bearer {client.post('/api/demo/start').json()['access_token']}"}
    hist = client.get("/api/history", headers=h).json()
    names = [e["name"] for e in hist["entries"]]
    assert names == ["Meeting", "Everyday", "Office"]
    assert all(e["status"] == "confirmed" for e in hist["entries"])
    r = client.post(f"/api/history/{hist['entries'][0]['id']}/resave", headers=h)
    assert r.status_code == 201 and r.json()["saved"] is True
    ins = client.get("/api/insights", headers=h).json()
    assert ins["total_wears"] == 11
    top = ins["most_worn"][0]
    assert top["wears"] == 2 and len(top["wear_log_ids"]) == 2
    logs = {w["id"] for w in client.get(f"/api/wear-logs?garment_id={top['garment']['id']}", headers=h).json()}
    assert logs == set(top["wear_log_ids"])
    assert any(g["name"] == "Olive cardigan" for g in ins["never_worn"])
    assert sum(c["wears"] for c in ins["by_category"]) == 11
    assert ins["cost_per_wear"][0]["cost_per_wear"] <= ins["cost_per_wear"][-1]["cost_per_wear"]
    month = hist["months"][0]
    assert client.get(f"/api/history?month={month}", headers=h).json()["entries"]
    assert client.get("/api/history?month=bad", headers=h).status_code == 400
