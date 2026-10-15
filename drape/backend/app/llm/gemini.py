"""Gemini through its REST API (generateContent with function calling)."""
from __future__ import annotations

import base64
from collections.abc import Callable
from typing import Any

import httpx

from .base import LABEL_PROMPT, parse_json_reply

DEFAULT_MODEL = "gemini-2.5-flash"
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_TOOL_ROUNDS = 4


class GeminiProvider:
    name = "gemini"
    can_chat = True
    can_read_labels = True

    def __init__(self, api_key: str, model: str = "", http: httpx.Client | None = None) -> None:
        self.key = api_key
        self.model = model or DEFAULT_MODEL
        self.http = http or httpx.Client(timeout=60)

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        r = self.http.post(URL.format(model=self.model), json=body, headers={"x-goog-api-key": self.key})
        r.raise_for_status()
        return r.json()

    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]], system: str = "",
             execute: Callable[[str, dict[str, Any]], Any] | None = None) -> dict[str, Any]:
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages]
        decls = [{"name": t["name"], "description": t["description"], "parameters": t["parameters"]} for t in tools]
        calls: list[dict[str, Any]] = []
        for _ in range(MAX_TOOL_ROUNDS + 1):
            data = self._post({"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
                               "tools": [{"functionDeclarations": decls}]})
            parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            fcalls = [p["functionCall"] for p in parts if "functionCall" in p]
            if not fcalls or execute is None:
                return {"text": "".join(p.get("text", "") for p in parts).strip(), "tool_calls": calls}
            contents.append({"role": "model", "parts": parts})
            responses = []
            for fc in fcalls:
                try:
                    out = execute(fc["name"], dict(fc.get("args") or {}))
                except Exception as exc:
                    out = {"error": str(exc)[:200]}
                calls.append({"name": fc["name"], "input": dict(fc.get("args") or {}), "output": out})
                responses.append({"functionResponse": {"name": fc["name"], "response": {"result": out}}})
            contents.append({"role": "user", "parts": responses})
        return {"text": "", "tool_calls": calls}

    def read_label(self, image_jpeg: bytes) -> dict[str, Any]:
        data = self._post({"contents": [{"role": "user", "parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": base64.standard_b64encode(image_jpeg).decode()}},
            {"text": LABEL_PROMPT}]}]})
        parts = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        return parse_json_reply("".join(p.get("text", "") for p in parts))


__all__ = ["GeminiProvider"]
