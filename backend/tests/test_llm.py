import ast
import asyncio
import copy
from pathlib import Path

import anthropic
import httpx2
import pytest
from anthropic.types.beta import BetaMessage

from app.config import Settings
from app.llm.anthropic_provider import FALLBACK_BETA, REQUEST_TIMEOUT_SECONDS, AnthropicProvider
from app.llm.base import LLMConfigError, LLMUpstreamError, ToolCall, ToolResult, ToolSpec, Usage
from app.llm.registry import build_provider

APP_DIR = Path(__file__).resolve().parent.parent / "app"
PROVIDER_SDKS = {"anthropic", "openai", "google", "mistralai", "cohere"}

TOOL = ToolSpec(
    "search_products",
    "Search the catalog.",
    {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False},
)


def message(content, stop_reason="end_turn", cache_read=7):
    return BetaMessage.model_validate({
        "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "content": content,
        "stop_reason": stop_reason, "stop_sequence": None,
        "usage": {"input_tokens": 120, "output_tokens": 30, "cache_read_input_tokens": cache_read},
    })


class StubClient:
    """Mimics `client.beta.messages.create`: records the request and returns a prepared message or error."""

    def __init__(self, result):
        self.result, self.request = result, None
        self.beta = self
        self.messages = self

    async def create(self, **request):
        self.request = request
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def complete(result, history=None):
    client = StubClient(result)
    settings = Settings(_env_file=None, llm_api_key="test-key", llm_effort="medium", llm_max_tokens=4000)
    response = asyncio.run(AnthropicProvider(settings, client).complete("You help shoppers.", history or [], [TOOL]))
    return response, client.request


def test_request_carries_model_settings_tools_caching_and_fallback():
    _, request = complete(message([{"type": "text", "text": "Hi"}]), history=[{"role": "user", "content": "hello"}])
    assert request["model"] == "claude-opus-5-5" and request["max_tokens"] == 4000
    assert request["output_config"] == {"effort": "medium"} and "thinking" not in request
    assert request["system"] == [{"type": "text", "text": "You help shoppers.", "cache_control": {"type": "ephemeral"}}]
    assert request["tools"] == [{"name": TOOL.name, "description": TOOL.description, "input_schema": TOOL.parameters}]
    assert request["tool_choice"] == {"type": "auto"}
    assert request["fallbacks"] == "default" and request["betas"] == [FALLBACK_BETA]
    assert request["messages"] == [{"role": "user", "content": [{"type": "text", "text": "hello", "cache_control": {"type": "ephemeral"}}]}]


def test_only_a_copy_of_the_last_message_is_marked_for_caching():
    results = {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_1", "content": "{}", "is_error": False}]}
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": [{"type": "text", "text": "Hello."}]}, results]
    stored = copy.deepcopy(history)
    _, request = complete(message([{"type": "text", "text": "ok"}]), history=history)
    assert request["messages"][:2] == stored[:2]
    assert request["messages"][2]["content"] == [{**results["content"][0], "cache_control": {"type": "ephemeral"}}]
    assert history == stored  # the stored history is unchanged


def test_response_is_parsed_into_llm_response():
    content = [
        {"type": "thinking", "thinking": "", "signature": "sig"},
        {"type": "text", "text": "Searching now."},
        {"type": "tool_use", "id": "toolu_1", "name": "search_products", "input": {"query": "warm jacket"}},
    ]
    response, _ = complete(message(content, stop_reason="tool_use"))
    assert response.text == ["Searching now."]
    assert response.tool_calls == [ToolCall("toolu_1", "search_products", {"query": "warm jacket"})]
    assert response.stop_reason == "tool_use"
    assert response.usage == Usage(120, 30, 7)
    # Thinking and tool-use blocks are kept unchanged for the next request.
    assert response.native_message["role"] == "assistant"
    assert [b.type for b in response.native_message["content"]] == ["thinking", "text", "tool_use"]


@pytest.mark.parametrize(
    ("stop_reason", "expected"),
    [("end_turn", "end_turn"), ("max_tokens", "max_tokens"), ("refusal", "refusal"), ("stop_sequence", "end_turn")],
)
def test_stop_reasons_map_to_neutral_names(stop_reason, expected):
    response, _ = complete(message([{"type": "text", "text": "ok"}], stop_reason=stop_reason, cache_read=None))
    assert response.stop_reason == expected and response.usage.cache_read_tokens == 0


def test_fallback_keeps_only_text_before_the_switch_point():
    content = [
        {"type": "thinking", "thinking": "", "signature": "sig"},
        {"type": "text", "text": "Partial."},
        {"type": "fallback", "from": {"model": "claude-opus-5-5"}, "to": {"model": "claude-opus-4-8"},
         "trigger": {"type": "refusal", "category": "cyber"}},
        {"type": "text", "text": "Answer."},
    ]
    response, _ = complete(message(content))
    assert [b.type for b in response.native_message["content"]] == ["text", "text"]
    assert response.text == ["Partial.", "Answer."]


def test_messages_are_built_in_anthropic_format():
    provider = AnthropicProvider(Settings(_env_file=None, llm_api_key="k"), StubClient(None))
    assert provider.user_message("hi") == {"role": "user", "content": "hi"}
    results = [ToolResult("toolu_1", '{"ok": true}'), ToolResult("toolu_2", "boom", is_error=True)]
    assert provider.tool_results_message(results) == {
        "role": "user",
        "content": [
            {"type": "tool_result", "tool_use_id": "toolu_1", "content": '{"ok": true}', "is_error": False},
            {"type": "tool_result", "tool_use_id": "toolu_2", "content": "boom", "is_error": True},
        ],
    }


def _status_error(cls, status):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("failed", response=httpx2.Response(status, request=request), body=None)


@pytest.mark.parametrize(
    "error",
    [
        lambda: _status_error(anthropic.RateLimitError, 429),
        lambda: _status_error(anthropic.InternalServerError, 529),
        lambda: anthropic.APIConnectionError(request=httpx2.Request("POST", "https://x")),
    ],
)
def test_retryable_failures_become_upstream_errors(error):
    with pytest.raises(LLMUpstreamError):
        complete(error())


def test_client_errors_are_not_masked_as_upstream_errors():
    with pytest.raises(anthropic.BadRequestError):
        complete(_status_error(anthropic.BadRequestError, 400))


@pytest.mark.parametrize(
    ("overrides", "message"),
    [({"llm_provider": "nope", "llm_api_key": "k"}, "Unknown LLM_PROVIDER"), ({}, "LLM_API_KEY is required")],
)
def test_registry_rejects_unknown_providers_and_missing_keys(overrides, message):
    with pytest.raises(LLMConfigError, match=message):
        build_provider(Settings(_env_file=None, **overrides))


def test_registry_builds_the_configured_adapter():
    provider = build_provider(Settings(_env_file=None, llm_api_key="k", llm_model="claude-sonnet-5-5"))
    assert isinstance(provider, AnthropicProvider) and provider.model == "claude-sonnet-5-5"
    assert provider.client.timeout == REQUEST_TIMEOUT_SECONDS and provider.client.max_retries == 2


def test_only_provider_adapters_import_a_provider_sdk():
    offenders = []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text())
        modules = [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names]
        modules += [n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module]
        is_adapter = path.parent.name == "llm" and path.name.endswith("_provider.py")
        if not is_adapter and any(m.split(".")[0] in PROVIDER_SDKS for m in modules):
            offenders.append(path.relative_to(APP_DIR))
    assert offenders == []
