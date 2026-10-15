"""Clothing regions in an outfit photo, and matching them to owned garments.

SegFormer clothes parsing (mattmdjaga/segformer_b2_clothes, MIT) is used
when available. The fallback finds the person with the cutout pipeline and
splits the silhouette into body bands below the head (upper, lower, shoes).
Fallback detections are marked low confidence so the person checks them.
Faces are never part of a crop: the head band and the face label are left out.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image

from . import colors
from .config import get_settings
from .embed import cosine, get_embedder
from .images import fit, to_rgb
from .scan import dominant, palette

log = logging.getLogger("drape.segment")

# SegFormer label ids for mattmdjaga/segformer_b2_clothes
SEG_LABELS = {"upper": [4], "skirt": [5], "pants": [6], "dress": [7], "shoes": [9, 10]}
FAMILY = {"upper": ["top", "layer"], "skirt": ["bottom"], "pants": ["bottom"], "lower": ["bottom"], "dress": ["dress"], "shoes": ["shoes"]}
REGION_LABEL = {"upper": "Top or layer", "skirt": "Skirt", "pants": "Trousers", "lower": "Bottom", "dress": "Dress", "shoes": "Shoes"}
LOW_CONFIDENCE = 0.6


@dataclass
class Region:
    kind: str
    crop: Image.Image  # RGBA, garment pixels only
    bbox: tuple[float, float, float, float]  # relative x0, y0, x1, y1
    detect_conf: float


class _SegFormer:
    def __init__(self, model_id: str) -> None:
        import torch
        from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

        self.torch = torch
        self.proc = SegformerImageProcessor.from_pretrained(model_id)
        self.model = AutoModelForSemanticSegmentation.from_pretrained(model_id).eval()
        self.lock = threading.Lock()

    def labels(self, img: Image.Image) -> np.ndarray:
        rgb = to_rgb(fit(img, 768))
        with self.lock, self.torch.no_grad():
            out = self.model(**self.proc(images=rgb, return_tensors="pt"))
            up = self.torch.nn.functional.interpolate(out.logits, size=rgb.size[::-1], mode="bilinear", align_corners=False)
        lab = up.argmax(dim=1)[0].numpy().astype(np.uint8)
        return np.asarray(Image.fromarray(lab).resize(img.size, Image.Resampling.NEAREST))


@lru_cache
def _segformer() -> _SegFormer | None:
    s = get_settings()
    if not s.enable_segformer:
        return None
    try:
        return _SegFormer(s.segformer_model)
    except Exception as exc:
        log.warning("SegFormer unavailable, using body-band fallback: %s", type(exc).__name__)
        return None


def _crop_region(img: Image.Image, mask: np.ndarray) -> tuple[Image.Image, tuple[float, float, float, float]] | None:
    if mask.sum() < 0.004 * mask.size:
        return None
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = to_rgb(img).convert("RGBA")
    rgba.putalpha(Image.fromarray((mask * 255).astype(np.uint8)))
    h, w = mask.shape
    return rgba.crop((x0, y0, x1, y1)), (x0 / w, y0 / h, x1 / w, y1 / h)


def segment(img: Image.Image) -> tuple[list[Region], str]:
    model = _segformer()
    regions: list[Region] = []
    if model is not None:
        lab = model.labels(img)
        for kind, ids in SEG_LABELS.items():
            got = _crop_region(img, np.isin(lab, ids))
            if got:
                regions.append(Region(kind, got[0], got[1], 0.9))
        return regions, "segformer"

    person = _person_mask(img)
    full = person if person is not None else np.zeros((img.size[1], img.size[0]), dtype=bool)
    if not full.any():
        h, w = full.shape
        full[int(h * 0.05): int(h * 0.98), int(w * 0.2): int(w * 0.8)] = True
    ys, _ = np.nonzero(full)
    top, bottom = ys.min(), ys.max() + 1
    height = bottom - top
    bands = {"upper": (0.18, 0.50), "lower": (0.52, 0.90), "shoes": (0.93, 1.0)}
    for kind, (a, b) in bands.items():
        band = np.zeros_like(full)
        band[top + int(height * a): top + int(height * b)] = True
        got = _crop_region(img, full & band)
        if got:
            regions.append(Region(kind, got[0], got[1], 0.55))
    return regions, "bands"


def _person_mask(img: Image.Image) -> np.ndarray | None:
    from .scan import _rembg_mask, border_mask

    for fn in (_rembg_mask, border_mask):
        try:
            m = fn(img, keep_ratio=0.02)  # keep feet and shoes that are not touching the rest
        except Exception:
            m = None
        if m is not None:
            return m
    return None


def region_color(crop: Image.Image) -> dict[str, Any]:
    alpha = np.asarray(crop.getchannel("A")) > 128
    pal, _, _ = palette(crop, alpha)
    return dominant(pal)


def match_regions(regions: list[Region], garments: list[dict[str, Any]], top_k: int = 3) -> list[dict[str, Any]]:
    """For each region, the nearest owned garments of the same category family.

    garments: dicts with id, name, category, color_hex, embedding.
    Score = 0.5 * embedding similarity + 0.5 * color similarity, scaled by how
    sure the region detection was.
    """
    emb = get_embedder()
    out = []
    for i, r in enumerate(regions):
        vec = emb.embed(r.crop)
        col = region_color(r.crop)
        fam = FAMILY.get(r.kind, [])
        scored = []
        for g in garments:
            if g["category"] not in fam:
                continue
            sim = max(0.0, cosine(vec, g.get("embedding")))
            dE = colors.delta_e(col["hex"], g["color_hex"]) if g.get("color_hex") else 60.0
            color_sim = max(0.0, 1 - dE / 50)
            score = (0.5 * sim + 0.5 * color_sim) * (0.75 + 0.25 * r.detect_conf)
            reason = "Similar color" if color_sim > 0.6 else "Same kind of piece"
            scored.append({"garment_id": g["id"], "confidence": round(float(score), 3), "reason": reason})
        scored.sort(key=lambda x: -x["confidence"])
        best = scored[0]["confidence"] if scored else 0.0
        out.append({
            "id": f"r{i}",
            "kind": r.kind,
            "label": REGION_LABEL.get(r.kind, r.kind.capitalize()),
            "bbox": [round(v, 4) for v in r.bbox],
            "color_name": col["name"],
            "color_hex": col["hex"],
            "candidates": scored[:top_k],
            "confidence": best,
            "low_confidence": best < LOW_CONFIDENCE,
        })
    return out
