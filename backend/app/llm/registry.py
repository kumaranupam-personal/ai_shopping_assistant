"""Builds the adapter named by LLM_PROVIDER (docs/09-llm-providers.md, Registry)."""

from app.config import Settings
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.base import LLMConfigError, LLMProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.openai_provider import OpenAIProvider

PROVIDERS = {"anthropic": AnthropicProvider, "openai": OpenAIProvider, "gemini": GeminiProvider}


def build_provider(settings: Settings) -> LLMProvider:
    adapter = PROVIDERS.get(settings.llm_provider)
    if adapter is None:
        raise LLMConfigError(f"Unknown LLM_PROVIDER {settings.llm_provider!r}; choose one of {sorted(PROVIDERS)}.")
    if not settings.llm_api_key:
        raise LLMConfigError(f"LLM_API_KEY is required for LLM_PROVIDER {settings.llm_provider!r}.")
    return adapter(settings)
