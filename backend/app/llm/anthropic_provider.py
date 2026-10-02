"""Anthropic adapter (docs/09-llm-providers.md, Anthropic adapter). The only module that imports the Anthropic SDK."""

import anthropic

from app.config import Settings
from app.llm.base import LLMResponse, LLMUpstreamError, ToolCall, ToolResult, ToolSpec, Usage

DEFAULT_MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
REQUEST_TIMEOUT_SECONDS = 60  # per attempt; the SDK retries failed attempts twice
STOP_REASONS = {"end_turn", "tool_use", "max_tokens", "refusal"}


def echoable(content: list) -> list:
    """Content safe to send back: after a fallback, only text blocks from before the last switch point are kept."""
    switches = [i for i, block in enumerate(content) if block.type == "fallback"]
    if not switches:
        return content
    last = switches[-1]
    return [b for b in content[:last] if b.type == "text"] + content[last + 1 :]


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, settings: Settings, client: anthropic.AsyncAnthropic | None = None):
        # The key is passed explicitly so the SDK never reads ANTHROPIC_API_KEY on its own.
        self.client = client or anthropic.AsyncAnthropic(api_key=settings.llm_api_key, timeout=REQUEST_TIMEOUT_SECONDS)
        self.model = settings.llm_model or DEFAULT_MODEL
        self.effort = settings.llm_effort
        self.max_tokens = settings.llm_max_tokens

    async def complete(self, system: str, history: list, tools: list[ToolSpec]) -> LLMResponse:
        try:
            message = await self.client.beta.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                tools=[{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools],
                tool_choice={"type": "auto"},
                messages=history,
                output_config={"effort": self.effort},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except anthropic.APIConnectionError as e:
            raise LLMUpstreamError(str(e)) from e
        except anthropic.APIStatusError as e:
            if e.status_code == 429 or e.status_code >= 500:
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
