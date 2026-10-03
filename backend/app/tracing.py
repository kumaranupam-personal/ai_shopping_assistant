"""Turn tracing with OpenTelemetry, exported over OTLP HTTP to Langfuse (docs/10-observability.md)."""

import asyncio
import json
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from urllib.parse import unquote

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Span, Status, StatusCode

from app.config import Settings
from app.llm.base import Prices, ToolResult, Usage

OUTCOME = "langfuse.trace.metadata.outcome"
# Usage field -> Langfuse usage and cost key. The four buckets never overlap, as Langfuse requires.
USAGE_KEYS = {
    "input_tokens": "input",
    "output_tokens": "output",
    "cache_read_tokens": "cache_read_input_tokens",
    "cache_write_tokens": "cache_creation_input_tokens",
}

_tracer: trace.Tracer = trace.NoOpTracer()


@dataclass(frozen=True)
class TraceOptions:
    """What the caller of a turn adds to its trace."""

    tags: list[str]  # where the turn ran: ["api"], ["cli"] or ["eval", <case ID>]
    message_text: bool  # whether messages, replies, tool arguments and tool results are recorded


def setup_tracing(settings: Settings) -> TracerProvider | None:
    """Exports spans in the background when an endpoint is configured; otherwise spans stay no-ops. Once per process."""
    global _tracer
    if not settings.otel_exporter_otlp_endpoint:
        return None
    exporter = OTLPSpanExporter(
        endpoint=f"{settings.otel_exporter_otlp_endpoint.rstrip('/')}/v1/traces",
        headers=parse_headers(settings.otel_exporter_otlp_headers or ""),
    )
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(exporter))
    _tracer = provider.get_tracer("app")
    return provider


def shutdown_tracing(provider: TracerProvider | None) -> None:
    """Flushes the remaining spans and stops exporting."""
    global _tracer
    if provider:
        provider.shutdown()
    _tracer = trace.NoOpTracer()


def parse_headers(value: str) -> dict[str, str]:
    """`key=value` pairs separated by commas, with percent-encoded values, as OTEL_EXPORTER_OTLP_HEADERS is written."""
    pairs = (item.split("=", 1) for item in value.split(",") if "=" in item)
    return {key.strip(): unquote(header.strip()) for key, header in pairs}


@contextmanager
def span(name: str, attributes: dict, root: bool = False) -> Iterator[Span]:
    """A span under the current one. Raising inside it sets status ERROR with `cancelled` or the exception's class
    name. A turn's root span also records that as its outcome, or `done`."""
    with _tracer.start_as_current_span(name, attributes=attributes, record_exception=False, set_status_on_exception=False) as current:
        try:
            yield current
        except BaseException as e:
            failure = "cancelled" if isinstance(e, asyncio.CancelledError) else type(e).__name__
            current.set_status(Status(StatusCode.ERROR, failure))
            if root:
                current.set_attribute(OUTCOME, failure)
            raise
        if root:
            current.set_attribute(OUTCOME, "done")


def encode(value) -> str:
    """Plain strings as they are, anything else as JSON."""
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)


def text_attributes(options: TraceOptions, **values) -> dict:
    """`langfuse.observation.<name>` attributes holding conversation content, only when message text is on."""
    return {f"langfuse.observation.{name}": encode(value) for name, value in values.items()} if options.message_text else {}


def record_tool_result(span: Span, name: str, result: ToolResult, options: TraceOptions) -> None:
    """An error result sets status ERROR with its message; searches record their matches and shows their count."""
    span.set_attributes(text_attributes(options, output=result.content))
    if result.is_error:
        span.set_status(Status(StatusCode.ERROR, result.content))
    elif name == "search_products":
        span.set_attribute("langfuse.observation.metadata.total_matches", json.loads(result.content)["total_matches"])
    elif name == "show_products":
        span.set_attribute("langfuse.observation.metadata.shown", len(json.loads(result.content)["shown"]))


def usage_attributes(usage: Usage, prices: Prices | None) -> dict:
    """Token counts and, when the model has prices, their USD costs, under Langfuse's keys."""
    attributes = {"langfuse.observation.usage_details": encode({key: getattr(usage, name) for name, key in USAGE_KEYS.items()})}
    if prices:
        costs = {USAGE_KEYS[name]: cost for name, cost in prices.costs(usage).items()} | {"total": prices.cost(usage)}
        attributes["langfuse.observation.cost_details"] = encode(costs)
    return attributes
