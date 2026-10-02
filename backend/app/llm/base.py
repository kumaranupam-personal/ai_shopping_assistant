"""Provider-independent LLM interface (docs/09-llm-providers.md). Nothing here imports a provider SDK."""

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

StopReason = Literal["end_turn", "tool_use", "max_tokens", "refusal"]


class LLMUpstreamError(Exception):
    """The provider failed after the adapter's retries."""


class LLMConfigError(Exception):
    """Invalid or missing LLM configuration, raised at startup."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict  # JSON Schema in the portable subset


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass(frozen=True)
class ToolResult:
    call_id: str
    content: str  # JSON string
    is_error: bool = False


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0


@dataclass(frozen=True)
class LLMResponse:
    text: list[str]
    tool_calls: list[ToolCall]
    stop_reason: StopReason
    native_message: Any  # appended to history unchanged
    usage: Usage = field(default_factory=Usage)


class LLMProvider(Protocol):
    name: str

    async def complete(self, system: str, history: list, tools: list[ToolSpec]) -> LLMResponse: ...

    def user_message(self, text: str) -> Any: ...

    def tool_results_message(self, results: list[ToolResult]) -> Any: ...
