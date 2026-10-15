"""Garment embeddings and zero-shot tagging.

FashionCLIP (patrickjohncyh/fashion-clip, MIT) is loaded lazily when torch
and transformers are installed and the weights are available. Otherwise a
deterministic 512-d feature embedding is used: color histogram, silhouette
and edge-orientation features. The fallback is good at color and shape and
weak at fine category distinctions, so its category guesses are marked for
review.
"""
from __future__ import annotations

import logging
import threading
from functools import lru_cache

import numpy as np
from PIL import Image

from .config import get_settings

log = logging.getLogger("drape.embed")
DIM = 512


class FeatureEmbedder:
    name = "features-v1"

    def embed(self, img: Image.Image) -> np.ndarray:
        rgba = img.convert("RGBA")
        alpha = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255
        rgb = np.asarray(rgba.convert("RGB").convert("HSV"), dtype=np.float32) / 255
        mask = alpha > 0.5
        if mask.sum() < 20:
            mask = np.ones_like(mask, dtype=bool)

        # 1. HSV color histogram: 8 hue x 4 sat x 4 val = 128
        h, s, v = rgb[..., 0][mask], rgb[..., 1][mask], rgb[..., 2][mask]
        hist, _ = np.histogramdd(np.stack([h, s, v], axis=1), bins=(8, 4, 4), range=((0, 1), (0, 1), (0, 1)))
        color = hist.flatten()
        # spread a little mass to neighbours so close colors stay close
        color = np.convolve(color, [0.25, 0.5, 0.25], mode="same")

        # 2. silhouette: mask bounding box resized to 16x16 = 256
        ys, xs = np.nonzero(mask)
        crop = mask[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
        sil = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((16, 16), Image.Resampling.BILINEAR), dtype=np.float32).flatten()

        # 3. edge orientation histogram: 4x4 cells x 8 bins = 128
        gray = np.asarray(rgba.convert("L").resize((64, 64)), dtype=np.float32)
        gy, gx = np.gradient(gray)
        mag = np.hypot(gx, gy)
        ang = (np.arctan2(gy, gx) % np.pi) / np.pi
        edges = np.zeros((4, 4, 8), dtype=np.float32)
        for cy in range(4):
            for cx in range(4):
                sl = (slice(cy * 16, cy * 16 + 16), slice(cx * 16, cx * 16 + 16))
                edges[cy, cx], _ = np.histogram(ang[sl], bins=8, range=(0, 1), weights=mag[sl])
        texture = edges.flatten()

        parts = []
        for vec, weight in ((color, 0.75), (sil, 0.5), (texture, 0.42)):
            n = np.linalg.norm(vec)
            parts.append((vec / n if n > 0 else vec) * weight)
        out = np.concatenate(parts).astype(np.float32)
        return out / (np.linalg.norm(out) or 1.0)

    def zero_shot(self, img: Image.Image, labels: list[str]) -> dict[str, float] | None:
        return None


class FashionClipEmbedder:
    name = "fashion-clip"

    def __init__(self, model_id: str) -> None:
        import torch
        from transformers import CLIPModel, CLIPProcessor

        torch.set_num_threads(max(1, torch.get_num_threads()))
        self.torch = torch
        self.model = CLIPModel.from_pretrained(model_id).eval()
        self.proc = CLIPProcessor.from_pretrained(model_id)
        self._text_cache: dict[tuple[str, ...], np.ndarray] = {}

    def _image(self, img: Image.Image):
        from .images import to_rgb

        with self.torch.no_grad():
            inputs = self.proc(images=to_rgb(img), return_tensors="pt")
            feats = self.model.get_image_features(**inputs)
        v = feats[0].numpy().astype(np.float32)
        return v / (np.linalg.norm(v) or 1.0)

    def embed(self, img: Image.Image) -> np.ndarray:
        return self._image(img)

    def zero_shot(self, img: Image.Image, labels: list[str]) -> dict[str, float]:
        key = tuple(labels)
        if key not in self._text_cache:
            with self.torch.no_grad():
                t = self.proc(text=[f"a photo of {lbl}" for lbl in labels], return_tensors="pt", padding=True)
                tf = self.model.get_text_features(**t).numpy()
            self._text_cache[key] = tf / np.linalg.norm(tf, axis=1, keepdims=True)
        iv = self._image(img)
        logits = 100 * self._text_cache[key] @ iv
        p = np.exp(logits - logits.max())
        p /= p.sum()
        return {lbl: float(x) for lbl, x in zip(labels, p)}


_lock = threading.Lock()


@lru_cache
def get_embedder() -> FeatureEmbedder | FashionClipEmbedder:
    s = get_settings()
    if s.enable_fashion_clip:
        with _lock:
            try:
                emb = FashionClipEmbedder(s.fashion_clip_model)
                log.info("FashionCLIP loaded")
                return emb
            except Exception as exc:  # missing package, weights or network
                log.warning("FashionCLIP unavailable, using feature embeddings: %s", type(exc).__name__)
    return FeatureEmbedder()


def cosine(a: np.ndarray | list[float] | None, b: np.ndarray | list[float] | None) -> float:
    if a is None or b is None:
        return 0.0
    x, y = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    d = float(np.linalg.norm(x) * np.linalg.norm(y))
    return float(x @ y / d) if d else 0.0


