"""Ask about your wardrobe.

The assistant is grounded in the person's own data through three tools:
search_garments, generate_outfits and get_wear_stats. It sees text metadata
only, never photos. Without an LLM key a rule-based parser calls the same
tools, so the feature works at zero cost. Every garment id that reaches the
browser is checked against the person's closet first.
"""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from .colors import COLOR_NAMES, NEUTRALS
from .engine import OCCASIONS, Engine
from .services import load_pieces, make_context, wear_stats

TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_garments",
        "description": "Search the person's closet. Returns real garments with id, name, category, color, wear count and last worn date. Use it before naming any garment.",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Words to match in the garment name, for example cardigan or jeans."},
                "category": {"type": "string", "enum": ["top", "bottom", "layer", "dress", "shoes", "accessory"]},
                "color": {"type": "string", "description": "A color or color family, for example green, navy or neutral."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "generate_outfits",
        "description": "Build outfits from the person's own clothes with Drape's outfit engine. Optionally require one garment by id.",
        "parameters": {
            "type": "object",
            "properties": {
                "occasion": {"type": "string", "enum": list(OCCASIONS)},
                "with_garment_id": {"type": "string", "description": "Id of a garment that must be in every outfit."},
                "count": {"type": "integer", "minimum": 1, "maximum": 3},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "get_wear_stats",
        "description": "Wear statistics from confirmed wear logs: most worn, least worn, or not worn lately.",
        "parameters": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["most_worn", "least_worn", "not_worn_lately"]},
                "days": {"type": "integer", "minimum": 7, "maximum": 730, "description": "For not_worn_lately: how many days counts as lately."},
            },
            "required": ["kind"],
            "additionalProperties": False,
        },
    },
]

SYSTEM = (
    "You are Drape's wardrobe assistant. Answer questions about the person's own clothes in two to four short, plain "
    "sentences. Only mention garments that a tool returned, using their exact names. Never invent a garment, a brand or "
    "a purchase. Suggest outfits only by calling generate_outfits. Inform, never push or shame; the person decides. "
    "If a question is not about their clothes, say briefly that you can only help with their wardrobe."
)

COLOR_FAMILIES: dict[str, set[str]] = {
    "green": {"green", "olive", "sage", "forest green", "teal", "khaki"},
    "blue": {"blue", "light blue", "navy", "denim blue", "teal"},
    "red": {"red", "burgundy", "rust"},
    "pink": {"pink", "blush"},
    "purple": {"purple", "lavender"},
    "yellow": {"yellow", "mustard"},
    "orange": {"orange", "rust"},
    "brown": {"brown", "chocolate", "camel", "tan"},
    "grey": {"grey", "light grey", "charcoal"},
    "gray": {"grey", "light grey", "charcoal"},
    "white": {"white", "cream"},
    "black": {"black", "charcoal"},
    "beige": {"beige", "cream", "camel", "khaki", "tan"},
    "neutral": set(NEUTRALS),
}
OCCASION_WORDS = {
    "work": "work", "office": "work", "job": "work",
    "meeting": "meeting", "interview": "meeting", "presentation": "meeting", "client": "meeting",
    "date": "date", "dinner": "date",
    "formal": "formal", "wedding": "formal", "gala": "formal",
    "weekend": "weekend", "casual": "weekend", "saturday": "weekend", "sunday": "weekend",
    "everyday": "everyday", "today": "everyday", "school": "everyday", "errands": "everyday",
}
CATEGORY_WORDS = {
    "top": "top", "tops": "top", "shirt": "top", "shirts": "top", "tee": "top", "sweater": "top",
    "bottom": "bottom", "bottoms": "bottom", "trousers": "bottom", "jeans": "bottom", "pants": "bottom", "skirt": "bottom",
    "layer": "layer", "layers": "layer", "jacket": "layer", "jackets": "layer", "cardigan": "layer", "coat": "layer", "blazer": "layer",
    "dress": "dress", "dresses": "dress",
    "shoes": "shoes", "shoe": "shoes", "trainers": "shoes", "sneakers": "shoes", "boots": "shoes",
    "accessory": "accessory", "accessories": "accessory",
}
STOP = {"my", "the", "a", "an", "with", "what", "goes", "go", "does", "do", "i", "wear", "can", "to", "and", "or", "for", "me", "it", "is", "on", "in"}


class ChatTools:
    """Executes tool calls against one person's data and remembers which ids it returned."""

    def __init__(self, db: Session, profile, today: date | None = None) -> None:
        self.db = db
        self.profile = profile
        self.today = today or date.today()
        self.pieces, self.garments = load_pieces(db, profile.id)
        self.stats = wear_stats(db, profile.id)
        self.returned_ids: set[str] = set()
        self.outfits: list[dict[str, Any]] = []

    def _g(self, gid: str) -> dict[str, Any]:
        g = self.garments[gid]
        st = self.stats.get(uuid.UUID(gid), {"wear_count": 0, "last_worn": None})
        self.returned_ids.add(gid)
        return {"id": gid, "name": g.name, "category": g.category, "color": g.color_name, "status": g.status,
                "wear_count": st["wear_count"], "last_worn": st["last_worn"].isoformat() if st["last_worn"] else None}

    def execute(self, name: str, args: dict[str, Any]) -> Any:
        if name == "search_garments":
            return self.search_garments(**args)
        if name == "generate_outfits":
            return self.generate_outfits(**args)
        if name == "get_wear_stats":
            return self.get_wear_stats(**args)
        raise ValueError(f"Unknown tool {name}")

    def search_garments(self, text: str | None = None, category: str | None = None, color: str | None = None) -> list[dict[str, Any]]:
        colors = None
        if color:
            c = color.lower().strip()
            colors = COLOR_FAMILIES.get(c, {c})
        words = [w for w in re.findall(r"[a-z]+", (text or "").lower()) if w not in STOP]
        out = []
        for gid, g in self.garments.items():
            if category and g.category != category:
                continue
            if colors is not None and (g.color_name or "") not in colors:
                continue
            if words and not all(w in g.name.lower() or w == (g.subtype or "") for w in words):
                continue
            out.append(self._g(gid))
        return out[:20]

    def generate_outfits(self, occasion: str = "everyday", with_garment_id: str | None = None, count: int = 1) -> list[dict[str, Any]]:
        if with_garment_id and with_garment_id not in self.garments:
            return [{"error": "That garment is not in the closet."}]
        ctx = make_context(self.db, self.profile, occasion if occasion in OCCASIONS else "everyday", None, seed=len(self.outfits))
        eng = Engine(self.pieces, ctx)
        results = []
        for o in eng.suggest(n=max(1, min(count, 3)), pinned=with_garment_id):
            d = o.to_dict()
            d["occasion"] = ctx.occasion
            d["pieces"] = [{**p, "name": self.garments[p["garment_id"]].name} for p in d["pieces"]]
            for p in d["pieces"]:
                self.returned_ids.add(p["garment_id"])
            results.append(d)
        self.outfits.extend(results)
        return results

    def get_wear_stats(self, kind: str, days: int = 60) -> list[dict[str, Any]]:
        rows = [self._g(gid) for gid, g in self.garments.items() if g.status in ("active", "keepsake")]
        if kind == "most_worn":
            return sorted([r for r in rows if r["wear_count"]], key=lambda r: -r["wear_count"])[:5]
        if kind == "least_worn":
            return sorted(rows, key=lambda r: (r["wear_count"], r["last_worn"] or ""))[:5]
        cutoff = date.fromordinal(self.today.toordinal() - days)
        return [r for r in rows if r["last_worn"] is None or date.fromisoformat(r["last_worn"]) < cutoff][:8]

    def find_by_name(self, message: str) -> str | None:
        words = {w for w in re.findall(r"[a-z]+", message.lower()) if w not in STOP}
        best, best_score = None, 0
        for gid, g in self.garments.items():
            name_words = set(re.findall(r"[a-z]+", g.name.lower()))
            hits = len(words & name_words)
            non_color = words & name_words - set(" ".join(COLOR_NAMES).split())
            if hits and non_color and hits > best_score:
                best, best_score = gid, hits
        return best


def _names(items: list[dict[str, Any]], limit: int = 5) -> str:
    names = [i["name"] for i in items[:limit]]
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _lower_first(s: str) -> str:
    return s[:1].lower() + s[1:]


def rule_based(message: str, tools: ChatTools) -> str:
    """Zero-cost assistant: understands occasions, colors, haven't worn and goes with X."""
    m = message.lower()
    if re.search(r"\b(go(es)? with|wear with|pair(s)? with|match(es)? with|style)\b", m):
        gid = tools.find_by_name(m)
        if gid is None:
            return "I could not find that piece in your closet. Try its name as it appears in your wardrobe, like olive cardigan."
        outfits = tools.generate_outfits(occasion=_occasion(m) or "everyday", with_garment_id=gid)
        name = tools.garments[gid].name.lower()
        if not outfits:
            return f"Nothing in your closet passes the color and dress-code rules with your {name} yet."
        others = [p["name"].lower() for p in outfits[0]["pieces"] if p["garment_id"] != gid]
        reason = next((r for r in outfits[0]["reasons"] if name not in r.lower()), None)
        return f"Your {name} goes well with your {_names([{'name': o} for o in others])}." + (f" {reason}." if reason else "")
    if re.search(r"(haven'?t|have not|not) (been )?worn|lately|forgotten|never worn|neglected|in a while", m):
        items = tools.get_wear_stats("not_worn_lately", days=tools.profile.nudge_days if "lately" not in m else 30)
        if not items:
            return "You have worn everything recently. Nice work using what you own."
        never = [i for i in items if i["last_worn"] is None]
        lead = f"Not worn lately: {_names(items)}."
        return lead + (f" {len(never)} of these have not been worn since you added them." if never else "") + " Want an outfit with one of them? Ask what goes with it."
    if re.search(r"most worn|wear (the )?most|favou?rites?", m):
        items = tools.get_wear_stats("most_worn")
        return f"Your most worn pieces are {_names(items)}." if items else "No confirmed wears yet. Log an outfit in History to see this."
    color = next((c for c in sorted(set(COLOR_NAMES) | set(COLOR_FAMILIES), key=len, reverse=True) if re.search(rf"\b{re.escape(c)}\b", m)), None)
    if color and re.search(r"\b(own|have|got|anything|any)\b", m):
        items = tools.search_garments(color=color)
        if not items:
            return f"You do not own anything {color} yet."
        return f"Yes. In {color} you have {_lower_first(_names(items, 6))}."
    occasion = _occasion(m)
    if occasion or re.search(r"what (can|should|could) i wear|outfit|suggest|put on", m):
        outfits = tools.generate_outfits(occasion=occasion or "everyday")
        if not outfits:
            return "I need a few more pieces to build an outfit: shoes, plus a top and a bottom or a dress."
        o = outfits[0]
        label = OCCASIONS[o["occasion"]][0].lower()
        return f"For {label}, try your {_names([{'name': p['name'].lower()} for p in o['pieces']])}. {o['reasons'][0]}."
    cat = next((CATEGORY_WORDS[w] for w in re.findall(r"[a-z]+", m) if w in CATEGORY_WORDS), None)
    if cat:
        items = tools.search_garments(category=cat)
        return f"You have {len(items)}: {_names(items, 6)}." if items else "You have none of those yet."
    return ("I can help with questions about your clothes. Try: What can I wear to work? Do I own anything green? "
            "What haven't I worn lately? What goes with my olive cardigan?")


def _occasion(m: str) -> str | None:
    for word, occ in OCCASION_WORDS.items():
        if re.search(rf"\b{word}\b", m):
            return occ
    return None
