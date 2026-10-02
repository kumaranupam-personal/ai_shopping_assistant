"""Gemini adapter (docs/09-llm-providers.md, Gemini adapter). The only module that imports the Google GenAI SDK."""

import json

import httpx
from google import genai
from google.genai import errors, types

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

try:  # the SDK uses httpx2 when it's installed, as it is today through the other SDKs, and httpx otherwise
    import httpx2

    TRANSPORT_ERRORS: tuple[type[Exception], ...] = (httpx.TransportError, httpx2.TransportError)
except ImportError:
    TRANSPORT_ERRORS = (httpx.TransportError,)

DEFAULT_MODEL = "gemini-3.8-flash"
HTTP_OPTIONS = types.HttpOptions(
    timeout=REQUEST_TIMEOUT_SECONDS * 1000,  # milliseconds, per attempt
    retry_options=types.HttpRetryOptions(attempts=3),  # the original request plus 2 retries, like the other adapters
)
# Finish reasons that mean the model declined or was stopped for safety.
REFUSALS = {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"}
CALL_ID_SEPARATOR = "|"  # a call ID is "<function name>|<Gemini's call ID>", because function responses need the name


def merge_turns(history: list) -> list[types.Content]:
    """Copies of the history in which adjacent contents from the same role are merged, so tool results followed by the
    next user message form one user turn. A response that produced no content is stored as None and skipped."""
    contents: list[types.Content] = []
    for content in history:
        if content is None:
            continue
        if contents and contents[-1].role == content.role:
            contents[-1] = types.Content(role=content.role, parts=[*contents[-1].parts, *content.parts])
        else:
            contents.append(content)
    return contents


class GeminiProvider:
    name = "gemini"
    min_cache_tokens = None  # implicit caching from 4,096 tokens is best-effort, so the evals don't check it

    def __init__(self, settings: Settings, client: genai.Client | None = None):
        # The key is passed explicitly so the SDK never reads GOOGLE_API_KEY or GEMINI_API_KEY on its own.
        self.client = client or genai.Client(api_key=settings.llm_api_key, vertexai=False, http_options=HTTP_OPTIONS)
        self.model = settings.llm_model or DEFAULT_MODEL
        self.effort = settings.llm_effort
        self.max_tokens = settings.llm_max_tokens

    async def complete(self, system: str, history: list, tools: list[ToolSpec]) -> LLMResponse:
        config = types.GenerateContentConfig(
            system_instruction=system,
            tools=[types.Tool(function_declarations=[
                types.FunctionDeclaration(name=t.name, description=t.description, parameters_json_schema=t.parameters)
                for t in tools
            ])],
            tool_config=types.ToolConfig(function_calling_config=types.FunctionCallingConfig(mode="AUTO")),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),  # the agent loop runs tools
            thinking_config=types.ThinkingConfig(thinking_level=self.effort.upper()),
            max_output_tokens=self.max_tokens,
        )
        try:
            response = await self.client.aio.models.generate_content(model=self.model, contents=merge_turns(history), config=config)
        except TRANSPORT_ERRORS as e:  # timeouts and connection failures, after retries
            raise LLMUpstreamError(str(e)) from e
        except errors.APIError as e:
            if is_upstream_failure(e.code):
                raise LLMUpstreamError(str(e)) from e
            raise

        candidate = response.candidates[0] if response.candidates else None
        content = candidate.content if candidate and candidate.content and candidate.content.parts else None
        parts = content.parts if content else []
        text = [part.text for part in parts if part.text and not part.thought]
        tool_calls = [
            ToolCall(f"{part.function_call.name}{CALL_ID_SEPARATOR}{part.function_call.id or ''}", part.function_call.name, part.function_call.args or {})
            for part in parts
            if part.function_call
        ]
        finish = candidate.finish_reason if candidate and candidate.finish_reason else None
        blocked = response.prompt_feedback and response.prompt_feedback.block_reason
        stop_reason: StopReason = (
            "refusal" if blocked or finish in REFUSALS
            else "max_tokens" if finish == "MAX_TOKENS"
            else "tool_use" if tool_calls
            else "end_turn"
        )
        usage = Usage()
        if meta := response.usage_metadata:
            cached = meta.cached_content_token_count or 0
            # Gemini counts cached tokens inside prompt_token_count; the neutral Usage counts only uncached input.
            usage = Usage((meta.prompt_token_count or 0) - cached, (meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0), cached)
        # The content goes back unchanged, so thought signatures reach the next call.
        return LLMResponse(text, tool_calls, stop_reason, native_message=content, usage=usage)

    def user_message(self, text: str) -> types.Content:
        return types.Content(role="user", parts=[types.Part(text=text)])

    def tool_results_message(self, results: list[ToolResult]) -> types.Content:
        parts = []
        for r in results:
            name, call_id = r.call_id.split(CALL_ID_SEPARATOR, 1)
            # A function response must be an object: the tool's JSON under "output", or the error message under "error".
            response = {"error": r.content} if r.is_error else {"output": json.loads(r.content)}
            parts.append(types.Part(function_response=types.FunctionResponse(id=call_id or None, name=name, response=response)))
        return types.Content(role="user", parts=parts)
