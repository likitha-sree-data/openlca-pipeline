from app.testing.synth import garment_photo, jpeg_bytes


def scan_one(client, headers, category="top", color="#5F6136", seed=0, hint=None, **kw):
    data = jpeg_bytes(garment_photo(category, color, seed=seed, **kw))
    files = [("files", (f"{category}-{seed}.jpg", data, "image/jpeg"))]
    r = client.post("/api/scan", files=files, data={"hint": hint} if hint else None, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["results"][0]


def add_garment(client, headers, category="top", color="#5F6136", seed=0, name=None, **fields):
    d = scan_one(client, headers, category, color, seed, hint=category)
    assert d["status"] == "ready", d
    body = {"draft_id": d["id"], "name": name or d["name"], "category": category, "color_name": d["color_name"],
            "formality": fields.pop("formality", d["formality"]), "warmth": fields.pop("warmth", d["warmth"]), **fields}
    r = client.post("/api/garments", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()
