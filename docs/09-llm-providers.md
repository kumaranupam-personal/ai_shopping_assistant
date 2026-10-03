# LLM providers

The agent is independent of any one provider. It calls the interface defined here, and `LLM_PROVIDER` (see `01-architecture.md`) chooses which adapter backs that interface. Anthropic is the first adapter.

## Boundary rules

- Only the files `app/llm/<provider>_provider.py` may import a provider SDK. A unit test enforces this by scanning imports.
- The agent loop, tools, session store, API and evals use only the types in `app/llm/base.py`.
- The system prompt and tool descriptions are shared by every provider. Adapters send them unchanged, with the tools in the same order on every call.
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
- `usage`: `input_tokens` (input neither read from nor written to the cache), `output_tokens`, `cache_read_tokens` and `cache_write_tokens` (each 0 when the provider doesn't report it). The four never overlap, so every token is counted once.
- `native_message`: the assistant message in the provider's format, which the loop appends to history unchanged.

### Prices

- `input`, `output`, `cache_read` and `cache_write`: USD per million tokens of each `usage` bucket.
- `cost(usage)`: the USD cost of one call's usage, the sum of each bucket's tokens times its price.

Each adapter holds a price table, keyed by model ID, with at least its default model. The prices are copied from the provider's pricing page. For a model priced by prompt-size tiers, the table holds the smallest tier.

### LLMProvider

A protocol with:

- `name`: the provider name used in config.
- `model`: the model ID the adapter calls, recorded in eval results.
- `min_cache_tokens`: the smallest input, in tokens, that the provider caches for the adapter's default model, as its section below states. The eval runner checks cache reads only on calls at least this large. It is unset when the provider caches on a best-effort basis, and then cache reads aren't checked.
- `prices`: the configured model's `Prices` from the adapter's price table, or unset when the table doesn't have that model.
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

- `LLM_<PROVIDER>_API_KEY` (such as `LLM_OPENAI_API_KEY`): the adapter reads only its own provider's key and passes it to the SDK explicitly. The SDK is never left to read its own provider-named variable, such as `OPENAI_API_KEY`.
- `LLM_MODEL`: used as the model ID, or the adapter's default model when unset.
- `LLM_EFFORT`: mapped to the provider's nearest control, or ignored if the provider has none.
- `LLM_MAX_TOKENS`: passed as the provider's output-token limit.

Every adapter times out each attempt after 60 seconds and retries a failed attempt twice, for rate limits, overload, connection errors and timeouts. A rate limit, server error or connection failure that remains after the retries raises `LLMUpstreamError`. Any other error, such as a bad request, passes through unchanged (see `04-agent.md` for how the turn then fails).

## Anthropic adapter

`app/llm/anthropic_provider.py`, selected with `LLM_PROVIDER=anthropic`.

- Uses the async Anthropic client and `beta.messages.create`, because the refusal fallback below is a beta feature. It doesn't use the SDK's tool runner.
- The default model is `claude-opus-5-5`.
- `LLM_EFFORT` maps to `output_config.effort` with the same value. The `thinking` parameter is omitted, so the model uses its adaptive default.
- Tool choice is `auto`.
- The system prompt goes in one text block marked with `cache_control` `{"type": "ephemeral"}`. The last content block of the last history message gets the same marker, so each call reads the earlier conversation from the cache. The marker goes on a copy of that message, so the stored history is unchanged, and a string content becomes a single text block in the copy. Inputs under 512 tokens aren't cached. Anthropic reports cache reads and cache writes separately from `input_tokens`, as `cache_read_input_tokens` and `cache_creation_input_tokens`, and they become `cache_read_tokens` and `cache_write_tokens`.
- Consecutive user messages, such as a tool-results message followed by the next user message, are sent as they are, because the API combines consecutive messages from the same role.
- `native_message` is the full assistant content, including thinking and tool-use blocks, as returned. The one exception is a response in which the refusal fallback below switched models: the switch markers are dropped, and of the blocks before the last switch only the text blocks are kept, because only the final model's other blocks can be sent back. `text` holds only the text blocks.
- Stop reasons `end_turn`, `tool_use`, `max_tokens` and `refusal` map to the same names. Any other stop reason maps to `end_turn`.
- `tool_results_message` puts every `tool_result` block for a turn into a single user message.
- Refusal fallback is on: requests send `fallbacks: "default"` with the beta header `server-side-fallback-2026-07-01`, so a declined request is retried on a fallback model server-side. If the final response still has stop reason `refusal`, the adapter reports `refusal`.
- Retries are the SDK's built-in ones.

## OpenAI adapter

`app/llm/openai_provider.py`, selected with `LLM_PROVIDER=openai`.

- Uses the async OpenAI client and the Responses API (`responses.create`), statelessly: `store` is false and `include` asks for `reasoning.encrypted_content`, so reasoning comes back encrypted and is sent with the next call. It doesn't use `previous_response_id` or conversations, because the session keeps the history.
- The default model is `gpt-6-astra`.
- `LLM_EFFORT` maps to `reasoning.effort` with the same value, and `LLM_MAX_TOKENS` to `max_output_tokens`.
- The system prompt goes in `instructions`. Tools are function tools with `strict` false, because strict mode requires every property to be required. Tool choice is `auto`.
- Caching is automatic for the shared prefix, so no cache parameters are sent, and inputs under 1,024 tokens aren't cached. OpenAI counts cache reads and cache writes inside `input_tokens`, so the adapter subtracts `input_tokens_details.cached_tokens` and `input_tokens_details.cache_write_tokens` and reports them as `cache_read_tokens` and `cache_write_tokens`.
- A user message is one input item. `native_message` is the list of a response's output items (reasoning, messages and function calls), and `tool_results_message` returns a list of `function_call_output` items. Each call flattens the history into one list of items, in which tool results followed by a user message are valid as they are.
- `function_call_output` has no error flag, so an error result is sent as its message text. Function-call arguments that aren't a JSON object become empty arguments, so the tool fails with an error result the model can correct.
- Stop reasons: a refusal content part, or an incomplete response with reason `content_filter`, maps to `refusal`. An incomplete response with reason `max_output_tokens` maps to `max_tokens`. Otherwise, function calls map to `tool_use` and anything else to `end_turn`. There is no refusal fallback.
- Retries are the SDK's built-in ones.

## Gemini adapter

`app/llm/gemini_provider.py`, selected with `LLM_PROVIDER=gemini`.

- Uses the async Google GenAI client with the Gemini Developer API (`vertexai` off) and `models.generate_content`, sending the whole history on each call. It doesn't use the newer Interactions API, because this SDK version exposes that API's errors only through private modules.
- The default model is `gemini-3.8-flash`.
- `LLM_EFFORT` maps to `thinking_config.thinking_level` with the same value, and `LLM_MAX_TOKENS` to `max_output_tokens`.
- The system prompt goes in `system_instruction`. Each ToolSpec becomes a function declaration whose `parameters_json_schema` is the schema unchanged. Function calling mode is `AUTO`, and the SDK's automatic function calling is off, because the agent loop runs the tools.
- Caching is implicit, so no cache parameters are sent. Inputs under 4,096 tokens aren't cached, which covers a conversation's first turns, and Google doesn't guarantee a hit above that, so `min_cache_tokens` is unset and the eval runner doesn't check Gemini's cache reads. Gemini counts cached tokens inside `prompt_token_count`, so the adapter subtracts `cached_content_token_count` and reports it as `cache_read_tokens`. Implicit caching has no write charge, so `cache_write_tokens` is 0. Output tokens include thinking tokens, as with the other providers.
- A user message is one `user` content with a text part. `native_message` is the response's content (role `model`) unchanged, so thought signatures reach the next call. A response with no content, such as a blocked prompt, is stored as nothing and skipped. `tool_results_message` returns one `user` content with a function response per result. Each call merges adjacent contents from the same role, so tool results followed by the next user message form one user turn.
- A function response must carry the function's name, which ToolResult doesn't hold, so the adapter's call IDs are `<function name>|<Gemini's call ID>` and it splits them back. The ID part is empty when Gemini gives none. The response object holds the tool's JSON under `output`, or the error message under `error`.
- Stop reasons: a blocked prompt, or a finish reason of `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII` or an image safety reason, maps to `refusal`. `MAX_TOKENS` maps to `max_tokens`. Otherwise, function calls map to `tool_use` and anything else to `end_turn`. There is no refusal fallback.
- This SDK retries only when configured, so the adapter configures 3 attempts: the original request plus the 2 retries.

## Adding a provider

1. Add `app/llm/<provider>_provider.py` implementing the protocol, and register it.
2. Document its section in this file: default model, effort mapping, caching approach and minimum cacheable input, message format notes and refusal mapping. Give the adapter its price table (see Prices).
3. Pass the adapter tests and the eval targets in `07-evaluation.md` with `LLM_PROVIDER` set to it.
