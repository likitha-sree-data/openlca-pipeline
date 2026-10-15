"""Download model weights at image build time so the Space starts warm.

Each step is optional: a failure is reported and the app falls back at runtime.
"""
from __future__ import annotations

import os
import sys

ok = True


def step(name: str, fn) -> None:
    global ok
    try:
        fn()
        print(f"[prefetch] {name}: ready")
    except Exception as exc:  # keep building; the app has fallbacks
        ok = False
        print(f"[prefetch] {name}: skipped ({type(exc).__name__}: {exc})")


def rembg() -> None:
    from rembg import new_session

    new_session("u2netp")


def fashion_clip() -> None:
    from transformers import CLIPModel, CLIPProcessor

    mid = os.environ.get("FASHION_CLIP_MODEL", "patrickjohncyh/fashion-clip")
    CLIPModel.from_pretrained(mid)
    CLIPProcessor.from_pretrained(mid)


def segformer() -> None:
    from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

    mid = os.environ.get("SEGFORMER_MODEL", "mattmdjaga/segformer_b2_clothes")
    SegformerImageProcessor.from_pretrained(mid)
    AutoModelForSemanticSegmentation.from_pretrained(mid)


step("rembg u2netp", rembg)
step("FashionCLIP", fashion_clip)
step("SegFormer clothes", segformer)
sys.exit(0 if ok or "--allow-missing" in sys.argv else 1)
