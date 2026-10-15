"""LLM providers behind one interface. Keys stay on the server."""
from __future__ import annotations

from functools import lru_cache

from ..config import get_settings
from .base import LLMProvider, NoneProvider


@lru_cache
def get_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "anthropic" and s.anthropic_api_key:
        from .anthropic import AnthropicProvider

        return AnthropicProvider(s.anthropic_api_key, s.llm_model)
    if s.llm_provider == "gemini" and s.gemini_api_key:
        from .gemini import GeminiProvider

        return GeminiProvider(s.gemini_api_key, s.llm_model)
    return NoneProvider()


__all__ = ["LLMProvider", "NoneProvider", "get_provider"]
