# Observability

Every agent turn is traced with OpenTelemetry and exported to Langfuse Cloud. The code uses only the OpenTelemetry SDK, its OTLP HTTP exporter and span attributes, and never imports a Langfuse SDK.

## Scope

- Every turn is traced, wherever it runs (API, terminal chat, eval runner), including failed and cancelled turns. There is no sampling.
- Nothing else is traced: no other HTTP request, status event, stream or session-store operation adds a span. There are no metric or log exports.

## Trace shape

One turn is one trace. `run_turn` (see `04-agent.md`) creates the root span, and a child span for each model call and each tool call, in call order:

```
turn
├── model call        (generation)
├── search_products   (tool)
├── model call        (generation)
└── show_products     (tool)
```

Span durations are the latencies.

### Root span

| Attribute | Value |
|---|---|
| span name and `langfuse.trace.name` | `turn` |
| `langfuse.session.id` | the session ID |
| `langfuse.trace.tags` | `["api"]`, `["cli"]`, or `["eval", <case ID>]`, passed by the caller of `run_turn`, followed by the provider's `name`, such as `["eval", "jackets-ladakh", "gemini"]` |
| `langfuse.version` | the prompt version from `07-evaluation.md` |
| `langfuse.trace.metadata.turn` | the session's `turn_count` plus one, taken when the turn starts |
| `langfuse.trace.metadata.provider` | the provider's `name` |
| `langfuse.trace.metadata.outcome` | `done`, `cancelled`, or the class name of the exception that failed the turn |
| `langfuse.observation.input` | the user message, only with message text on |
| `langfuse.observation.output` | the texts of the turn's `text` events, joined by newlines, only with message text on |

When the outcome isn't `done`, the span's status is `ERROR` with the outcome as its message.

### Model call spans

| Attribute | Value |
|---|---|
| span name | `model call` |
| `langfuse.observation.type` | `generation` |
| `gen_ai.request.model` | the provider's `model` |
| `langfuse.observation.usage_details` | `{"input": input_tokens, "output": output_tokens, "cache_read_input_tokens": cache_read_tokens, "cache_creation_input_tokens": cache_write_tokens}` from the response's `usage` (see `09-llm-providers.md`) |
| `langfuse.observation.cost_details` | the same four keys, each the bucket's USD cost, plus `total` (see Cost) |
| `langfuse.observation.metadata.stop_reason` | the response's `stop_reason` |
| `langfuse.observation.output` | the response's text parts and tool calls (names and arguments), only with message text on |

The request (the history) is never sent. A call that raises sets status `ERROR` with `cancelled` or the exception's class name, as the root span does.

### Tool spans

| Attribute | Value |
|---|---|
| span name | the tool name |
| `langfuse.observation.type` | `tool` |
| `langfuse.observation.metadata.total_matches` | `search_products` only: the result's `total_matches` |
| `langfuse.observation.metadata.shown` | `show_products` only: the number of products shown |
| `langfuse.observation.input` | the call's arguments, only with message text on |
| `langfuse.observation.output` | the result's content, only with message text on |

An error result (see `04-agent.md`, Error handling) sets status `ERROR` with the result's message.

### Encoding

`langfuse.trace.tags` is a string array. `usage_details`, `cost_details`, and inputs and outputs that aren't plain strings are JSON-encoded strings.

## Message text

For the API and the terminal chat, `TRACE_MESSAGE_TEXT` (see `01-architecture.md`) controls every attribute marked "only with message text on" above. When it's off, those attributes are left out, so no message, reply, tool argument or tool result leaves the server. The eval runner always has message text on, because its messages are the eval cases.

## Cost

Costs come from `provider.prices` (see `09-llm-providers.md`, Prices): the buckets are `prices.costs(usage)` and `total` is `prices.cost(usage)`, so Langfuse shows the same cost as the eval results. When `provider.prices` is unset, `cost_details` is left out.

## Export

- `app/tracing.py` sets up, once per process, a tracer provider with a batch span processor and the OTLP HTTP exporter. It passes the settings to the exporter explicitly: `OTEL_EXPORTER_OTLP_ENDPOINT` with `/v1/traces` appended, because an explicit endpoint gets no path added, and `OTEL_EXPORTER_OTLP_HEADERS` split into `key=value` pairs with percent-encoded values decoded. Langfuse doesn't accept OTLP over gRPC.
- For Langfuse Cloud, the endpoint is the project region's host followed by `/api/public/otel`, such as `https://cloud.langfuse.com/api/public/otel`. The headers are `Authorization=Basic <base64 of public key:secret key>,x-langfuse-ingestion-version=4`.
- When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, nothing is set up and OpenTelemetry's no-op tracer is used.
- Export happens in the background. A failed export drops its spans, and no tracing error ever reaches the turn.
- The API, the terminal chat and the eval runner shut the tracer provider down before they exit, which flushes it.
