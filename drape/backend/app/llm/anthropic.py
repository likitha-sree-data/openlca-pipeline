"""Claude via the official Anthropic SDK. Model and key come from the environment."""
from __future__ import annotations

import base64
import json
import logging
from collections.abc import Callable
from typing import Any

import anthropic

from .base import LABEL_PROMPT, parse_json_reply

log = logging.getLogger("drape.llm")
DEFAULT_MODEL = "claude-opus-5-5"
MAX_TOOL_ROUNDS = 4
REFUSAL_TEXT = "I can only help with questions about your clothes and outfits."


class AnthropicProvider:
    name = "anthropic"
    can_chat = True
    can_read_labels = True

    def __init__(self, api_key: str, model: str = "", client: Any = None) -> None:
        self.model = model or DEFAULT_MODEL
        self.client = client or anthropic.Anthropic(api_key=api_key, timeout=60.0, max_retries=2)

    def _create(self, **kwargs: Any):
        # Server-side refusal fallback: on a policy decline the API reruns the request on a
        # fallback model inside the same call, routed by refusal category.
        return self.client.beta.messages.create(
            model=self.model,
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default"},
            output_config={"effort": "low"},
            **kwargs,
        )

    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], system: str = "",
             execute: Callable[[str, dict[str, Any]], Any] | None = None) -> dict[str, Any]:
        msgs: list[dict[str, Any]] = [{"role": m["role"], "content": m["content"]} for m in messages]
        tool_defs = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]} for t in tools]
        calls: list[dict[str, Any]] = []
        for _ in range(MAX_TOOL_ROUNDS + 1):
            resp = self._create(max_tokens=4000, system=system, messages=msgs, tools=tool_defs)
            if resp.stop_reason == "refusal":
                return {"text": REFUSAL_TEXT, "tool_calls": calls}
            uses = [b for b in resp.content if b.type == "tool_use"]
            if not uses or execute is None:
                text = "".join(b.text for b in resp.content if b.type == "text").strip()
                return {"text": text, "tool_calls": calls}
            msgs.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in resp.content]})
            results = []
            for u in uses:
                try:
                    out = execute(u.name, dict(u.input or {}))
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": json.dumps(out)})
                except Exception as exc:  # tell the model, do not drop the call
                    out = {"error": str(exc)[:200]}
                    results.append({"type": "tool_result", "tool_use_id": u.id, "content": json.dumps(out), "is_error": True})
                calls.append({"name": u.name, "input": dict(u.input or {}), "output": out})
            msgs.append({"role": "user", "content": results})
        return {"text": "", "tool_calls": calls}

    def read_label(self, image_jpeg: bytes) -> dict[str, Any]:
        data = base64.standard_b64encode(image_jpeg).decode()
        resp = self._create(max_tokens=2000, messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
            {"type": "text", "text": LABEL_PROMPT},
        ]}])
        if resp.stop_reason == "refusal":
            return {}
        return parse_json_reply("".join(b.text for b in resp.content if b.type == "text"))
