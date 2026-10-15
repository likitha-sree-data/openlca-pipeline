"""Flat, muted garment illustrations for demo mode, drawn from simple shapes.

Each garment is a list of primitives in a 200 x 240 box. The same shapes are
written as SVG for the browser and rasterized with Pillow so demo garments
get real colors and embeddings from the same pipeline as photos.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from PIL import Image, ImageDraw

W, H = 200, 240
Prim = tuple[Any, ...]


def shirt(fill: str, detail: str, buttons: bool = True, short: bool = False) -> list[Prim]:
    sleeve = [(150, 90), (166, 194), (188, 190), (175, 60)] if not short else [(150, 92), (164, 112), (186, 96), (170, 58)]
    left = [(50, 90), (34, 194), (12, 190), (25, 60)] if not short else [(50, 92), (36, 112), (14, 96), (30, 58)]
    outline = [(60, 28), (85, 20), (100, 34), (115, 20), (140, 28), sleeve[3], sleeve[2], sleeve[1], sleeve[0],
               (150, 222), (50, 222), left[0], left[1], left[2], left[3]]
    prims: list[Prim] = [("poly", outline, fill)]
    if buttons:
        prims += [("poly", [(85, 20), (100, 34), (92, 42), (80, 26)], detail), ("poly", [(115, 20), (100, 34), (108, 42), (120, 26)], detail),
                  ("line", [(100, 34), (100, 222)], detail, 2)]
        prims += [("circle", 104, y, 2.6, detail) for y in (62, 96, 130, 164, 198)]
    else:
        prims += [("line", [(86, 21), (100, 30), (114, 21)], detail, 4)]
    prims += [("line", [(50, 92), (50, 220)], detail, 1), ("line", [(150, 92), (150, 220)], detail, 1)]
    return prims


def sweater(fill: str, detail: str) -> list[Prim]:
    outline = [(62, 26), (86, 20), (100, 28), (114, 20), (138, 26), (176, 62), (186, 196), (166, 200), (152, 96),
               (152, 220), (48, 220), (48, 96), (34, 200), (14, 196), (24, 62)]
    prims: list[Prim] = [("poly", outline, fill), ("line", [(86, 21), (100, 30), (114, 21)], detail, 5)]
    prims += [("line", [(52, y), (148, y)], detail, 1) for y in (206, 212)]
    prims += [("line", [(18, 186), (34, 188)], detail, 2), ("line", [(166, 188), (184, 186)], detail, 2)]
    prims += [("line", [(70 + i * 12, 60), (70 + i * 12, 200)], detail, 1) for i in range(6)]
    return prims


def cardigan(fill: str, detail: str) -> list[Prim]:
    outline = [(62, 26), (88, 20), (100, 96), (112, 20), (138, 26), (176, 62), (190, 200), (168, 204), (152, 96),
               (152, 226), (48, 226), (48, 96), (32, 204), (10, 200), (24, 62)]
    prims: list[Prim] = [("poly", outline, fill), ("line", [(88, 20), (100, 96), (112, 20)], detail, 3),
                         ("line", [(100, 96), (100, 226)], detail, 2)]
    prims += [("circle", 106, y, 3, detail) for y in (110, 140, 170, 200)]
    prims += [("line", [(50, 216), (150, 216)], detail, 1), ("line", [(14, 192), (32, 194)], detail, 2), ("line", [(168, 194), (186, 192)], detail, 2)]
    return prims


def blazer(fill: str, detail: str, long: bool = False) -> list[Prim]:
    hem = 236 if long else 222
    outline = [(60, 24), (86, 18), (100, 40), (114, 18), (140, 24), (176, 60), (188, 196), (166, 200), (152, 94),
               (152, hem), (48, hem), (48, 94), (34, 200), (12, 196), (24, 60)]
    prims: list[Prim] = [("poly", outline, fill),
                         ("poly", [(86, 18), (100, 40), (96, 118), (78, 64), (88, 52), (74, 40)], detail),
                         ("poly", [(114, 18), (100, 40), (104, 118), (122, 64), (112, 52), (126, 40)], detail),
                         ("line", [(100, 118), (100, hem)], detail, 2)]
    prims += [("circle", 106, y, 3.2, detail) for y in ((140, 168) if not long else (140, 172, 204))]
    prims += [("line", [(58, 160), (82, 160)], detail, 2), ("line", [(118, 160), (142, 160)], detail, 2)]
    return prims


def trousers(fill: str, detail: str, wide: bool = False) -> list[Prim]:
    spread = 6 if wide else 0
    outline = [(55, 16), (145, 16), (150 + spread, 228), (106, 228), (100, 92), (94, 228), (50 - spread, 228)]
    prims: list[Prim] = [("poly", outline, fill), ("line", [(55, 30), (145, 30)], detail, 2),
                         ("line", [(100, 30), (100, 80)], detail, 2)]
    if wide:
        prims += [("line", [(76, 40), (74, 226)], detail, 1), ("line", [(124, 40), (126, 226)], detail, 1)]
    else:
        prims += [("line", [(58, 34), (80, 54)], detail, 2), ("line", [(142, 34), (120, 54)], detail, 2),
                  ("line", [(66, 210), (92, 210)], detail, 1), ("line", [(108, 210), (134, 210)], detail, 1)]
    return prims


def dress(fill: str, detail: str) -> list[Prim]:
    outline = [(76, 14), (90, 14), (100, 30), (110, 14), (124, 14), (130, 84), (124, 98), (164, 230), (36, 230),
               (76, 98), (70, 84)]
    return [("poly", outline, fill), ("line", [(72, 94), (128, 94)], detail, 4),
            ("line", [(90, 14), (100, 30), (110, 14)], detail, 2), ("line", [(100, 100), (96, 228)], detail, 1),
            ("line", [(86, 100), (66, 228)], detail, 1), ("line", [(114, 100), (134, 228)], detail, 1)]


def trainers(fill: str, detail: str, sole: str) -> list[Prim]:
    def one(dx: int, dy: int) -> list[Prim]:
        upper = [(14 + dx, 70 + dy), (40 + dx, 60 + dy), (58 + dx, 66 + dy), (78 + dx, 84 + dy), (94 + dx, 90 + dy),
                 (96 + dx, 104 + dy), (14 + dx, 104 + dy)]
        return [("poly", upper, fill), ("rect", 12 + dx, 104 + dy, 98 + dx, 114 + dy, sole),
                ("line", [(40 + dx, 66 + dy), (52 + dx, 80 + dy)], detail, 2), ("line", [(46 + dx, 64 + dy), (58 + dx, 78 + dy)], detail, 2),
                ("line", [(20 + dx, 92 + dy), (88 + dx, 96 + dy)], detail, 1)]
    return one(0, 20) + one(90, 70)


def loafers(fill: str, detail: str, sole: str) -> list[Prim]:
    def one(dx: int, dy: int) -> list[Prim]:
        upper = [(14 + dx, 82 + dy), (30 + dx, 70 + dy), (64 + dx, 74 + dy), (90 + dx, 86 + dy), (98 + dx, 100 + dy),
                 (14 + dx, 100 + dy)]
        return [("poly", upper, fill), ("rect", 12 + dx, 100 + dy, 100 + dx, 108 + dy, sole),
                ("line", [(52 + dx, 78 + dy), (74 + dx, 86 + dy)], detail, 3)]
    return one(0, 20) + one(90, 70)


@dataclass
class DemoGarment:
    slug: str
    name: str
    category: str
    subtype: str
    color_hex: str
    formality: int
    warmth: int
    prims: list[Prim]
    price: float | None = None
    fiber: str | None = None


GARMENTS: list[DemoGarment] = [
    DemoGarment("cream-cotton-shirt", "Cream cotton shirt", "top", "shirt", "#EDE4CF", 2, 1, shirt("#EDE4CF", "#CBBF9F"), 45, "cotton"),
    DemoGarment("navy-straight-jeans", "Navy straight jeans", "bottom", "jeans", "#24345A", 1, 2, trousers("#24345A", "#3B4C75"), 70, "cotton"),
    DemoGarment("olive-cardigan", "Olive cardigan", "layer", "cardigan", "#5F6136", 2, 2, cardigan("#5F6136", "#484A27"), 60, "wool"),
    DemoGarment("beige-trousers", "Beige trousers", "bottom", "trousers", "#D3C0A0", 2, 2, trousers("#D3C0A0", "#B8A483", wide=True), 55, "cotton"),
    DemoGarment("white-trainers", "White trainers", "shoes", "trainers", "#F1F0EB", 1, 2, trainers("#F1F0EB", "#CFCAC2", "#DAD6CF"), 80, "leather"),
    DemoGarment("black-blazer", "Black blazer", "layer", "blazer", "#2B2D2E", 3, 2, blazer("#2B2D2E", "#45484A"), 120, "wool"),
    DemoGarment("navy-cardigan", "Navy cardigan", "layer", "cardigan", "#26355A", 2, 2, cardigan("#26355A", "#3A4A72"), 50, "wool"),
    DemoGarment("brown-loafers", "Brown loafers", "shoes", "loafers", "#6B4A32", 2, 2, loafers("#6B4A32", "#4F3524", "#3F2A1E"), 95, "leather"),
    DemoGarment("grey-crew-tee", "Grey crew tee", "top", "t-shirt", "#9A9DA2", 1, 1, shirt("#9A9DA2", "#7F8287", buttons=False, short=True), 15, "cotton"),
    DemoGarment("green-midi-dress", "Green midi dress", "dress", "dress", "#4F7A5A", 2, 1, dress("#4F7A5A", "#3E6448"), 85, "linen"),
    DemoGarment("charcoal-wool-coat", "Charcoal wool coat", "layer", "coat", "#3F4347", 2, 3, blazer("#3F4347", "#55595E", long=True), 160, "wool"),
    DemoGarment("sage-linen-shirt", "Sage linen shirt", "top", "shirt", "#9CAA8C", 2, 1, shirt("#9CAA8C", "#7F8E70"), 40, "linen"),
]
CANDIDATE = DemoGarment("navy-knit-sweater", "Navy knit sweater", "top", "sweater", "#24345A", 1, 3, sweater("#24345A", "#3A4A72"), 65, "wool")


def _bbox(g: DemoGarment, pad: float = 4) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for p in g.prims:
        if p[0] in ("poly", "line"):
            xs += [x for x, _ in p[1]]
            ys += [y for _, y in p[1]]
        elif p[0] == "circle":
            xs += [p[1] - p[3], p[1] + p[3]]
            ys += [p[2] - p[3], p[2] + p[3]]
        elif p[0] == "rect":
            xs += [p[1], p[3]]
            ys += [p[2], p[4]]
    return min(xs) - pad, min(ys) - pad, max(xs) - min(xs) + 2 * pad, max(ys) - min(ys) + 2 * pad


def _light(hex_value: str) -> bool:
    r, g, b = (int(hex_value[i:i + 2], 16) for i in (1, 3, 5))
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.85


def to_svg(g: DemoGarment) -> str:
    x, y, w, h = _bbox(g)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {w:g} {h:g}" role="img" aria-label="{g.name}">']
    for p in g.prims:
        kind = p[0]
        if kind == "poly":
            pts = " ".join(f"{x},{y}" for x, y in p[1])
            stroke = "#BDB6AB" if _light(p[2]) else p[2]
            parts.append(f'<polygon points="{pts}" fill="{p[2]}" stroke="{stroke}" stroke-width="2" stroke-linejoin="round"/>')
        elif kind == "line":
            pts = " ".join(f"{x},{y}" for x, y in p[1])
            parts.append(f'<polyline points="{pts}" fill="none" stroke="{p[2]}" stroke-width="{p[3]}" stroke-linecap="round" stroke-linejoin="round"/>')
        elif kind == "circle":
            parts.append(f'<circle cx="{p[1]}" cy="{p[2]}" r="{p[3]}" fill="{p[4]}"/>')
        elif kind == "rect":
            parts.append(f'<rect x="{p[1]}" y="{p[2]}" width="{p[3] - p[1]}" height="{p[4] - p[2]}" rx="4" fill="{p[5]}"/>')
    parts.append("</svg>")
    return "".join(parts)


def rasterize(g: DemoGarment, scale: int = 3) -> Image.Image:
    img = Image.new("RGBA", (W * scale, H * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = scale
    for p in g.prims:
        kind = p[0]
        if kind == "poly":
            d.polygon([(x * s, y * s) for x, y in p[1]], fill=p[2])
        elif kind == "line":
            d.line([(x * s, y * s) for x, y in p[1]], fill=p[2], width=max(1, int(p[3] * s)))
        elif kind == "circle":
            d.ellipse(((p[1] - p[3]) * s, (p[2] - p[3]) * s, (p[1] + p[3]) * s, (p[2] + p[3]) * s), fill=p[4])
        elif kind == "rect":
            d.rounded_rectangle((p[1] * s, p[2] * s, p[3] * s, p[4] * s), radius=4 * s, fill=p[5])
    return img.crop(img.getbbox())


def write_svgs(out_dir) -> None:
    from pathlib import Path

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for g in GARMENTS + [CANDIDATE]:
        (out / f"{g.slug}.svg").write_text(to_svg(g))


if __name__ == "__main__":
    import sys

    write_svgs(sys.argv[1])
