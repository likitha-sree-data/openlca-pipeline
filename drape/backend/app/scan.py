"""Garment photo scan: cutout, colors, pattern, category guess, embedding.

Cutout order:
  1. the upload already has transparency, so use its alpha
  2. rembg with the u2netp model (Apache 2.0)
  3. plain-background removal using the photo's border color
  4. give up and keep the photo as a rounded card, with a tip
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image, ImageFilter

from . import colors
from .config import get_settings
from .embed import get_embedder
from .images import fit, has_transparency, to_rgb

log = logging.getLogger("drape.scan")

SUBTYPES: dict[str, str] = {
    "t-shirt": "top", "shirt": "top", "blouse": "top", "sweater": "top", "polo shirt": "top",
    "tank top": "top", "hoodie": "top",
    "cardigan": "layer", "blazer": "layer", "jacket": "layer", "coat": "layer",
    "jeans": "bottom", "trousers": "bottom", "shorts": "bottom", "skirt": "bottom",
    "dress": "dress",
    "trainers": "shoes", "boots": "shoes", "loafers": "shoes", "sandals": "shoes", "heels": "shoes",
    "bag": "accessory", "scarf": "accessory", "hat": "accessory", "belt": "accessory",
}
CLIP_LABEL = {"trainers": "sneakers"}
DEFAULT_SUBTYPE = {"top": "top", "bottom": "trousers", "layer": "jacket", "dress": "dress", "shoes": "shoes", "accessory": "accessory"}
# formality, warmth
SUBTYPE_TRAITS: dict[str, tuple[int, int]] = {
    "t-shirt": (1, 1), "shirt": (2, 1), "blouse": (2, 1), "sweater": (1, 3), "polo shirt": (1, 1),
    "tank top": (1, 1), "hoodie": (1, 2), "top": (1, 2),
    "cardigan": (2, 2), "blazer": (3, 2), "jacket": (1, 2), "coat": (2, 3),
    "jeans": (1, 2), "trousers": (2, 2), "shorts": (1, 1), "skirt": (2, 1),
    "dress": (2, 1),
    "trainers": (1, 2), "boots": (2, 3), "loafers": (2, 2), "sandals": (1, 1), "heels": (3, 1), "shoes": (2, 2),
    "bag": (2, 2), "scarf": (1, 3), "hat": (1, 2), "belt": (2, 2), "accessory": (2, 2),
}
FIBERS = ["cotton", "denim", "wool knit", "linen", "silk", "leather", "polyester", "suede"]
SEASONS_BY_WARMTH = {1: ["spring", "summer"], 2: ["spring", "autumn"], 3: ["autumn", "winter"]}
CUTOUT_TIP = "Lay it flat on a plain bed or floor, away from busy patterns, and try again."


@dataclass
class Cutout:
    image: Image.Image  # RGBA cropped to the garment, or the RGB photo when it failed
    ok: bool
    method: str
    mask: np.ndarray | None = None  # bool mask of the cropped image


@dataclass
class ScanResult:
    name: str
    category: str
    subtype: str
    category_confidence: float
    color_name: str
    color_hex: str
    hue: float
    sat: float
    val: float
    palette: list[dict[str, Any]]
    pattern: str
    fiber_guess: str | None
    formality: int
    warmth: int
    seasons: list[str]
    cutout_ok: bool
    cutout_method: str
    needs_review: bool
    tips: list[str] = field(default_factory=list)
    timings: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


# ---------------------------------------------------------------- cutout

_rembg_lock = threading.Lock()


@lru_cache
def _rembg_session():
    if not get_settings().enable_rembg:
        return None
    try:
        from rembg import new_session

        return new_session("u2netp")
    except Exception as exc:
        log.warning("rembg unavailable, using border-color cutout: %s", type(exc).__name__)
        return None


def _largest_component(mask: np.ndarray) -> np.ndarray:
    from skimage.measure import label

    lab = label(mask, connectivity=2)
    if lab.max() == 0:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    keep = sizes >= max(sizes.max() * 0.15, 30)
    return keep[lab]


def _clean(mask: np.ndarray) -> np.ndarray:
    from skimage.morphology import closing, disk, opening, remove_small_holes

    r = max(1, int(min(mask.shape) / 200))
    m = opening(mask, disk(r))
    m = closing(m, disk(r * 2))
    m = remove_small_holes(m, max_size=int(mask.size * 0.002))
    return _largest_component(m)


def _mask_ok(mask: np.ndarray) -> bool:
    cover = mask.mean()
    if not 0.03 <= cover <= 0.92:
        return False
    # a mask that touches all four borders is the background, not the garment
    edges = [mask[0, :].mean(), mask[-1, :].mean(), mask[:, 0].mean(), mask[:, -1].mean()]
    return sum(e > 0.6 for e in edges) < 3


def border_mask(img: Image.Image) -> np.ndarray | None:
    """Plain-background removal using the color of the photo's border."""
    small = to_rgb(fit(img, 512))
    arr = np.asarray(small, dtype=np.float32)
    h, w, _ = arr.shape
    b = max(2, int(min(h, w) * 0.04))
    border = np.concatenate([arr[:b].reshape(-1, 3), arr[-b:].reshape(-1, 3), arr[:, :b].reshape(-1, 3), arr[:, -b:].reshape(-1, 3)])
    lab = _lab_array(arr.reshape(-1, 3)).reshape(h, w, 3)
    border_lab = _lab_array(border)
    bg = np.median(border_lab, axis=0)
    spread = np.percentile(np.linalg.norm(border_lab - bg, axis=1), 90)
    if spread > 14:  # busy background
        return None
    dist = np.linalg.norm(lab - bg, axis=2)
    thr = max(14.0, spread * 2.2)
    mask = _clean(dist > thr)
    if not _mask_ok(mask):
        return None
    full = Image.fromarray((mask * 255).astype(np.uint8)).resize(img.size, Image.Resampling.BILINEAR)
    return np.asarray(full) > 127


def _rembg_mask(img: Image.Image) -> np.ndarray | None:
    session = _rembg_session()
    if session is None:
        return None
    from rembg import remove

    small = to_rgb(fit(img, 1024))
    with _rembg_lock:
        out = remove(small, session=session, post_process_mask=True)
    alpha = np.asarray(out.getchannel("A"))
    mask = _clean(alpha > 128)
    if not _mask_ok(mask):
        return None
    full = Image.fromarray((mask * 255).astype(np.uint8)).resize(img.size, Image.Resampling.BILINEAR)
    return np.asarray(full) > 127


def _crop(img: Image.Image, mask: np.ndarray, pad: float = 0.04) -> tuple[Image.Image, np.ndarray]:
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    p = int(max(y1 - y0, x1 - x0) * pad)
    y0, x0 = max(0, y0 - p), max(0, x0 - p)
    y1, x1 = min(mask.shape[0], y1 + p), min(mask.shape[1], x1 + p)
    rgba = to_rgb(img).convert("RGBA")
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    rgba.putalpha(alpha)
    return rgba.crop((x0, y0, x1, y1)), mask[y0:y1, x0:x1]


def cutout(img: Image.Image) -> Cutout:
    if has_transparency(img):
        mask = np.asarray(img.getchannel("A")) > 128
        if mask.any():
            ys, xs = np.nonzero(mask)
            box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
            return Cutout(img.convert("RGBA").crop(box), True, "alpha", mask[box[1]:box[3], box[0]:box[2]])
    for method, fn in (("rembg", _rembg_mask), ("border", border_mask)):
        try:
            mask = fn(img)
        except Exception as exc:  # never let a model failure block the person
            log.warning("cutout %s failed: %s", method, type(exc).__name__)
            mask = None
        if mask is not None:
            cropped, m = _crop(img, mask)
            return Cutout(cropped, True, method, m)
    return Cutout(to_rgb(img), False, "none", None)


# ---------------------------------------------------------------- colors

def _lab_array(rgb: np.ndarray) -> np.ndarray:
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def palette(img: Image.Image, mask: np.ndarray | None, k: int = 4) -> tuple[list[dict[str, Any]], np.ndarray, np.ndarray]:
    """k-means palette on garment pixels. Returns palette, labels image and mask used."""
    small = fit(img, 160)
    rgb = np.asarray(to_rgb(small), dtype=np.float32)
    if mask is not None:
        m = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize(small.size, Image.Resampling.NEAREST)) > 127
    else:
        h, w = rgb.shape[:2]
        m = np.zeros((h, w), dtype=bool)
        m[h // 6: h - h // 6, w // 6: w - w // 6] = True
    px = rgb[m]
    if len(px) < k:
        px = rgb.reshape(-1, 3)
        m = np.ones(rgb.shape[:2], dtype=bool)
    from sklearn.cluster import KMeans

    km = KMeans(n_clusters=min(k, len(np.unique(px, axis=0))), n_init=3, random_state=0).fit(_lab_array(px))
    labels = km.labels_
    out = []
    for c in range(km.n_clusters):
        sel = px[labels == c]
        if len(sel) == 0:
            continue
        mean = sel.mean(axis=0)
        hx = colors.rgb_to_hex(tuple(mean))
        out.append({"hex": hx, "name": colors.name_color(hx), "share": round(len(sel) / len(px), 4)})
    out.sort(key=lambda d: -d["share"])
    lab_img = np.full(rgb.shape[:2], -1, dtype=np.int16)
    lab_img[m] = labels
    return out, lab_img, m


def dominant(pal: list[dict[str, Any]]) -> dict[str, Any]:
    """Largest cluster, merging near-identical shades (shadows) into it."""
    if not pal:
        return {"hex": "#808080", "name": "grey", "share": 1.0}
    top = dict(pal[0])
    for other in pal[1:]:
        if other["name"] == top["name"]:
            top["share"] += other["share"]
    return top


def detect_pattern(pal: list[dict[str, Any]], labels: np.ndarray, mask: np.ndarray) -> str:
    if len(pal) < 2:
        return "solid"
    a, b = pal[0], pal[1]
    if b["share"] < 0.15 or colors.delta_e(a["hex"], b["hex"]) < 22:
        return "solid"
    # interleaving: share of neighbouring garment pixels whose cluster differs
    lab = labels
    horiz = (lab[:, 1:] != lab[:, :-1]) & mask[:, 1:] & mask[:, :-1]
    vert = (lab[1:, :] != lab[:-1, :]) & mask[1:, :] & mask[:-1, :]
    pairs = (mask[:, 1:] & mask[:, :-1]).sum() + (mask[1:, :] & mask[:-1, :]).sum()
    ratio = (horiz.sum() + vert.sum()) / max(1, pairs)
    return "patterned" if ratio > 0.07 else "solid"


# ---------------------------------------------------------------- category

def guess_from_shape(mask: np.ndarray | None) -> tuple[str, str, float]:
    if mask is None or mask.sum() < 50:
        return "top", "top", 0.3
    ys, xs = np.nonzero(mask)
    m = mask[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    h, w = m.shape
    aspect = h / w

    def runs(row: np.ndarray) -> int:
        d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
        starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
        return int(((ends - starts) > w * 0.04).sum())

    if aspect < 0.62:
        return "shoes", "shoes", 0.65
    lower = [runs(m[int(h * f)]) for f in np.linspace(0.7, 0.95, 8)]
    if aspect > 1.15 and sum(r >= 2 for r in lower) >= 5:
        return "bottom", "trousers", 0.7
    widths = [m[int(h * f)].sum() for f in (0.1, 0.5, 0.9)]
    if aspect > 1.45 and widths[2] >= widths[1] * 1.05:
        return "dress", "dress", 0.5
    if aspect < 1.3 and widths[0] < widths[2] * 0.85 and widths[0] < w * 0.75 and widths[1] <= widths[2]:
        return "bottom", "skirt", 0.45
    return "top", "top", 0.5


def guess_category(img: Image.Image, mask: np.ndarray | None, hint: str | None) -> tuple[str, str, float, str | None]:
    emb = get_embedder()
    zs = emb.zero_shot(img, [CLIP_LABEL.get(s, s) for s in SUBTYPES])
    fiber = None
    if zs:
        inv = {CLIP_LABEL.get(s, s): s for s in SUBTYPES}
        allowed = {k: v for k, v in zs.items() if hint is None or SUBTYPES[inv[k]] == hint}
        label, conf = max(allowed.items(), key=lambda kv: kv[1])
        subtype = inv[label]
        cat = SUBTYPES[subtype]
        fz = emb.zero_shot(img, FIBERS)
        if fz:
            fl, fc = max(fz.items(), key=lambda kv: kv[1])
            fiber = fl if fc > 0.35 else None
        total = sum(v for k, v in allowed.items())
        return cat, subtype, float(conf / total if total else conf), fiber
    cat, sub, conf = guess_from_shape(mask)
    if hint:
        if hint != cat:
            cat, sub = hint, DEFAULT_SUBTYPE[hint]
        conf = 0.9
    return cat, sub, conf, None


def garment_name(color_name: str, subtype: str, color_hex: str) -> str:
    noun = subtype
    if subtype == "trousers" and color_name in ("denim blue", "navy", "light blue", "blue"):
        noun = "jeans"
    if noun in ("top", "accessory", "shoes") and color_name:
        pass
    return f"{color_name} {noun}".strip().capitalize()


# ---------------------------------------------------------------- public API

def scan_image(img: Image.Image, hint: str | None = None) -> tuple[ScanResult, Cutout, np.ndarray]:
    t0 = time.perf_counter()
    cut = cutout(img)
    t1 = time.perf_counter()
    pal, labels, m = palette(cut.image, cut.mask)
    dom = dominant(pal)
    pattern = detect_pattern(pal, labels, m)
    t2 = time.perf_counter()
    category, subtype, conf, fiber = guess_category(cut.image, cut.mask, hint)
    embedding = get_embedder().embed(cut.image)
    t3 = time.perf_counter()
    h, s, v = colors.hsv(dom["hex"])
    formality, warmth = SUBTYPE_TRAITS.get(subtype, (1, 2))
    if fiber in ("wool knit",):
        warmth = 3
    tips = [] if cut.ok else [CUTOUT_TIP]
    needs_review = (not cut.ok) or conf < 0.6
    result = ScanResult(
        name=garment_name(dom["name"], subtype, dom["hex"]),
        category=category,
        subtype=subtype,
        category_confidence=round(conf, 3),
        color_name=dom["name"],
        color_hex=dom["hex"],
        hue=round(h, 1),
        sat=round(s, 3),
        val=round(v, 3),
        palette=pal,
        pattern=pattern,
        fiber_guess=fiber,
        formality=formality,
        warmth=warmth,
        seasons=SEASONS_BY_WARMTH[warmth],
        cutout_ok=cut.ok,
        cutout_method=cut.method,
        needs_review=needs_review,
        tips=tips,
        timings={"cutout": round(t1 - t0, 3), "color": round(t2 - t1, 3), "tagging": round(t3 - t2, 3)},
    )
    return result, cut, embedding
