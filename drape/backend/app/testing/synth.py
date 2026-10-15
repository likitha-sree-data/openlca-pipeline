"""Synthetic garment and outfit photos for tests, e2e fixtures and demos.

Shapes are simple polygons on a plain background with mild noise, so they
look like a garment laid flat on a bed or floor.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SHAPES = {
    "top": [(0.30, 0.10), (0.42, 0.06), (0.58, 0.06), (0.70, 0.10), (0.92, 0.30), (0.82, 0.40), (0.72, 0.32),
            (0.72, 0.90), (0.28, 0.90), (0.28, 0.32), (0.18, 0.40), (0.08, 0.30)],
    "layer": [(0.30, 0.08), (0.44, 0.05), (0.50, 0.30), (0.56, 0.05), (0.70, 0.08), (0.94, 0.60), (0.84, 0.64),
              (0.74, 0.40), (0.74, 0.94), (0.26, 0.94), (0.26, 0.40), (0.16, 0.64), (0.06, 0.60)],
    "bottom": [(0.30, 0.05), (0.70, 0.05), (0.74, 0.95), (0.56, 0.95), (0.50, 0.38), (0.44, 0.95), (0.26, 0.95)],
    "dress": [(0.38, 0.04), (0.62, 0.04), (0.64, 0.30), (0.80, 0.95), (0.20, 0.95), (0.36, 0.30)],
    "shoes": [(0.08, 0.40), (0.30, 0.40), (0.46, 0.52), (0.46, 0.64), (0.08, 0.64)],
}
SHOE_RIGHT = [(0.54, 0.40), (0.76, 0.40), (0.92, 0.52), (0.92, 0.64), (0.54, 0.64)]


def _rgb(hex_value: str) -> tuple[int, int, int]:
    h = hex_value.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def garment_photo(category: str, color: str, size: int = 900, bg: str = "#E9E6E1", stripes: str | None = None,
                  seed: int = 0, noise: float = 4.0, busy: bool = False) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = Image.new("RGB", (size, size), _rgb(bg))
    if busy:
        d = ImageDraw.Draw(img)
        for _ in range(140):
            x, y = rng.integers(0, size, 2)
            r = int(rng.integers(10, 80))
            d.ellipse((x - r, y - r, x + r, y + r), fill=tuple(int(c) for c in rng.integers(0, 255, 3)))
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    polys = [SHAPES[category]] + ([SHOE_RIGHT] if category == "shoes" else [])
    for poly in polys:
        d.polygon([(x * size, y * size) for x, y in poly], fill=_rgb(color) + (255,))
    if stripes:
        stripe = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        sd = ImageDraw.Draw(stripe)
        for y in range(0, size, 36):
            sd.rectangle((0, y, size, y + 14), fill=_rgb(stripes) + (255,))
        alpha = layer.getchannel("A")
        stripe.putalpha(Image.fromarray(np.minimum(np.asarray(alpha), np.asarray(stripe.getchannel("A")))))
        layer.alpha_composite(stripe)
    img.paste(layer, (0, 0), layer)
    arr = np.asarray(img, dtype=np.float32) + rng.normal(0, noise, (size, size, 3))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))


def outfit_photo(top: str, bottom: str, shoes: str, layer: str | None = None, size: tuple[int, int] = (600, 1200),
                 bg: str = "#8F8B85", seed: int = 1) -> Image.Image:
    """A flat, faceless figure wearing a top, a bottom and shoes."""
    w, h = size
    img = Image.new("RGB", size, _rgb(bg))
    d = ImageDraw.Draw(img)
    skin = (205, 170, 140)
    d.ellipse((w * 0.40, h * 0.02, w * 0.60, h * 0.13), fill=skin)  # head
    d.rectangle((w * 0.46, h * 0.12, w * 0.54, h * 0.16), fill=skin)  # neck
    d.polygon([(w * 0.28, h * 0.16), (w * 0.72, h * 0.16), (w * 0.84, h * 0.40), (w * 0.74, h * 0.42), (w * 0.70, h * 0.30),
               (w * 0.70, h * 0.50), (w * 0.30, h * 0.50), (w * 0.30, h * 0.30), (w * 0.26, h * 0.42), (w * 0.16, h * 0.40)],
              fill=_rgb(top))
    if layer:
        d.polygon([(w * 0.24, h * 0.16), (w * 0.40, h * 0.16), (w * 0.40, h * 0.52), (w * 0.24, h * 0.52)], fill=_rgb(layer))
        d.polygon([(w * 0.60, h * 0.16), (w * 0.76, h * 0.16), (w * 0.76, h * 0.52), (w * 0.60, h * 0.52)], fill=_rgb(layer))
    d.polygon([(w * 0.30, h * 0.50), (w * 0.70, h * 0.50), (w * 0.68, h * 0.88), (w * 0.53, h * 0.88), (w * 0.50, h * 0.60),
               (w * 0.47, h * 0.88), (w * 0.32, h * 0.88)], fill=_rgb(bottom))
    d.rectangle((w * 0.30, h * 0.89, w * 0.47, h * 0.96), fill=_rgb(shoes))
    d.rectangle((w * 0.53, h * 0.89, w * 0.70, h * 0.96), fill=_rgb(shoes))
    rng = np.random.default_rng(seed)
    arr = np.asarray(img, dtype=np.float32) + rng.normal(0, 3, (h, w, 3))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def jpeg_bytes(img: Image.Image, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()


BATCH_12 = [
    ("top", "#EDE4CF", "cream"), ("top", "#F4F4F0", "white"), ("top", "#B8302F", "red"), ("top", "#2F5DA8", "blue"),
    ("bottom", "#1F2D4D", "navy"), ("bottom", "#D3C0A0", "beige"), ("bottom", "#3A3D40", "charcoal"),
    ("layer", "#5F6136", "olive"), ("layer", "#1C1C1C", "black"),
    ("shoes", "#F4F4F0", "white"), ("shoes", "#6B4A32", "brown"),
    ("dress", "#3E7B4A", "green"),
]


def write_fixtures(out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, (cat, color, name) in enumerate(BATCH_12):
        bg = "#2B2B2B" if name in ("white", "cream") else "#E9E6E1"
        p = out / f"garment-{i + 1:02d}-{name}-{cat}.jpg"
        p.write_bytes(jpeg_bytes(garment_photo(cat, color, bg=bg, seed=i)))
        paths.append(p)
    p = out / "outfit-cream-navy-white.jpg"
    p.write_bytes(jpeg_bytes(outfit_photo("#EDE4CF", "#1F2D4D", "#F4F4F0")))
    paths.append(p)
    return paths


if __name__ == "__main__":
    import sys

    for p in write_fixtures(Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures")):
        print(p)
