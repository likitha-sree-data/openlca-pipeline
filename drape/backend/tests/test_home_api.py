from datetime import date, timedelta


def demo(client):
    r = client.post("/api/demo/start")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_suggest_swap_save_and_more(client):
    h = demo(client)
    r = client.post("/api/outfits/suggest", json={"occasion": "work", "seed": 3}, headers=h).json()
    o = r["outfit"]
    assert o and 3 <= len(o["pieces"]) <= 4 and o["reasons"]
    assert all(p["garment"]["name"] for p in o["pieces"])
    assert len(r["more"]) == 3
    pieces = [{"slot": p["slot"], "garment_id": p["garment_id"]} for p in o["pieces"]]
    alts = client.post("/api/outfits/alternatives", json={"pieces": pieces, "slot": "shoes", "occasion": "work"}, headers=h).json()
    assert alts["options"]
    swapped = alts["options"][0]["outfit"]
    shoes = next(p for p in swapped["pieces"] if p["slot"] == "shoes")
    assert shoes["garment_id"] != next(p for p in pieces if p["slot"] == "shoes")["garment_id"]
    saved = client.post("/api/outfits", json={"pieces": [{"slot": p["slot"], "garment_id": p["garment_id"]} for p in swapped["pieces"]],
                                               "occasion": "work"}, headers=h)
    assert saved.status_code == 201
    looks = client.get("/api/outfits", headers=h).json()
    assert any(lk["id"] == saved.json()["id"] for lk in looks)
    assert client.get("/api/me", headers=h).status_code == 200


def test_shuffle_seed_changes_and_pin(client):
    h = demo(client)
    garments = client.get("/api/garments", headers=h).json()["items"]
    olive = next(g for g in garments if g["name"] == "Olive cardigan")
    seen = set()
    for seed in range(6):
        o = client.post("/api/outfits/suggest", json={"seed": seed}, headers=h).json()["outfit"]
        seen.add(tuple(sorted(p["garment_id"] for p in o["pieces"])))
    assert len(seen) > 1
    pinned = client.post("/api/outfits/suggest", json={"pinned": olive["id"]}, headers=h).json()["outfit"]
    assert olive["id"] in [p["garment_id"] for p in pinned["pieces"]]


def test_empty_closet_says_what_to_add(client, user_a):
    r = client.post("/api/outfits/suggest", json={}, headers=user_a).json()
    assert r["outfit"] is None and set(r["missing"]) == {"top", "bottom", "shoes"}


def test_wear_today_needs_confirmation_and_logs_once(client):
    h = demo(client)
    o = client.post("/api/outfits/suggest", json={"seed": 1}, headers=h).json()["outfit"]
    pieces = [{"slot": p["slot"], "garment_id": p["garment_id"]} for p in o["pieces"]]
    before = {g["id"]: g["wear_count"] for g in client.get("/api/garments", headers=h).json()["items"]}
    assert client.post("/api/outfits/wear", json={"pieces": pieces}, headers=h).status_code == 400
    after_refused = {g["id"]: g["wear_count"] for g in client.get("/api/garments", headers=h).json()["items"]}
    assert after_refused == before
    assert client.post("/api/outfits/wear", json={"pieces": pieces, "confirmed": True}, headers=h).status_code == 201
    after = {g["id"]: g["wear_count"] for g in client.get("/api/garments", headers=h).json()["items"]}
    for p in pieces:
        assert after[p["garment_id"]] == before[p["garment_id"]] + 1
    others = set(before) - {p["garment_id"] for p in pieces}
    assert all(after[g] == before[g] for g in others)


def test_plans_strip(client):
    h = demo(client)
    o = client.post("/api/outfits/suggest", json={}, headers=h).json()["outfit"]
    pieces = [{"slot": p["slot"], "garment_id": p["garment_id"]} for p in o["pieces"]]
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    r = client.put("/api/plans", json={"plan_date": tomorrow, "occasion": "meeting", "pieces": pieces}, headers=h)
    assert r.status_code == 200
    # planning the same day again replaces it
    client.put("/api/plans", json={"plan_date": tomorrow, "occasion": "date", "pieces": pieces}, headers=h)
    plans = client.get("/api/plans", headers=h).json()
    assert len(plans) == 1 and plans[0]["occasion"] == "date" and plans[0]["outfit"]["pieces"]
    assert client.delete(f"/api/plans/{tomorrow}", headers=h).status_code == 204
    assert client.get("/api/plans", headers=h).json() == []


def test_color_prefs_validation_and_effect(client):
    h = demo(client)
    assert client.put("/api/prefs/colors", json={"favorites": ["neon"], "avoid": []}, headers=h).status_code == 400
    assert client.put("/api/prefs/colors", json={"favorites": ["navy"], "avoid": ["navy"]}, headers=h).status_code == 400
    r = client.put("/api/prefs/colors", json={"favorites": ["olive"], "avoid": ["navy"]}, headers=h)
    assert r.json()["avoid"] == ["navy"]
    for seed in range(4):
        o = client.post("/api/outfits/suggest", json={"seed": seed}, headers=h).json()["outfit"]
        assert all(p["garment"]["color_name"] != "navy" for p in o["pieces"])


def test_versatility_and_capsule(client):
    h = demo(client)
    v = client.get("/api/versatility?capsule_size=6", headers=h).json()
    assert v["total_outfits"] > 10
    counts = [r["outfits"] for r in v["ranked"]]
    assert counts == sorted(counts, reverse=True)
    assert len(v["capsule"]["garments"]) == 6 and v["capsule"]["outfits"] > 0


def test_cannot_save_someone_elses_garment(client, user_a):
    h = demo(client)
    o = client.post("/api/outfits/suggest", json={}, headers=h).json()["outfit"]
    pieces = [{"slot": p["slot"], "garment_id": p["garment_id"]} for p in o["pieces"]]
    assert client.post("/api/outfits", json={"pieces": pieces}, headers=user_a).status_code == 400
    assert client.post("/api/outfits/wear", json={"pieces": pieces, "confirmed": True}, headers=user_a).status_code == 400
    saved = client.post("/api/outfits", json={"pieces": pieces}, headers=h).json()
    assert client.get(f"/api/outfits/{saved['id']}", headers=user_a).status_code == 404
    assert client.delete(f"/api/outfits/{saved['id']}", headers=user_a).status_code == 404
