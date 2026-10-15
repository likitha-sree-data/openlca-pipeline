"""Provider interface.

chat(messages, tools) returns {"text": str, "tool_calls": [{"id", "name", "input"}]}.
read_label(image_jpeg) returns {"care": {...}, "fiber_content": [{"fiber", "percent"}]}.
"""
from __future__ import annotations

from typing import Any, Protocol


class LLMProvider(Protocol):
    name: str
    can_chat: bool
    can_read_labels: bool

    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], system: str = "",
             execute: Any = None) -> dict[str, Any]: ...

    def read_label(self, image_jpeg: bytes) -> dict[str, Any]: ...


class NoneProvider:
    """Zero-cost provider. Chat is handled by the rule-based parser instead."""

    name = "none"
    can_chat = False
    can_read_labels = False

    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], system: str = "",
             execute: Any = None) -> dict[str, Any]:
        raise RuntimeError("No LLM provider configured")

    def read_label(self, image_jpeg: bytes) -> dict[str, Any]:
        raise RuntimeError("No LLM provider configured")


LABEL_PROMPT = (
    "Read this clothing care label. Reply with JSON only, no prose, in this shape: "
    '{"care": {"wash": "cold|30|40|60|hand|no", "dry": "tumble_low|tumble|line|flat|no_tumble", '
    '"iron": "low|medium|high|no", "dry_clean": true|false}, '
    '"fiber_content": [{"fiber": "cotton", "percent": 100}]}. Leave out any field you cannot read.'
)


def parse_json_reply(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model reply."""
    import json

    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}
