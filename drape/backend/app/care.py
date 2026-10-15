"""Plain care advice generated from care fields."""
from __future__ import annotations

from typing import Any

WASH = {"cold": "Wash cold", "30": "Wash at 30°C", "40": "Wash at 40°C", "60": "Wash at 60°C",
        "hand": "Hand wash", "no": "Do not wash"}
DRY = {"tumble_low": "tumble dry low", "tumble": "tumble dry", "line": "dry on a line", "flat": "dry flat",
       "no_tumble": "do not tumble dry"}
IRON = {"low": "iron on low", "medium": "iron on medium", "high": "iron on high", "no": "do not iron"}
CARE_KEYS = {"wash": WASH, "dry": DRY, "iron": IRON}


def advice(care: dict[str, Any] | None) -> str | None:
    care = care or {}
    parts: list[str] = []
    if care.get("dry_clean") is True:
        parts.append("Dry clean only" if care.get("wash") in (None, "no") else "Dry clean recommended")
    for key, table in CARE_KEYS.items():
        v = care.get(key)
        if v in table:
            parts.append(table[v])
    if not parts:
        return None
    text = ", ".join(parts)
    return text[0].upper() + text[1:]


def clean_care(care: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, table in CARE_KEYS.items():
        if care.get(key) in table:
            out[key] = care[key]
    if isinstance(care.get("dry_clean"), bool):
        out["dry_clean"] = care["dry_clean"]
    return out
