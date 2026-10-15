"""Color naming and color harmony.

Names come from a small clothing palette matched in CIE Lab space.
Harmony classifies a pair of garment colors as neutral pairing, tonal,
analogous, complementary or clash, with a score in [-1, 1].
"""
from __future__ import annotations

import colorsys
from dataclasses import dataclass

# name, hex, neutral
PALETTE: list[tuple[str, str, bool]] = [
    ("white", "#F4F4F0", True),
    ("cream", "#EDE4CF", True),
    ("beige", "#D3C0A0", True),
    ("camel", "#B98A55", True),
    ("tan", "#A7825C", True),
    ("brown", "#6B4A32", True),
    ("chocolate", "#3F2A1E", True),
    ("black", "#1C1C1C", True),
    ("charcoal", "#3A3D40", True),
    ("grey", "#80838A", True),
    ("light grey", "#C2C4C6", True),
    ("navy", "#1F2D4D", True),
    ("denim blue", "#4A6382", True),
    ("khaki", "#9E9466", True),
    ("blue", "#2F5DA8", False),
    ("light blue", "#9DB8D9", False),
    ("teal", "#2C6E6E", False),
    ("green", "#3E7B4A", False),
    ("olive", "#5F6136", False),
    ("sage", "#9CAA8C", False),
    ("forest green", "#24432F", False),
    ("mustard", "#C9A13B", False),
    ("yellow", "#E8CF4A", False),
    ("orange", "#D9782F", False),
    ("rust", "#A3512B", False),
    ("red", "#B8302F", False),
    ("burgundy", "#6B2131", False),
    ("pink", "#E3A1B2", False),
    ("blush", "#E8C6BE", False),
    ("purple", "#5E3F7A", False),
    ("lavender", "#B7A6D1", False),
]
NEUTRALS = {n for n, _, neutral in PALETTE if neutral}
COLOR_NAMES = [n for n, _, _ in PALETTE]


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    r, g, b = (max(0, min(255, int(round(c)))) for c in rgb)
    return f"#{r:02X}{g:02X}{b:02X}"


def _lin(c: float) -> float:
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb_to_lab(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    r, g, b = (_lin(c) for c in rgb)
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(a: str, b: str) -> float:
    la, lb = rgb_to_lab(hex_to_rgb(a)), rgb_to_lab(hex_to_rgb(b))
    return sum((x - y) ** 2 for x, y in zip(la, lb)) ** 0.5


_PALETTE_LAB = [(n, rgb_to_lab(hex_to_rgb(h)), neutral) for n, h, neutral in PALETTE]


def name_color(hex_value: str) -> str:
    lab = rgb_to_lab(hex_to_rgb(hex_value))
    best = min(_PALETTE_LAB, key=lambda p: sum((x - y) ** 2 for x, y in zip(lab, p[1])))
    return best[0]


def hsv(hex_value: str) -> tuple[float, float, float]:
    """Hue in degrees [0, 360), saturation and value in [0, 1]."""
    r, g, b = (c / 255 for c in hex_to_rgb(hex_value))
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    return h * 360, s, v


def is_neutral(name: str | None, sat: float | None = None, val: float | None = None) -> bool:
    if name in NEUTRALS:
        return True
    if sat is not None and sat < 0.15:
        return True
    return val is not None and val < 0.18


@dataclass(frozen=True)
class Swatch:
    name: str
    hue: float
    sat: float
    val: float
    neutral: bool
    patterned: bool = False


def swatch(name: str | None, hex_value: str | None, pattern: str | None = "solid") -> Swatch:
    hex_value = hex_value or "#808080"
    h, s, v = hsv(hex_value)
    nm = name or name_color(hex_value)
    return Swatch(nm, h, s, v, is_neutral(nm, s, v), (pattern or "solid") != "solid")


def hue_distance(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def pair_harmony(a: Swatch, b: Swatch) -> tuple[float, str]:
    """Score in [-1, 1] and a kind label."""
    if a.patterned and b.patterned:
        return -0.7, "pattern clash"
    if a.neutral and b.neutral:
        return 0.8, "neutral pairing"
    if a.neutral or b.neutral:
        return 0.7, "neutral pairing"
    d = hue_distance(a.hue, b.hue)
    if d <= 20:
        return 0.7, "tonal"
    if d <= 50:
        return 0.55, "analogous"
    if d >= 130:
        return 0.45, "complementary"
    if d <= 65:
        return 0.1, "close"
    return -0.5, "clash"


def harmony_phrase(a: str, b: str, kind: str) -> str:
    if kind == "neutral pairing":
        return f"{a.capitalize()} and {b} are an easy neutral pairing"
    if kind == "tonal":
        return f"{a.capitalize()} and {b} make a calm tonal look"
    if kind == "analogous":
        return f"{a.capitalize()} and {b} sit close on the color wheel"
    if kind == "complementary":
        return f"{a.capitalize()} and {b} balance each other"
    return f"{a.capitalize()} and {b} work together"
