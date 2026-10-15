"""Upload validation and image helpers.

Type is checked by content, not by name. EXIF is stripped by re-encoding,
after applying the orientation tag. Transparency is always composited onto
white before converting to RGB, so it never turns black.
"""
from __future__ import annotations

import hashlib
import io
import warnings

import numpy as np
from fastapi import HTTPException
from PIL import Image, ImageOps

from .config import get_settings

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class UploadInvalid(HTTPException):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(status, message)


def validate_upload(data: bytes) -> Image.Image:
    s = get_settings()
    if len(data) == 0:
        raise UploadInvalid("The file is empty. Choose a photo and try again.")
    if len(data) > s.upload_max_mb * 1024 * 1024:
        raise UploadInvalid(f"The photo is larger than {s.upload_max_mb} MB. Choose a smaller photo.", 413)
    Image.MAX_IMAGE_PIXELS = s.upload_max_pixels
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(data))
            fmt = probe.format
            w, h = probe.size
            probe.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UploadInvalid("The photo has too many pixels. Use a photo under 40 megapixels.", 413) from exc
    except Exception as exc:
        raise UploadInvalid("This file is not a photo Drape can read. Use a JPEG, PNG or WebP image.") from exc
    if fmt not in ALLOWED_FORMATS:
        raise UploadInvalid("This file type is not supported. Use a JPEG, PNG or WebP image.", 415)
    if w * h > s.upload_max_pixels:
        raise UploadInvalid("The photo has too many pixels. Use a photo under 40 megapixels.", 413)
    img = Image.open(io.BytesIO(data))
    img.load()
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() or "transparency" in img.info else "RGB")
    return img


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def to_rgb(img: Image.Image, bg: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """Composite any transparency onto a solid background, then drop alpha."""
    if img.mode == "RGB":
        return img
    rgba = img.convert("RGBA")
    base = Image.new("RGBA", rgba.size, bg + (255,))
    base.alpha_composite(rgba)
    return base.convert("RGB")


def has_transparency(img: Image.Image) -> bool:
    if img.mode != "RGBA":
        return False
    alpha = np.asarray(img.getchannel("A"))
    return bool((alpha < 250).mean() > 0.01)


def fit(img: Image.Image, max_side: int) -> Image.Image:
    if max(img.size) <= max_side:
        return img.copy()
    out = img.copy()
    out.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return out


def encode_jpeg(img: Image.Image, quality: int = 88) -> bytes:
    buf = io.BytesIO()
    to_rgb(img).save(buf, "JPEG", quality=quality, optimize=True)  # no exif passed, so none is written
    return buf.getvalue()


def encode_png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def encode_webp(img: Image.Image, quality: int = 82) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=4)
    return buf.getvalue()


def dhash(img: Image.Image, size: int = 8) -> str:
    """64-bit difference hash as hex."""
    g = to_rgb(img).convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    value = 0
    for b in bits:
        value = (value << 1) | int(b)
    return f"{value:016x}"


def hamming(a: str | None, b: str | None) -> int:
    if not a or not b:
        return 64
    return bin(int(a, 16) ^ int(b, 16)).count("1")
