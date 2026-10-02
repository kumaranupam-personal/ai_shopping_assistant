"""Anthropic adapter (docs/09-llm-providers.md, Anthropic adapter). The only module that imports the Anthropic SDK."""

import anthropic

from app.config import Settings
from app.llm.base import (
    REQUEST_TIMEOUT_SECONDS,
    LLMResponse,
    LLMUpstreamError,
    ToolCall,
    ToolResult,
    ToolSpec,
    Usage,
    is_upstream_failure,
)

DEFAULT_MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
STOP_REASONS = {"end_turn", "tool_use", "max_tokens", "refusal"}
CACHE = {"type": "ephemeral"}


def echoable(content: list) -> list:
    """Content safe to send back: after a fallback, only text blocks from before the last switch point are kept."""
    switches = [i for i, block in enumerate(content) if block.type == "fallback"]
    if not switches:
        return content
    last = switches[-1]
    return [b for b in content[:last] if b.type == "text"] + content[last + 1 :]


def with_cache_marker(history: list) -> list:
    """A copy of the history whose last block is marked for caching, so each call reads the earlier conversation
    from the cache. The last message is always one this adapter built (user text or tool results), so its blocks are
    plain dicts. The stored history is never changed.
    """
    if not history:
        return history
    *earlier, last = history
    content = last["content"]
    blocks = [{"type": "text", "text": content}] if isinstance(content, str) else list(content)
    blocks[-1] = {**blocks[-1], "cache_control": CACHE}
    return [*earlier, {**last, "content": blocks}]


class AnthropicProvider:
    name = "anthropic"
    min_cache_tokens = 512

    def __init__(self, settings: Settings, client: anthropic.AsyncAnthropic | None = None):
        # The key is passed explicitly so the SDK never reads ANTHROPIC_API_KEY on its own.
        self.client = client or anthropic.AsyncAnthropic(api_key=settings.api_key(self.name), timeout=REQUEST_TIMEOUT_SECONDS)
        self.model = settings.llm_model or DEFAULT_MODEL
        self.effort = settings.llm_effort
        self.max_tokens = settings.llm_max_tokens

    async def complete(self, system: str, history: list, tools: list[ToolSpec]) -> LLMResponse:
        try:
            message = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=[{"type": "text", "text": system, "cache_control": CACHE}],
                tools=[{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools],
                tool_choice={"type": "auto"},
                messages=with_cache_marker(history),  # consecutive user messages are sent as is; the API merges them
                output_config={"effort": self.effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.APIConnectionError as e:
            raise LLMUpstreamError(str(e)) from e
        except anthropic.APIStatusError as e:
            if is_upstream_failure(e.status_code):
                raise LLMUpstreamError(str(e)) from e
            raise
        content = echoable(message.content)
        return LLMResponse(
            text=[b.text for b in content if b.type == "text"],
            tool_calls=[ToolCall(b.id, b.name, b.input) for b in content if b.type == "tool_use"],
            stop_reason=message.stop_reason if message.stop_reason in STOP_REASONS else "end_turn",
            native_message={"role": "assistant", "content": content},
            usage=Usage(
                message.usage.input_tokens,
                message.usage.output_tokens,
                message.usage.cache_read_input_tokens or 0,
            ),
        )

    def user_message(self, text: str) -> dict:
        return {"role": "user", "content": text}

    def tool_results_message(self, results: list[ToolResult]) -> dict:
        return {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": r.call_id, "content": r.content, "is_error": r.is_error}
                for r in results
            ],
        }
