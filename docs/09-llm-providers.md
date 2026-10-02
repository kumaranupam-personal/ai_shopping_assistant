# LLM providers

The agent is independent of any one provider. It calls the interface defined here, and `LLM_PROVIDER` (see `01-architecture.md`) chooses which adapter backs that interface. Anthropic is the first adapter.

## Boundary rules

- Only the files `app/llm/<provider>_provider.py` may import a provider SDK. A unit test enforces this by scanning imports.
- The agent loop, tools, session store, API and evals use only the types in `app/llm/base.py`.
- The system prompt and tool descriptions are shared by every provider. Adapters send them unchanged.
- Conversation history is stored in the provider's native message format and treated as opaque outside the adapter. Native format keeps reasoning blocks and tool-call IDs intact, which some providers require to be sent back unchanged. Because of this, a session is bound to the provider that created it.

## Interface

`app/llm/base.py` defines these types.

### ToolSpec

- `name`, `description` and `parameters`, where `parameters` is a JSON Schema object.
- Schemas use only this portable subset: `type` (object, string, integer, number, boolean, array), `properties`, `required`, `items`, `enum`, `minimum`, `maximum`, `minItems`, `maxItems`, `maxLength`, `description`, and `additionalProperties: false` on every object. No `$ref`, `oneOf`, `anyOf` or formats.

### ToolCall

- `id`: the provider's call ID.
- `name`: the tool name.
- `arguments`: a dict parsed from the provider's output.

### ToolResult

- `call_id`, `content` and `is_error` (boolean). `content` is the tool's JSON string, or a one-line error message when `is_error` is true, so adapters must not assume it parses as JSON.

### LLMResponse

- `text`: the reply text parts, in order.
- `tool_calls`: a list of ToolCall.
- `stop_reason`: one of `end_turn`, `tool_use`, `max_tokens` or `refusal`.
- `usage`: `input_tokens` (input not read from the cache), `output_tokens` and `cache_read_tokens` (0 when the provider doesn't report it).
- `native_message`: the assistant message in the provider's format, which the loop appends to history unchanged.

### LLMProvider

A protocol with:

- `name`: the provider name used in config.
- `model`: the model ID the adapter calls, recorded in eval results.
- `async complete(system, history, tools) -> LLMResponse`: one model call. Model, effort and max tokens come from config, which the adapter reads at construction.
- `user_message(text)`: returns a native user message.
- `tool_results_message(results)`: returns one native message carrying all results from a single assistant turn, in call order.

A history can hold a tool-results message followed directly by a user message, when a turn ended right after `show_products` (see `04-agent.md`). Every adapter sends such a history in a form its provider accepts.

### Errors

- `LLMUpstreamError`: the provider failed after the adapter's retries.
- `LLMConfigError`: invalid or missing configuration, raised at startup.

## Registry

`app/llm/registry.py` maps each `LLM_PROVIDER` value to an adapter class and builds the adapter once at startup. An unknown name, or a missing credential for the chosen provider, stops startup with `LLMConfigError`.

## Shared settings

Each adapter interprets the `LLM_` variables from `01-architecture.md` this way:

- `LLM_API_KEY`: passed to the provider SDK explicitly. The SDK is never left to read its own provider-named variable.
- `LLM_MODEL`: used as the model ID, or the adapter's default model when unset.
- `LLM_EFFORT`: mapped to the provider's nearest control, or ignored if the provider has none.
- `LLM_MAX_TOKENS`: passed as the provider's output-token limit.

## Anthropic adapter

`app/llm/anthropic_provider.py`, selected with `LLM_PROVIDER=anthropic`.

- Uses the async Anthropic client and `beta.messages.create`, because the refusal fallback below is a beta feature. It doesn't use the SDK's tool runner.
- The default model is `claude-opus-5-5`.
- `LLM_EFFORT` maps to `output_config.effort` with the same value. The `thinking` parameter is omitted, so the model uses its adaptive default.
- Tool choice is `auto`, and tools are sent in the same order on every call.
- The system prompt goes in one text block marked with `cache_control` `{"type": "ephemeral"}`. The last content block of the last history message gets the same marker, so each call reads the earlier conversation from the cache. The marker goes on a copy of that message, so the stored history is unchanged, and a string content becomes a single text block in the copy.
- Consecutive user messages, such as a tool-results message followed by the next user message, are sent as they are, because the API combines consecutive messages from the same role.
- `native_message` is the full assistant content, including thinking and tool-use blocks, as returned. The one exception is a response in which the refusal fallback below switched models: the switch markers are dropped, and of the blocks before the last switch only the text blocks are kept, because only the final model's other blocks can be sent back. `text` holds only the text blocks.
- Stop reasons `end_turn`, `tool_use`, `max_tokens` and `refusal` map to the same names. Any other stop reason maps to `end_turn`.
- `tool_results_message` puts every `tool_result` block for a turn into a single user message.
- Refusal fallback is on: requests send `fallbacks: "default"` with the beta header `server-side-fallback-2026-07-01`, so a declined request is retried on a fallback model server-side. If the final response still has stop reason `refusal`, the adapter reports `refusal`.
- Each attempt times out after 60 seconds. Retries rely on the SDK's built-in retry (2 retries) for rate limits, overload, connection errors and timeouts. Once retries run out, the adapter raises `LLMUpstreamError`.

## OpenAI adapter

`app/llm/openai_provider.py`, selected with `LLM_PROVIDER=openai`.

- Uses the async OpenAI client and the Responses API (`responses.create`), statelessly: `store` is false and `include` asks for `reasoning.encrypted_content`, so reasoning comes back encrypted and is sent with the next call. It doesn't use `previous_response_id` or conversations, because the session keeps the history.
- The default model is `gpt-6-astra`.
- `LLM_EFFORT` maps to `reasoning.effort` with the same value, and `LLM_MAX_TOKENS` to `max_output_tokens`.
- The system prompt goes in `instructions`. Tools are function tools with `strict` false, because strict mode requires every property to be required. Tool choice is `auto`, and tools are sent in the same order on every call.
- Caching is automatic for the shared prefix, so no cache parameters are sent. OpenAI counts cached tokens inside `input_tokens`, so the adapter subtracts `cached_tokens` and reports it as `cache_read_tokens`.
- A user message is one input item. `native_message` is the list of a response's output items (reasoning, messages and function calls), and `tool_results_message` returns a list of `function_call_output` items. Each call flattens the history into one list of items, in which tool results followed by a user message are valid as they are.
- `function_call_output` has no error flag, so an error result is sent as its message text. Function-call arguments that aren't a JSON object become empty arguments, so the tool fails with an error result the model can correct.
- Stop reasons: a refusal content part, or an incomplete response with reason `content_filter`, maps to `refusal`. An incomplete response with reason `max_output_tokens` maps to `max_tokens`. Otherwise, function calls map to `tool_use` and anything else to `end_turn`. There is no refusal fallback.
- Timeouts, retries and `LLMUpstreamError` follow the Anthropic adapter: 60 seconds per attempt and the SDK's 2 built-in retries.

## Adding a provider

1. Add `app/llm/<provider>_provider.py` implementing the protocol, and register it.
2. Document its section in this file: default model, effort mapping, caching approach, message format notes and refusal mapping.
3. Pass the adapter tests and the eval targets in `07-evaluation.md` with `LLM_PROVIDER` set to it.
