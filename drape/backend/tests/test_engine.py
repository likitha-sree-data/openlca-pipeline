from datetime import date, timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from app.engine import (
    Context,
    Engine,
    Piece,
    capsule,
    new_outfit_count,
    update_taste,
    valid_outfit_count,
    versatility,
    works_with,
)

TODAY = date(2026, 10, 15)


def wardrobe() -> list[Piece]:
    return [
        Piece("t1", "Cream cotton shirt", "top", "cream", "#EDE4CF", formality=2, warmth=1),
        Piece("t2", "White tee", "top", "white", "#F4F4F0", formality=1, warmth=1),
        Piece("t3", "Rust knit", "top", "rust", "#A3512B", formality=1, warmth=3),
        Piece("b1", "Navy straight jeans", "bottom", "navy", "#1F2D4D", formality=1, warmth=2),
        Piece("b2", "Beige trousers", "bottom", "beige", "#D3C0A0", formality=2, warmth=2),
        Piece("l1", "Olive cardigan", "layer", "olive", "#5F6136", formality=1, warmth=3),
        Piece("l2", "Black blazer", "layer", "black", "#1C1C1C", formality=3, warmth=2),
        Piece("s1", "White trainers", "shoes", "white", "#F4F4F0", formality=1, warmth=2),
        Piece("s2", "Brown loafers", "shoes", "brown", "#6B4A32", formality=2, warmth=2),
        Piece("s3", "Tan sandals", "shoes", "tan", "#A7825C", formality=1, warmth=1, subtype="sandals"),
        Piece("d1", "Green dress", "dress", "green", "#3E7B4A", formality=2, warmth=1),
    ]


def test_suggest_returns_valid_outfits_with_reasons():
    eng = Engine(wardrobe(), Context(occasion="work", today=TODAY, seed=1))
    outs = eng.suggest(n=4)
    assert outs
    for o in outs:
        assert eng.is_valid(o)
        assert 1 <= len(o.reasons) <= 3


def test_dress_never_with_top_or_bottom():
    eng = Engine(wardrobe(), Context(today=TODAY, seed=3))
    for o in eng.suggest(n=12):
        if "dress" in o.pieces:
            assert "top" not in o.pieces and "bottom" not in o.pieces


def test_for_sale_and_archived_excluded_by_default():
    ps = wardrobe()
    ps[0].status = "for_sale"
    ps[3].status = "archived"
    ps[4].status = "donate"
    eng = Engine(ps, Context(today=TODAY, seed=2))
    ids = {pid for o in eng.suggest(n=10) for pid in o.ids}
    assert not ids & {"t1", "b1", "b2"}


def test_keepsake_is_still_eligible():
    ps = wardrobe()
    ps[5].status = "keepsake"
    assert versatility(ps)["l1"] > 0


def test_stable_for_fixed_seed():
    a = [o.ids for o in Engine(wardrobe(), Context(today=TODAY, seed=42)).suggest(n=5)]
    b = [o.ids for o in Engine(wardrobe(), Context(today=TODAY, seed=42)).suggest(n=5)]
    assert a == b


def test_shuffle_changes_with_seed():
    results = {tuple(Engine(wardrobe(), Context(today=TODAY, seed=s)).suggest(n=1)[0].ids) for s in range(12)}
    assert len(results) > 1


def test_no_piece_dominates():
    outs = Engine(wardrobe(), Context(today=TODAY, seed=5)).suggest(n=4)
    from collections import Counter
    c = Counter(pid for o in outs for pid in o.ids)
    assert max(c.values()) <= 2


def test_cold_prefers_layer_and_penalizes_sandals():
    eng = Engine(wardrobe(), Context(today=TODAY, temp_c=6, seed=1))
    outs = eng.suggest(n=3)
    assert all("layer" in o.pieces for o in outs)
    assert all(not o.pieces["shoes"].is_sandal for o in outs)
    assert any("with a layer" in r for o in outs for r in o.reasons)


def test_hot_avoids_layers():
    outs = Engine(wardrobe(), Context(today=TODAY, temp_c=30, seed=1)).suggest(n=2)
    assert all("layer" not in o.pieces for o in outs)


def test_formal_occasion_prefers_formal_pieces():
    eng = Engine(wardrobe(), Context(occasion="formal", today=TODAY, seed=1))
    best = eng.suggest(n=1)[0]
    assert sum(p.formality for p in best.pieces.values()) / len(best.pieces) >= 1.75


def test_freshness_penalizes_recently_worn():
    ps = wardrobe()
    for p in ps:
        p.last_worn = TODAY - timedelta(days=60)
    ps[1].last_worn = TODAY - timedelta(days=1)  # white tee worn yesterday
    eng = Engine(ps, Context(occasion="everyday", today=TODAY, seed=0))
    assert "t2" not in eng.suggest(n=1)[0].ids


def test_not_worn_reason():
    ps = wardrobe()
    eng = Engine(ps, Context(today=TODAY, seed=0, temp_c=8))
    outs = eng.suggest(n=3)
    assert any(r.startswith("Not worn yet:") for o in outs for r in o.reasons)


def test_color_prefs_shift_scores():
    base = Engine(wardrobe(), Context(today=TODAY, seed=0))
    avoid = Engine(wardrobe(), Context(today=TODAY, seed=0, avoid=frozenset({"navy"})))
    o = base.outfit_from_ids(["t1", "b1", "s1"])
    assert avoid.score_outfit(o) < base.score_outfit(o)


def test_pinned_piece_always_included():
    eng = Engine(wardrobe(), Context(today=TODAY, seed=0))
    for o in eng.suggest(n=3, pinned="l1"):
        assert "l1" in o.ids


def test_alternatives_and_swap_stay_valid():
    eng = Engine(wardrobe(), Context(today=TODAY, seed=0))
    o = eng.suggest(n=1)[0]
    slot = "shoes"
    alts = eng.alternatives(o, slot)
    assert alts
    for piece, cand in alts:
        assert cand.pieces[slot].id == piece.id
        assert eng.is_valid(cand)


def test_more_from_changes_one_piece():
    eng = Engine(wardrobe(), Context(today=TODAY, seed=0))
    o = eng.outfit_from_ids(["l1", "t1", "b1", "s1"])
    more = eng.more_from(o, n=3)
    assert len(more) == 3
    for m in more:
        diff = set(m.ids) ^ set(o.ids)
        assert 1 <= len(diff) <= 2  # one swap (or a dropped layer)


def test_versatility_and_counts():
    vers = versatility(wardrobe())
    total = valid_outfit_count(wardrobe())
    assert total > 0
    assert max(vers.values()) <= total
    assert vers["s1"] > 0


def test_new_outfit_count_and_works_with():
    ps = wardrobe()
    cand = Piece("cand", "Navy knit sweater", "top", "navy", "#1F2D4D", formality=1, warmth=3)
    assert new_outfit_count(ps, cand) > 0
    partners = [pid for pid, _ in works_with(ps, cand)]
    assert "b2" in partners and "s1" in partners


def test_capsule_makes_outfits():
    ids, count = capsule(wardrobe(), size=6)
    assert len(ids) == 6 and count > 0


def test_taste_update_moves_scores():
    eng = Engine(wardrobe(), Context(today=TODAY, seed=0))
    o = eng.outfit_from_ids(["t1", "b1", "s1"])
    w = {}
    for _ in range(5):
        w = update_taste(w, list(o.pieces.values()), liked=True)
    liked = Engine(wardrobe(), Context(today=TODAY, seed=0, taste=w))
    assert liked.score_outfit(liked.outfit_from_ids(["t1", "b1", "s1"])) > eng.score_outfit(o)
    w2 = update_taste({}, list(o.pieces.values()), liked=False)
    assert all(v < 0 for v in w2.values())


def test_empty_wardrobe_reports_missing():
    eng = Engine([Piece("t", "Tee", "top", "white", "#FFFFFF")], Context())
    assert eng.suggest() == []
    assert set(eng.missing()) == {"shoes", "bottom"}


CATS = ["top", "bottom", "layer", "dress", "shoes", "accessory"]
HEXES = ["#1F2D4D", "#EDE4CF", "#5F6136", "#A3512B", "#B8302F", "#2F5DA8", "#1C1C1C", "#E3A1B2"]
STATUSES = ["active", "active", "active", "for_sale", "archived", "keepsake", "donate"]

piece_strategy = st.builds(
    lambda i, cat, hx, pat, f, w, status: Piece(f"g{i}", f"Piece {i}", cat, None, hx, pat, f, w, status=status),
    st.integers(0, 10_000), st.sampled_from(CATS), st.sampled_from(HEXES), st.sampled_from(["solid", "patterned"]),
    st.integers(1, 3), st.integers(1, 3), st.sampled_from(STATUSES),
)


@settings(max_examples=60, deadline=None)
@given(st.lists(piece_strategy, min_size=0, max_size=24, unique_by=lambda p: p.id), st.integers(0, 99),
       st.sampled_from(["everyday", "work", "formal", "weekend"]), st.one_of(st.none(), st.floats(-5, 35)))
def test_property_outfit_rules(pieces, seed, occasion, temp):
    eng = Engine(pieces, Context(occasion=occasion, temp_c=temp, seed=seed, today=TODAY))
    outs = eng.suggest(n=5)
    by_id = {p.id: p for p in pieces}
    for o in outs:
        cats = [by_id[i].category for i in o.ids]
        assert cats.count("bottom") <= 1
        assert cats.count("top") <= 1
        assert not ("dress" in cats and "top" in cats)
        assert not ("dress" in cats and "bottom" in cats)
        assert "shoes" in cats
        assert "accessory" not in cats
        assert all(by_id[i].status in {"active", "keepsake"} for i in o.ids)
        assert eng.is_valid(o)
    again = Engine(pieces, Context(occasion=occasion, temp_c=temp, seed=seed, today=TODAY)).suggest(n=5)
    assert [o.ids for o in outs] == [o.ids for o in again]
