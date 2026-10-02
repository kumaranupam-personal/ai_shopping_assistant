"""OpenAI adapter (docs/09-llm-providers.md, OpenAI adapter). The only module that imports the OpenAI SDK."""

import json

import openai

from app.config import Settings
from app.llm.base import (
    REQUEST_TIMEOUT_SECONDS,
    LLMResponse,
    LLMUpstreamError,
    StopReason,
    ToolCall,
    ToolResult,
    ToolSpec,
    Usage,
    is_upstream_failure,
)

DEFAULT_MODEL = "gpt-6-astra"


def flatten(history: list) -> list:
    """The Responses API takes a flat list of items. A history entry is one item (a user message) or a list of them
    (one response's output, or one turn's tool results)."""
    return [item for entry in history for item in (entry if isinstance(entry, list) else [entry])]


def parse_arguments(raw: str) -> dict:
    """Malformed arguments become {}, so the tool fails with an error result the model can correct."""
    try:
        arguments = json.loads(raw)
    except ValueError:
        return {}
    return arguments if isinstance(arguments, dict) else {}


class OpenAIProvider:
    name = "openai"
    min_cache_tokens = 1024

    def __init__(self, settings: Settings, client: openai.AsyncOpenAI | None = None):
        # The key is passed explicitly so the SDK never reads OPENAI_API_KEY on its own.
        self.client = client or openai.AsyncOpenAI(api_key=settings.llm_api_key, timeout=REQUEST_TIMEOUT_SECONDS)
        self.model = settings.llm_model or DEFAULT_MODEL
        self.effort = settings.llm_effort
        self.max_tokens = settings.llm_max_tokens

    async def complete(self, system: str, history: list, tools: list[ToolSpec]) -> LLMResponse:
        try:
            response = await self.client.responses.create(
                model=self.model,
                instructions=system,
                input=flatten(history),
                tools=[
                    {"type": "function", "name": t.name, "description": t.description, "parameters": t.parameters, "strict": False}
                    for t in tools
                ],
                tool_choice="auto",
                reasoning={"effort": self.effort},
                max_output_tokens=self.max_tokens,
                # Nothing is stored server-side; reasoning comes back encrypted so it can be sent with the next call.
                store=False,
                include=["reasoning.encrypted_content"],
            )
        except openai.APIConnectionError as e:
            raise LLMUpstreamError(str(e)) from e
        except openai.APIStatusError as e:
            if is_upstream_failure(e.status_code):
                raise LLMUpstreamError(str(e)) from e
            raise

        text, tool_calls, refused = [], [], False
        for item in response.output:
            if item.type == "message":
                text += [part.text for part in item.content if part.type == "output_text"]
                refused = refused or any(part.type == "refusal" for part in item.content)
            elif item.type == "function_call":
                tool_calls.append(ToolCall(item.call_id, item.name, parse_arguments(item.arguments)))

        incomplete = response.incomplete_details.reason if response.incomplete_details else None
        stop_reason: StopReason = (
            "refusal" if refused or incomplete == "content_filter"
            else "max_tokens" if incomplete == "max_output_tokens"
            else "tool_use" if tool_calls
            else "end_turn"
        )
        usage = Usage()
        if response.usage:
            cached = response.usage.input_tokens_details.cached_tokens
            # OpenAI counts cached tokens inside input_tokens; the neutral Usage counts only uncached input.
            usage = Usage(response.usage.input_tokens - cached, response.usage.output_tokens, cached)
        return LLMResponse(text, tool_calls, stop_reason, native_message=list(response.output), usage=usage)

    def user_message(self, text: str) -> dict:
        return {"role": "user", "content": text}

    def tool_results_message(self, results: list[ToolResult]) -> list[dict]:
        # The API has no error flag on tool output; an error result's content is its one-line message.
        return [{"type": "function_call_output", "call_id": r.call_id, "output": r.content} for r in results]
