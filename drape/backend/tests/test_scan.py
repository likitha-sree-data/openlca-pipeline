import io

import numpy as np
from PIL import Image, ImageDraw

from app import colors
from app.embed import FeatureEmbedder, cosine
from app.images import dhash, hamming, to_rgb
from app.scan import border_mask, cutout, guess_from_shape, scan_image
from app.testing.synth import garment_photo


def test_color_naming():
    assert colors.name_color("#1F2D4D") == "navy"
    assert colors.name_color("#202E4F") == "navy"
    assert colors.name_color("#EDE4CF") == "cream"
    assert colors.name_color("#5F6136") == "olive"
    assert colors.name_color("#D3C0A0") == "beige"
    assert colors.name_color("#F8F8F8") == "white"
    assert colors.name_color("#111111") == "black"
    assert colors.name_color("#B22222") == "red"


def test_harmony_kinds():
    navy = colors.swatch("navy", "#1F2D4D")
    cream = colors.swatch("cream", "#EDE4CF")
    red = colors.swatch("red", "#B8302F")
    green = colors.swatch("green", "#3E7B4A")
    blue = colors.swatch("blue", "#2F5DA8")
    assert colors.pair_harmony(navy, cream)[1] == "neutral pairing"
    assert colors.pair_harmony(red, green)[1] == "complementary"
    assert colors.pair_harmony(green, blue)[0] < 0
    striped = colors.swatch("red", "#B8302F", "patterned")
    assert colors.pair_harmony(striped, colors.swatch("navy", "#1F2D4D", "patterned"))[1] == "pattern clash"


def test_transparent_png_keeps_its_color():
    img = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    ImageDraw.Draw(img).rectangle((100, 80, 300, 320), fill=(31, 45, 77, 255))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    loaded = Image.open(io.BytesIO(buf.getvalue()))
    cut = cutout(loaded)
    assert cut.ok and cut.method == "alpha"
    rgb = to_rgb(cut.image)
    # transparent corners become white, never black
    assert rgb.getpixel((0, 0)) == (31, 45, 77) or rgb.getpixel((0, 0))[0] > 200
    result, _, _ = scan_image(loaded)
    assert result.color_name == "navy"
    full = to_rgb(loaded)
    assert full.getpixel((5, 5)) == (255, 255, 255)


def test_border_cutout_on_plain_background():
    img = garment_photo("bottom", "#1F2D4D", seed=3)
    mask = border_mask(img)
    assert mask is not None
    assert 0.1 < mask.mean() < 0.6


def test_cutout_and_scan_on_synthetic_photo():
    img = garment_photo("top", "#5F6136", seed=4)
    result, cut, emb = scan_image(img)
    assert result.cutout_ok
    assert result.color_name == "olive"
    assert emb.shape == (512,)
    assert abs(np.linalg.norm(emb) - 1) < 1e-3
    assert result.timings["cutout"] < 8


def test_white_on_white_falls_back_to_card():
    img = garment_photo("top", "#F4F4F0", bg="#F2F2EE", seed=1, noise=1)
    result, cut, _ = scan_image(img)
    if not result.cutout_ok:
        assert result.tips and "plain" in result.tips[0]
        assert result.needs_review
        assert cut.image.mode == "RGB"


def test_busy_background_fails_border_method():
    img = garment_photo("top", "#2F5DA8", busy=True, seed=2)
    assert border_mask(img) is None


def test_shape_guesses():
    assert guess_from_shape(border_mask(garment_photo("layer", "#5F6136", seed=8)))[0] == "top"
    for cat in ("bottom", "shoes"):
        img = garment_photo(cat, "#1F2D4D", seed=5)
        mask = border_mask(img)
        assert guess_from_shape(mask)[0] == cat


def test_pattern_detection():
    striped = garment_photo("top", "#F4F4F0", stripes="#1F2D4D", bg="#8A7F72", seed=6)
    result, _, _ = scan_image(striped)
    assert result.pattern == "patterned"
    plain = garment_photo("top", "#B8302F", seed=7)
    assert scan_image(plain)[0].pattern == "solid"


def test_category_hint_wins_in_fallback():
    img = garment_photo("layer", "#5F6136", seed=8)
    result, _, _ = scan_image(img, hint="layer")
    assert result.category == "layer"
    assert not result.needs_review


def test_similarity_ranking_on_synthetic_garments():
    emb = FeatureEmbedder()

    def e(cat, color, seed):
        return emb.embed(cutout(garment_photo(cat, color, seed=seed)).image)

    query = e("top", "#1F2D4D", 10)  # navy sweater
    navy_cardigan = e("layer", "#22304F", 11)
    olive_cardigan = e("layer", "#5F6136", 12)
    red_top = e("top", "#B8302F", 13)
    sims = {"navy_cardigan": cosine(query, navy_cardigan), "olive": cosine(query, olive_cardigan), "red": cosine(query, red_top)}
    assert max(sims, key=sims.get) == "navy_cardigan"


def test_dhash_detects_near_duplicates():
    a = cutout(garment_photo("top", "#2F5DA8", seed=1)).image
    b = cutout(garment_photo("top", "#2F5DA8", seed=2)).image
    c = cutout(garment_photo("bottom", "#B8302F", seed=3)).image
    assert hamming(dhash(a), dhash(b)) <= 10
    assert hamming(dhash(a), dhash(c)) > 10


def test_rembg_cutout_when_enabled(monkeypatch):
    from app import scan as scan_mod
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "enable_rembg", True)
    scan_mod._rembg_session.cache_clear()
    try:
        img = garment_photo("top", "#2F5DA8", seed=21)
        cut = cutout(img)
        assert cut.ok and cut.method == "rembg"
        result, _, _ = scan_image(img)
        assert result.color_name in ("blue", "denim blue")
        assert result.timings["cutout"] < 8
    finally:
        scan_mod._rembg_session.cache_clear()
