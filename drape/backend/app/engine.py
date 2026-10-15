"""Deterministic outfit engine. No LLM involved.

Slots: optional layer, then top, bottom, shoes; or dress, shoes and an
optional layer. Validity is pairwise (no clash, not two patterns, formality
within one step), so outfits are found with boolean tensors in numpy and
scored with vectorized features. Randomness is always seeded.
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import numpy as np

from .colors import Swatch, harmony_phrase, pair_harmony, swatch

OCCASIONS = {
    "everyday": ("Everyday", 1.3),
    "work": ("Work", 2.0),
    "meeting": ("Meeting", 2.5),
    "date": ("Date", 2.0),
    "formal": ("Formal", 3.0),
    "weekend": ("Weekend", 1.0),
}
ELIGIBLE_STATUS = {"active", "keepsake"}
SLOT_OF = {"top": "top", "bottom": "bottom", "layer": "layer", "dress": "dress", "shoes": "shoes"}
SLOT_ORDER = ["layer", "top", "dress", "bottom", "shoes"]
MAX_COMBOS = 250_000
TASTE_LR = 0.3


@dataclass
class Piece:
    id: str
    name: str
    category: str
    color_name: str | None = None
    color_hex: str | None = None
    pattern: str = "solid"
    formality: int = 1
    warmth: int = 2
    subtype: str | None = None
    status: str = "active"
    last_worn: date | None = None
    wear_count: int = 0
    _swatch: Swatch | None = field(default=None, repr=False)

    @property
    def sw(self) -> Swatch:
        if self._swatch is None:
            self._swatch = swatch(self.color_name, self.color_hex, self.pattern)
        return self._swatch

    @property
    def is_sandal(self) -> bool:
        return self.category == "shoes" and "sandal" in (self.subtype or "").lower()


@dataclass
class Context:
    occasion: str = "everyday"
    temp_c: float | None = None
    today: date | None = None
    favorites: frozenset[str] = frozenset()
    avoid: frozenset[str] = frozenset()
    taste: dict[str, float] = field(default_factory=dict)
    seed: int = 0
    include_statuses: frozenset[str] = frozenset(ELIGIBLE_STATUS)

    @property
    def formality_target(self) -> float:
        return OCCASIONS.get(self.occasion, OCCASIONS["everyday"])[1]

    @property
    def warmth_target(self) -> float | None:
        if self.temp_c is None:
            return None
        if self.temp_c >= 24:
            return 1.0
        if self.temp_c >= 14:
            return 2.0
        return 3.0


@dataclass
class Outfit:
    pieces: dict[str, Piece]  # slot -> piece
    score: float = 0.0
    reasons: list[str] = field(default_factory=list)

    @property
    def ids(self) -> list[str]:
        return [self.pieces[s].id for s in SLOT_ORDER if s in self.pieces]

    def key(self) -> frozenset[str]:
        return frozenset(self.ids)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pieces": [{"slot": s, "garment_id": self.pieces[s].id} for s in SLOT_ORDER if s in self.pieces],
            "score": round(self.score, 4),
            "reasons": self.reasons,
        }


# ---------------------------------------------------------------- helpers

def eligible(pieces: list[Piece], ctx: Context) -> list[Piece]:
    return [p for p in pieces if p.status in ctx.include_statuses and p.category in SLOT_OF]


def pair_matrices(pieces: list[Piece]) -> tuple[np.ndarray, np.ndarray, list[list[str]]]:
    """Pair score matrix, validity matrix and the harmony kind for each pair."""
    n = len(pieces)
    score = np.zeros((n, n), dtype=np.float32)
    kinds = [[""] * n for _ in range(n)]
    form = np.array([p.formality for p in pieces], dtype=np.int16)
    for i in range(n):
        for j in range(i + 1, n):
            s, k = pair_harmony(pieces[i].sw, pieces[j].sw)
            score[i, j] = score[j, i] = s
            kinds[i][j] = kinds[j][i] = k
    valid = (score >= 0) & (np.abs(form[:, None] - form[None, :]) <= 1)
    return score, valid, kinds


def _days_since(p: Piece, today: date) -> int | None:
    return None if p.last_worn is None else max(0, (today - p.last_worn).days)


def freshness(p: Piece, today: date) -> float:
    d = _days_since(p, today)
    if d is None:
        return 1.0
    if d <= 2:
        return -0.6
    return min(1.0, d / 30) * 0.8


def unary_scores(pieces: list[Piece], ctx: Context) -> dict[str, np.ndarray]:
    today = ctx.today or date.today()
    target = ctx.formality_target
    wt = ctx.warmth_target
    formality = np.array([1 - abs(p.formality - target) / 2 for p in pieces], dtype=np.float32)
    if wt is None:
        weather = np.zeros(len(pieces), dtype=np.float32)
    else:
        weather = np.array([
            (1 - abs(p.warmth - wt) / 2) - (1.0 if p.is_sandal and ctx.temp_c is not None and ctx.temp_c < 15 else 0.0)
            for p in pieces
        ], dtype=np.float32)
    fresh = np.array([freshness(p, today) for p in pieces], dtype=np.float32)
    prefs = np.array([
        (0.25 if p.sw.name in ctx.favorites else 0.0) - (0.4 if p.sw.name in ctx.avoid else 0.0) for p in pieces
    ], dtype=np.float32)
    taste = np.array([
        ctx.taste.get(f"item:{p.id}", 0.0) + ctx.taste.get(f"color:{p.sw.name}", 0.0) for p in pieces
    ], dtype=np.float32)
    return {"formality": formality, "weather": weather, "fresh": fresh, "prefs": prefs, "taste": taste}


# ---------------------------------------------------------------- enumeration

@dataclass
class Combos:
    """All valid outfits as index arrays; -1 means the slot is empty."""
    layer: np.ndarray
    top: np.ndarray
    dress: np.ndarray
    bottom: np.ndarray
    shoes: np.ndarray

    def __len__(self) -> int:
        return len(self.shoes)

    def rows(self) -> np.ndarray:
        return np.stack([self.layer, self.top, self.dress, self.bottom, self.shoes], axis=1)


def _idx(pieces: list[Piece], cat: str) -> np.ndarray:
    return np.array([i for i, p in enumerate(pieces) if p.category == cat], dtype=np.int64)


def enumerate_valid(pieces: list[Piece], valid: np.ndarray, limit: int | None = MAX_COMBOS,
                    rng: np.random.Generator | None = None) -> Combos:
    tops, bottoms, shoes = _idx(pieces, "top"), _idx(pieces, "bottom"), _idx(pieces, "shoes")
    dresses, layers = _idx(pieces, "dress"), _idx(pieces, "layer")
    parts: list[np.ndarray] = []

    if len(tops) and len(bottoms) and len(shoes):
        t3 = valid[np.ix_(tops, bottoms)][:, :, None] & valid[np.ix_(tops, shoes)][:, None, :] & valid[np.ix_(bottoms, shoes)][None, :, :]
        ti, bi, si = np.nonzero(t3)
        base = np.stack([np.full(len(ti), -1), tops[ti], np.full(len(ti), -1), bottoms[bi], shoes[si]], axis=1)
        parts.append(base)
        if len(layers):
            for li in layers:
                ok = valid[li, base[:, 1]] & valid[li, base[:, 3]] & valid[li, base[:, 4]]
                with_layer = base[ok].copy()
                with_layer[:, 0] = li
                parts.append(with_layer)
    if len(dresses) and len(shoes):
        d2 = valid[np.ix_(dresses, shoes)]
        di, si = np.nonzero(d2)
        base = np.stack([np.full(len(di), -1), np.full(len(di), -1), dresses[di], np.full(len(di), -1), shoes[si]], axis=1)
        parts.append(base)
        if len(layers):
            for li in layers:
                ok = valid[li, base[:, 2]] & valid[li, base[:, 4]]
                with_layer = base[ok].copy()
                with_layer[:, 0] = li
                parts.append(with_layer)

    rows = np.concatenate(parts) if parts else np.zeros((0, 5), dtype=np.int64)
    if limit is not None and len(rows) > limit:
        rng = rng or np.random.default_rng(0)
        rows = rows[np.sort(rng.choice(len(rows), size=limit, replace=False))]
    return Combos(rows[:, 0], rows[:, 1], rows[:, 2], rows[:, 3], rows[:, 4])


def score_combos(rows: np.ndarray, pair: np.ndarray, unary: dict[str, np.ndarray], ctx: Context,
                 pieces: list[Piece], noise: np.ndarray | None = None) -> np.ndarray:
    n = len(rows)
    if n == 0:
        return np.zeros(0, dtype=np.float32)
    present = rows >= 0
    safe = np.where(present, rows, 0)
    count = present.sum(axis=1).astype(np.float32)

    harmony_sum = np.zeros(n, dtype=np.float32)
    pairs = np.zeros(n, dtype=np.float32)
    for a in range(5):
        for b in range(a + 1, 5):
            both = present[:, a] & present[:, b]
            harmony_sum += np.where(both, pair[safe[:, a], safe[:, b]], 0)
            pairs += both
    harmony = harmony_sum / np.maximum(pairs, 1)

    def mean_of(arr: np.ndarray) -> np.ndarray:
        return (np.where(present, arr[safe], 0).sum(axis=1)) / count

    total = 1.2 * harmony + 0.8 * mean_of(unary["formality"]) + 0.5 * mean_of(unary["fresh"])
    total += 0.5 * np.where(present, unary["prefs"][safe], 0).sum(axis=1)
    if ctx.warmth_target is not None:
        total += 0.6 * mean_of(unary["weather"])
        has_layer = present[:, 0]
        if ctx.temp_c is not None and ctx.temp_c < 16:
            total += np.where(has_layer, 0.3, -0.2)
        elif ctx.temp_c is not None and ctx.temp_c >= 24:
            total += np.where(has_layer, -0.4, 0.0)
    elif ctx.formality_target >= 2.5:
        total += np.where(present[:, 0], 0.1, 0.0)

    # learned taste: item and color terms plus color pair terms, squashed
    taste_lin = np.where(present, unary["taste"][safe], 0).sum(axis=1)
    if ctx.taste:
        names = [p.sw.name for p in pieces]
        for a in range(5):
            for b in range(a + 1, 5):
                both = present[:, a] & present[:, b]
                if not both.any():
                    continue
                keys = [_pair_key(names[x], names[y]) for x, y in zip(safe[:, a], safe[:, b])]
                taste_lin += np.where(both, np.array([ctx.taste.get(k, 0.0) for k in keys], dtype=np.float32), 0)
    total += 0.6 * (1 / (1 + np.exp(-taste_lin)) - 0.5)
    if noise is not None:
        total += noise
    return total.astype(np.float32)


def _pair_key(a: str, b: str) -> str:
    x, y = sorted((a, b))
    return f"pair:{x}|{y}"


# ---------------------------------------------------------------- engine API

class Engine:
    def __init__(self, pieces: list[Piece], ctx: Context) -> None:
        self.ctx = ctx
        self.all = pieces
        self.pieces = eligible(pieces, ctx)
        self.index = {p.id: i for i, p in enumerate(self.pieces)}
        self.pair, self.valid, self.kinds = pair_matrices(self.pieces)
        self.unary = unary_scores(self.pieces, ctx)
        self.rng = np.random.default_rng(ctx.seed)
        self._combos: Combos | None = None
        self._scores: np.ndarray | None = None

    # -- core
    @property
    def combos(self) -> Combos:
        if self._combos is None:
            self._combos = enumerate_valid(self.pieces, self.valid, rng=self.rng)
        return self._combos

    @property
    def scores(self) -> np.ndarray:
        if self._scores is None:
            rows = self.combos.rows()
            noise = self.rng.normal(0, 0.12, size=len(rows)).astype(np.float32)
            self._scores = score_combos(rows, self.pair, self.unary, self.ctx, self.pieces, noise)
        return self._scores

    def _row_to_outfit(self, row: np.ndarray, score: float) -> Outfit:
        slots = dict(zip(["layer", "top", "dress", "bottom", "shoes"], row))
        pieces = {s: self.pieces[i] for s, i in slots.items() if i >= 0}
        out = Outfit(pieces=pieces, score=float(score))
        out.reasons = self.reasons(out)
        return out

    def missing(self) -> list[str]:
        """What the person needs to add before any outfit can be made."""
        cats = Counter(p.category for p in self.pieces)
        needs: list[str] = []
        if cats["shoes"] == 0:
            needs.append("shoes")
        if cats["dress"] == 0:
            if cats["top"] == 0:
                needs.append("top")
            if cats["bottom"] == 0:
                needs.append("bottom")
        return needs

    def suggest(self, n: int = 1, pinned: str | None = None, exclude: set[frozenset[str]] | None = None) -> list[Outfit]:
        rows = self.combos.rows()
        if len(rows) == 0:
            return []
        scores = self.scores.copy()
        mask = np.ones(len(rows), dtype=bool)
        if pinned is not None:
            if pinned not in self.index:
                return []
            mask &= (rows == self.index[pinned]).any(axis=1)
        order = np.argsort(-np.where(mask, scores, -np.inf), kind="stable")
        order = order[mask[order]]
        cap = max(1, math.ceil(n / 2))
        chosen: list[Outfit] = []
        for relax in (cap, n):
            uses: Counter[int] = Counter()
            for o in chosen:
                for pid in o.ids:
                    uses[self.index[pid]] += 1
            for i in order:
                if len(chosen) >= n:
                    break
                row = rows[i]
                key = frozenset(self.pieces[j].id for j in row if j >= 0)
                if exclude and key in exclude:
                    continue
                if any(o.key() == key for o in chosen):
                    continue
                if any(uses[j] >= relax for j in row if j >= 0 and self.pieces[j].id != pinned):
                    continue
                chosen.append(self._row_to_outfit(row, scores[i]))
                for j in row:
                    if j >= 0:
                        uses[j] += 1
            if len(chosen) >= n:
                break
        return chosen

    def outfit_from_ids(self, ids: list[str]) -> Outfit | None:
        pieces: dict[str, Piece] = {}
        for gid in ids:
            p = next((x for x in self.all if x.id == gid), None)
            if p is None or p.category not in SLOT_OF:
                return None
            pieces[SLOT_OF[p.category]] = p
        out = Outfit(pieces=pieces)
        out.score = self.score_outfit(out)
        out.reasons = self.reasons(out)
        return out

    def is_valid(self, outfit: Outfit) -> bool:
        p = outfit.pieces
        if "shoes" not in p:
            return False
        if "dress" in p:
            if "top" in p or "bottom" in p:
                return False
        elif not ("top" in p and "bottom" in p):
            return False
        idx = [self.index.get(x.id) for x in p.values()]
        if any(i is None for i in idx):
            return False
        return all(self.valid[a, b] for k, a in enumerate(idx) for b in idx[k + 1:])

    def score_outfit(self, outfit: Outfit) -> float:
        row = np.array([[self.index.get(outfit.pieces[s].id, -1) if s in outfit.pieces else -1
                         for s in ["layer", "top", "dress", "bottom", "shoes"]]])
        if (row[0] == -1).all() or any(outfit.pieces[s].id not in self.index for s in outfit.pieces):
            return 0.0
        return float(score_combos(row, self.pair, self.unary, self.ctx, self.pieces)[0])

    def alternatives(self, outfit: Outfit, slot: str, limit: int = 8) -> list[tuple[Piece, Outfit]]:
        """Pieces that can replace the one in `slot`, ranked by the resulting outfit score."""
        cats = {"layer": ["layer"], "top": ["top"], "bottom": ["bottom"], "dress": ["dress"], "shoes": ["shoes"]}[slot]
        current = outfit.pieces.get(slot)
        results: list[tuple[Piece, Outfit]] = []
        for p in self.pieces:
            if p.category not in cats or (current and p.id == current.id):
                continue
            pieces = dict(outfit.pieces)
            pieces[slot] = p
            cand = Outfit(pieces=pieces)
            if not self.is_valid(cand):
                continue
            cand.score = self.score_outfit(cand)
            cand.reasons = self.reasons(cand)
            results.append((p, cand))
        results.sort(key=lambda x: (-x[1].score, x[0].id))
        return results[:limit]

    def more_from(self, outfit: Outfit, n: int = 3) -> list[Outfit]:
        """Swap one piece at a time from the current outfit and rank the results."""
        seen = {outfit.key()}
        found: list[Outfit] = []
        for slot in list(outfit.pieces):
            for _, cand in self.alternatives(outfit, slot, limit=4):
                if cand.key() not in seen:
                    seen.add(cand.key())
                    found.append(cand)
        if "layer" in outfit.pieces:
            pieces = {k: v for k, v in outfit.pieces.items() if k != "layer"}
            cand = Outfit(pieces=pieces)
            if self.is_valid(cand) and cand.key() not in seen:
                cand.score = self.score_outfit(cand)
                cand.reasons = self.reasons(cand)
                found.append(cand)
        found.sort(key=lambda o: (-o.score, sorted(o.ids)))
        # prefer variety: different swapped slots first
        result: list[Outfit] = []
        used_slots: set[str] = set()
        for o in found:
            changed = next((s for s in o.pieces if s not in outfit.pieces or outfit.pieces[s].id != o.pieces[s].id), "layer")
            if changed in used_slots:
                continue
            used_slots.add(changed)
            result.append(o)
            if len(result) >= n:
                return result
        for o in found:
            if o not in result:
                result.append(o)
            if len(result) >= n:
                break
        return result

    # -- explanations
    def reasons(self, outfit: Outfit) -> list[str]:
        today = self.ctx.today or date.today()
        out: list[tuple[float, str]] = []
        fresh: list[tuple[float, str]] = []
        for slot in SLOT_ORDER:
            p = outfit.pieces.get(slot)
            if p is None:
                continue
            d = _days_since(p, today)
            if d is None:
                fresh.append((3.0, f"Not worn yet: {p.name.lower()}"))
            elif d >= 21:
                weeks = d // 7
                fresh.append((2.0 + min(d, 120) / 120, f"Not worn in {weeks} weeks: {p.name.lower()}"))
        if fresh:
            out.append(max(fresh, key=lambda x: x[0]))
        ps = list(outfit.pieces.values())
        best: tuple[float, str] | None = None
        for i in range(len(ps)):
            for j in range(i + 1, len(ps)):
                s, kind = pair_harmony(ps[i].sw, ps[j].sw)
                if ps[i].sw.name == ps[j].sw.name and kind == "neutral pairing":
                    continue
                if best is None or s > best[0]:
                    best = (s, harmony_phrase(ps[i].sw.name, ps[j].sw.name, kind))
        if best:
            out.append((2.5, best[1]))
        label = OCCASIONS.get(self.ctx.occasion, OCCASIONS["everyday"])[0]
        avg_form = sum(p.formality for p in ps) / max(1, len(ps))
        if abs(avg_form - self.ctx.formality_target) <= 0.5:
            out.append((1.5, f"Right level of dress for {label.lower()}"))
        if self.ctx.temp_c is not None:
            t = round(self.ctx.temp_c)
            if "layer" in outfit.pieces and self.ctx.temp_c < 16:
                out.append((2.8, f"Warm enough for {t}°C with a layer"))
            elif self.ctx.temp_c >= 24:
                out.append((2.8, f"Light pieces for {t}°C"))
        fav = [p.sw.name for p in ps if p.sw.name in self.ctx.favorites]
        if fav:
            out.append((1.8, f"Uses a color you like: {fav[0]}"))
        out.sort(key=lambda x: -x[0])
        seen: list[str] = []
        for _, text in out:
            if text not in seen:
                seen.append(text)
        return seen[:3] or ["A balanced mix of your pieces"]


# ---------------------------------------------------------------- versatility

def valid_outfit_count(pieces: list[Piece], ctx: Context | None = None) -> int:
    ctx = ctx or Context()
    ps = eligible(pieces, ctx)
    _, valid, _ = pair_matrices(ps)
    return len(enumerate_valid(ps, valid, limit=None))


def versatility(pieces: list[Piece], ctx: Context | None = None) -> dict[str, int]:
    """For each garment, the number of distinct valid outfits it appears in."""
    ctx = ctx or Context()
    ps = eligible(pieces, ctx)
    counts = {p.id: 0 for p in pieces}
    if not ps:
        return counts
    _, valid, _ = pair_matrices(ps)
    rows = enumerate_valid(ps, valid, limit=None).rows()
    if len(rows):
        flat = rows[rows >= 0]
        binc = np.bincount(flat, minlength=len(ps))
        for i, p in enumerate(ps):
            counts[p.id] = int(binc[i])
    return counts


def capsule(pieces: list[Piece], size: int = 8, ctx: Context | None = None) -> tuple[list[str], int]:
    """Greedy pick of `size` pieces that together make the most valid outfits."""
    ctx = ctx or Context()
    ps = eligible(pieces, ctx)
    if not ps:
        return [], 0
    _, valid, _ = pair_matrices(ps)
    vers = versatility(ps, ctx)
    chosen: list[int] = []
    # seed with the most versatile piece of each core slot so the count can grow
    for cat in ("top", "bottom", "shoes"):
        cands = [i for i, p in enumerate(ps) if p.category == cat]
        if cands and len(chosen) < size:
            chosen.append(max(cands, key=lambda i: (vers[ps[i].id], ps[i].id)))

    def count(sel: list[int]) -> int:
        sub = [ps[i] for i in sel]
        return len(enumerate_valid(sub, valid[np.ix_(sel, sel)], limit=None))

    while len(chosen) < min(size, len(ps)):
        best_i, best_c = None, -1
        for i in range(len(ps)):
            if i in chosen:
                continue
            c = count(chosen + [i])
            if c > best_c or (c == best_c and best_i is not None and vers[ps[i].id] > vers[ps[best_i].id]):
                best_i, best_c = i, c
        if best_i is None:
            break
        chosen.append(best_i)
    return [ps[i].id for i in chosen], count(chosen)


def new_outfit_count(pieces: list[Piece], candidate: Piece, ctx: Context | None = None) -> int:
    """How many more valid outfits exist if the candidate joins the wardrobe."""
    ctx = ctx or Context()
    before = valid_outfit_count(pieces, ctx)
    after = valid_outfit_count(pieces + [candidate], ctx)
    return max(0, after - before)


def works_with(pieces: list[Piece], candidate: Piece, ctx: Context | None = None, limit: int = 6) -> list[tuple[str, int]]:
    """Owned pieces that appear with the candidate in valid outfits, most often first."""
    ctx = ctx or Context()
    ps = eligible(pieces, ctx) + [candidate]
    _, valid, _ = pair_matrices(ps)
    rows = enumerate_valid(ps, valid, limit=None).rows()
    ci = len(ps) - 1
    with_c = rows[(rows == ci).any(axis=1)]
    counts = Counter(int(j) for j in with_c[with_c >= 0] if j != ci)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], ps[kv[0]].id))
    return [(ps[i].id, c) for i, c in ranked[:limit]]


# ---------------------------------------------------------------- learned taste

def taste_features(outfit_pieces: list[Piece]) -> list[str]:
    feats = [f"item:{p.id}" for p in outfit_pieces] + [f"color:{p.sw.name}" for p in outfit_pieces]
    for i in range(len(outfit_pieces)):
        for j in range(i + 1, len(outfit_pieces)):
            feats.append(_pair_key(outfit_pieces[i].sw.name, outfit_pieces[j].sw.name))
    return feats


def update_taste(weights: dict[str, float], outfit_pieces: list[Piece], liked: bool, lr: float = TASTE_LR) -> dict[str, float]:
    """One logistic regression step: w += lr * (y - p) * x for binary features."""
    feats = taste_features(outfit_pieces)
    z = sum(weights.get(f, 0.0) for f in feats)
    p = 1 / (1 + math.exp(-z))
    grad = (1.0 if liked else 0.0) - p
    new = dict(weights)
    for f in feats:
        new[f] = round(max(-3.0, min(3.0, new.get(f, 0.0) + lr * grad)), 5)
    return new
