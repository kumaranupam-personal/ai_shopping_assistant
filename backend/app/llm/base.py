"""Provider-independent LLM interface (docs/09-llm-providers.md). Nothing here imports a provider SDK."""

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

StopReason = Literal["end_turn", "tool_use", "max_tokens", "refusal"]
REQUEST_TIMEOUT_SECONDS = 60  # per attempt; every adapter's SDK retries a failed attempt twice


def is_upstream_failure(status: int | None) -> bool:
    """Whether an HTTP status left after the SDK's retries means the provider failed (rate limit or server error),
    rather than a bad request that would fail again."""
    return status is not None and (status == 429 or status >= 500)


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
    content: str  # the tool's JSON string, or a one-line error message when is_error
    is_error: bool = False


@dataclass(frozen=True)
class Usage:
    """Token counts of one model call, in buckets that never overlap."""

    input_tokens: int = 0  # neither read from nor written to the cache
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


@dataclass(frozen=True)
class Prices:
    """USD per million tokens of each usage bucket."""

    input: float
    output: float
    cache_read: float
    cache_write: float

    def cost(self, usage: Usage) -> float:
        """The USD cost of one call's usage."""
        return (
            usage.input_tokens * self.input
            + usage.output_tokens * self.output
            + usage.cache_read_tokens * self.cache_read
            + usage.cache_write_tokens * self.cache_write
        ) / 1_000_000


@dataclass(frozen=True)
class LLMResponse:
    text: list[str]
    tool_calls: list[ToolCall]
    stop_reason: StopReason
    native_message: Any  # appended to history unchanged
    usage: Usage = field(default_factory=Usage)


class LLMProvider(Protocol):
    name: str
    model: str
    min_cache_tokens: int | None  # the smallest input the provider caches for the default model; None if best-effort
    prices: Prices | None  # the configured model's prices; None when the adapter's price table doesn't have it

    async def complete(self, system: str, history: list, tools: list[ToolSpec]) -> LLMResponse: ...

    def user_message(self, text: str) -> Any: ...

    def tool_results_message(self, results: list[ToolResult]) -> Any: ...
