import ast
import asyncio
import copy
from pathlib import Path

import anthropic
import httpx
import httpx2
import openai
import pytest
from anthropic.types.beta import BetaMessage
from google.genai import errors as genai_errors
from google.genai import types as genai
from openai.types.responses import Response

from app.config import Settings
from app.llm.anthropic_provider import FALLBACK_BETA, AnthropicProvider
from app.llm.gemini_provider import HTTP_OPTIONS, GeminiProvider
from app.llm.openai_provider import OpenAIProvider
from app.llm.base import REQUEST_TIMEOUT_SECONDS, LLMConfigError, LLMUpstreamError, ToolCall, ToolResult, ToolSpec, Usage, is_upstream_failure
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
    """Mimics `client.beta.messages.create` and `client.responses.create`: records the request and returns a prepared
    response or raises a prepared error."""

    def __init__(self, result):
        self.result, self.request = result, None
        self.beta = self.messages = self.responses = self.aio = self.models = self

    async def generate_content(self, **request):  # the Gemini client's call
        return await self.create(**request)

    async def create(self, **request):
        self.request = request
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def complete(result, history=None, adapter=AnthropicProvider):
    client = StubClient(result)
    settings = Settings(_env_file=None, llm_api_key="test-key", llm_effort="medium", llm_max_tokens=4000)
    response = asyncio.run(adapter(settings, client).complete("You help shoppers.", history or [], [TOOL]))
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


def _gemini_error(code):
    return (genai_errors.ClientError if code < 500 else genai_errors.ServerError)(code, {"error": {"code": code, "message": "failed"}})


# (adapter, error factory) per provider: rate limit, overload or server error, and a dropped connection.
RETRYABLE = [
    *[(adapter, factory) for sdk, adapter in [(anthropic, AnthropicProvider), (openai, OpenAIProvider)] for factory in (
        lambda sdk=sdk: _status_error(sdk.RateLimitError, 429),
        lambda sdk=sdk: _status_error(sdk.InternalServerError, 529),
        lambda sdk=sdk: sdk.APIConnectionError(request=httpx2.Request("POST", "https://x")),
    )],
    (GeminiProvider, lambda: _gemini_error(429)),
    (GeminiProvider, lambda: _gemini_error(503)),
    (GeminiProvider, lambda: httpx.ConnectError("down")),
]
CLIENT_ERRORS = [
    (AnthropicProvider, lambda: _status_error(anthropic.BadRequestError, 400), anthropic.BadRequestError),
    (OpenAIProvider, lambda: _status_error(openai.BadRequestError, 400), openai.BadRequestError),
    (GeminiProvider, lambda: _gemini_error(400), genai_errors.ClientError),
]


@pytest.mark.parametrize(("adapter", "error"), RETRYABLE)
def test_retryable_failures_become_upstream_errors(adapter, error):
    with pytest.raises(LLMUpstreamError):
        complete(error(), adapter=adapter)


@pytest.mark.parametrize(("adapter", "error", "raised"), CLIENT_ERRORS)
def test_client_errors_are_not_masked_as_upstream_errors(adapter, error, raised):
    with pytest.raises(raised):
        complete(error(), adapter=adapter)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [({"llm_provider": "nope", "llm_api_key": "k"}, "Unknown LLM_PROVIDER"), ({}, "LLM_API_KEY is required")],
)
def test_registry_rejects_unknown_providers_and_missing_keys(overrides, message):
    with pytest.raises(LLMConfigError, match=message):
        build_provider(Settings(_env_file=None, **overrides))


@pytest.mark.parametrize(
    ("name", "adapter", "default_model"),
    [("anthropic", AnthropicProvider, "claude-opus-5-5"), ("openai", OpenAIProvider, "gpt-6-astra"), ("gemini", GeminiProvider, "gemini-3.8-flash")],
)
def test_registry_builds_the_configured_adapter(name, adapter, default_model):
    provider = build_provider(Settings(_env_file=None, llm_provider=name, llm_api_key="k"))
    assert isinstance(provider, adapter) and provider.name == name and provider.model == default_model
    assert build_provider(Settings(_env_file=None, llm_provider=name, llm_api_key="k", llm_model="other")).model == "other"


@pytest.mark.parametrize("adapter", [AnthropicProvider, OpenAIProvider])
def test_sdk_clients_time_out_after_60_seconds_and_retry_twice(adapter):
    client = adapter(Settings(_env_file=None, llm_api_key="k")).client
    assert client.timeout == REQUEST_TIMEOUT_SECONDS and client.max_retries == 2


def test_gemini_client_times_out_after_60_seconds_and_retries_twice():
    assert HTTP_OPTIONS.timeout == REQUEST_TIMEOUT_SECONDS * 1000 and HTTP_OPTIONS.retry_options.attempts == 3


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


def openai_response(output, incomplete=None, cached=4000):
    return Response.model_validate({
        "id": "resp_1", "created_at": 0, "model": "gpt-6-astra", "object": "response", "parallel_tool_calls": True,
        "tool_choice": "auto", "tools": [], "output": output,
        "incomplete_details": {"reason": incomplete} if incomplete else None,
        "usage": {"input_tokens": 5000, "input_tokens_details": {"cached_tokens": cached, "cache_write_tokens": 0},
                  "output_tokens": 30, "output_tokens_details": {"reasoning_tokens": 10}, "total_tokens": 5030},
    })


def text_item(*parts):
    return {"type": "message", "id": "msg_1", "role": "assistant", "status": "completed", "content": list(parts)}


OUTPUT_TEXT = {"type": "output_text", "text": "Searching now.", "annotations": []}
REASONING = {"type": "reasoning", "id": "rs_1", "summary": [], "encrypted_content": "enc"}
CALL = {"type": "function_call", "id": "fc_1", "call_id": "call_1", "name": "search_products", "arguments": '{"query": "warm jacket"}'}


def test_openai_request_is_stateless_with_flattened_history():
    tool_turn = openai_response([REASONING, CALL]).output  # one response's output items, as one history entry
    results = [{"type": "function_call_output", "call_id": "call_1", "output": "{}"}]
    history = [{"role": "user", "content": "hello"}, tool_turn, results, {"role": "user", "content": "thanks"}]
    _, request = complete(openai_response([text_item(OUTPUT_TEXT)]), history=history, adapter=OpenAIProvider)
    assert request["model"] == "gpt-6-astra" and request["instructions"] == "You help shoppers."
    assert request["reasoning"] == {"effort": "medium"} and request["max_output_tokens"] == 4000
    assert request["tools"] == [{"type": "function", "name": TOOL.name, "description": TOOL.description, "parameters": TOOL.parameters, "strict": False}]
    assert request["tool_choice"] == "auto" and request["store"] is False and request["include"] == ["reasoning.encrypted_content"]
    # Each history entry is one item or a list of items; the API gets them as one flat list, in order.
    assert request["input"] == [history[0], *tool_turn, *results, history[3]]


def test_openai_response_is_parsed_into_llm_response():
    response, _ = complete(openai_response([REASONING, text_item(OUTPUT_TEXT), CALL]), adapter=OpenAIProvider)
    assert response.text == ["Searching now."] and response.stop_reason == "tool_use"
    assert response.tool_calls == [ToolCall("call_1", "search_products", {"query": "warm jacket"})]
    assert response.usage == Usage(1000, 30, 4000)  # cached tokens are taken out of input_tokens
    # Every output item, reasoning included, goes back unchanged on the next call.
    assert [item.type for item in response.native_message] == ["reasoning", "message", "function_call"]


@pytest.mark.parametrize(
    ("output", "incomplete", "expected"),
    [
        ([text_item(OUTPUT_TEXT)], None, "end_turn"),
        ([text_item(OUTPUT_TEXT), CALL], "max_output_tokens", "max_tokens"),
        ([text_item({"type": "refusal", "refusal": "I can't help with that."})], None, "refusal"),
        ([text_item(OUTPUT_TEXT)], "content_filter", "refusal"),
    ],
)
def test_openai_stop_reasons_map_to_neutral_names(output, incomplete, expected):
    response, _ = complete(openai_response(output, incomplete), adapter=OpenAIProvider)
    assert response.stop_reason == expected


def test_openai_malformed_arguments_become_empty():
    response, _ = complete(openai_response([{**CALL, "arguments": "{not json"}]), adapter=OpenAIProvider)
    assert response.tool_calls == [ToolCall("call_1", "search_products", {})]


def test_openai_messages_are_built_in_responses_format():
    provider = OpenAIProvider(Settings(_env_file=None, llm_api_key="k"), StubClient(None))
    assert provider.user_message("hi") == {"role": "user", "content": "hi"}
    results = [ToolResult("call_1", '{"ok": true}'), ToolResult("call_2", "ValueError: boom", is_error=True)]
    assert provider.tool_results_message(results) == [
        {"type": "function_call_output", "call_id": "call_1", "output": '{"ok": true}'},
        {"type": "function_call_output", "call_id": "call_2", "output": "ValueError: boom"},  # no error flag in the API
    ]


def gemini_response(*parts, finish="STOP", cached=4000, blocked=False):
    return genai.GenerateContentResponse(
        candidates=[] if blocked else [genai.Candidate(content=genai.Content(role="model", parts=list(parts)), finish_reason=finish)],
        prompt_feedback=genai.GenerateContentResponsePromptFeedback(block_reason="SAFETY") if blocked else None,
        usage_metadata=genai.GenerateContentResponseUsageMetadata(
            prompt_token_count=5000, cached_content_token_count=cached, candidates_token_count=30, thoughts_token_count=10,
        ),
    )


THOUGHT = genai.Part(text="Let me think.", thought=True, thought_signature=b"sig")
SEARCHING = genai.Part(text="Searching now.")
FUNCTION_CALL = genai.Part(function_call=genai.FunctionCall(id="fc_1", name="search_products", args={"query": "warm jacket"}))


def test_gemini_request_carries_settings_and_merges_adjacent_user_turns():
    provider = GeminiProvider(Settings(_env_file=None, llm_api_key="k"), StubClient(None))
    results = provider.tool_results_message([ToolResult("search_products|fc_1", "{}")])
    history = [provider.user_message("hello"), gemini_response(FUNCTION_CALL).candidates[0].content, results, provider.user_message("thanks")]
    _, request = complete(gemini_response(SEARCHING), history=history, adapter=GeminiProvider)
    config = request["config"]
    assert request["model"] == "gemini-3.8-flash" and config.system_instruction == "You help shoppers."
    assert config.thinking_config.thinking_level == "MEDIUM" and config.max_output_tokens == 4000
    [declaration] = config.tools[0].function_declarations
    assert (declaration.name, declaration.description, declaration.parameters_json_schema) == (TOOL.name, TOOL.description, TOOL.parameters)
    assert config.tool_config.function_calling_config.mode == "AUTO" and config.automatic_function_calling.disable
    # The tool results and the next user message become one user turn; the stored history is unchanged.
    assert [c.role for c in request["contents"]] == ["user", "model", "user"]
    assert request["contents"][2].parts == [*results.parts, *history[3].parts] and len(history[2].parts) == 1


def test_gemini_response_is_parsed_into_llm_response():
    response, _ = complete(gemini_response(THOUGHT, SEARCHING, FUNCTION_CALL), adapter=GeminiProvider)
    assert response.text == ["Searching now."] and response.stop_reason == "tool_use"  # thoughts aren't reply text
    assert response.tool_calls == [ToolCall("search_products|fc_1", "search_products", {"query": "warm jacket"})]
    assert response.usage == Usage(1000, 40, 4000)  # cached tokens out of the prompt; thinking counts as output
    # The whole content goes back unchanged, so the thought signature reaches the next call.
    assert response.native_message.parts[0].thought_signature == b"sig"


@pytest.mark.parametrize(
    ("response", "expected"),
    [
        (gemini_response(SEARCHING), "end_turn"),
        (gemini_response(SEARCHING, finish="MAX_TOKENS"), "max_tokens"),
        (gemini_response(SEARCHING, finish="SAFETY"), "refusal"),
        (gemini_response(blocked=True), "refusal"),
    ],
)
def test_gemini_stop_reasons_map_to_neutral_names(response, expected):
    parsed, _ = complete(response, adapter=GeminiProvider)
    assert parsed.stop_reason == expected


def test_gemini_tool_results_carry_the_function_name_and_wrap_errors():
    provider = GeminiProvider(Settings(_env_file=None, llm_api_key="k"), StubClient(None))
    message = provider.tool_results_message([ToolResult("search_products|fc_1", '{"ok": true}'), ToolResult("compare_products|", "ValueError: boom", is_error=True)])
    responses = [part.function_response for part in message.parts]
    assert message.role == "user"
    assert [(r.id, r.name, r.response) for r in responses] == [
        ("fc_1", "search_products", {"output": {"ok": True}}),
        (None, "compare_products", {"error": "ValueError: boom"}),  # Gemini gave no call ID
    ]


@pytest.mark.parametrize(("status", "upstream"), [(429, True), (500, True), (529, True), (400, False), (401, False), (None, False)])
def test_only_rate_limits_and_server_errors_are_upstream_failures(status, upstream):
    assert is_upstream_failure(status) is upstream  # None: an error without a status is never treated as upstream
