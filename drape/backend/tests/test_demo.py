from datetime import date

from app.demo.seed import last_weekday


def test_last_weekday():
    thu = date(2026, 10, 15)
    assert last_weekday(0, thu) == date(2026, 10, 12)
    assert last_weekday(2, thu) == date(2026, 10, 14)
    assert last_weekday(3, thu) == date(2026, 10, 8)


def test_demo_start_seeds_closet_and_history(client):
    r = client.post("/api/demo/start")
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/me", headers=h).json()
    assert me["is_demo"] is True
    items = client.get("/api/garments", headers=h).json()["items"]
    names = {g["name"] for g in items}
    assert {"Cream cotton shirt", "Navy straight jeans", "Olive cardigan", "Beige trousers", "White trainers", "Black blazer"} <= names
    assert len(items) >= 10
    assert all(g["image_url"].startswith("/demo-garments/") for g in items)
    trousers = next(g for g in items if g["name"] == "Beige trousers")
    assert trousers["wear_count"] == 2
