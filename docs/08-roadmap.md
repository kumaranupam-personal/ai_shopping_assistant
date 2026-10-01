# Roadmap

Build the phases in order. Each phase is done only when its criteria pass.

## Phase 1: Catalog

- Build: the backend skeleton, configuration, the taxonomy, the database schema, ingestion, the embedding script and the demo data generator.
- Done when the ingestion and demo data tests from `07-evaluation.md` pass, and a manual look at 20 random products finds them plausible.

## Phase 2: Search

- Build: the search engine and index loading from `03-search.md`.
- Done when the search tests pass, the performance target is met, and 20 hand-written queries return sensible top-5 results on manual review.

## Phase 3: Agent

- Build: the LLM layer with the Anthropic adapter from `09-llm-providers.md`, plus the tools, the system prompt, the session store, the agent loop and the terminal chat (`app.cli`). The terminal chat prints status lines, shown product titles and prices, and reply text.
- Done when the LLM layer, tool and agent loop tests pass and the example conversation in `00-overview.md` works end to end in the terminal.

## Phase 4: API

- Build: the endpoints and streaming from `05-api.md`.
- Done when the API tests pass and a `curl` call to the chat endpoint streams events in the documented order.

## Phase 5: Frontend

- Build: every component and behavior in `06-frontend.md`.
- Done when the example conversation works in the browser, including clicking a suggestion chip, restoring an earlier result set, the product drawer, a new chat, restoring after a reload and the narrow layout, and every item in the quality bar of `06-frontend.md` holds.

## Phase 6: Evaluation

- Build: the eval cases and runner from `07-evaluation.md`.
- Done when every target in `07-evaluation.md` is met. If one fails, iterate on the prompt and tool descriptions before changing the search code.

## Phase 7: Second provider

- Build: a second adapter, following "Adding a provider" in `09-llm-providers.md`. OpenAI is the suggested choice.
- Done when the eval targets in `07-evaluation.md` are met with `LLM_PROVIDER` set to the new adapter, and nothing outside `app/llm/` changed apart from the docs.

## Stretch goals

These come after Phase 7 and are each specified in a new doc before being built.

- Image input: the user uploads a photo, a vision-capable model extracts the category and attributes, and the agent searches with them.
- A cart with an add-to-cart tool that requires the user to confirm in the UI.
- Personalization from seeded user profiles (preferred brands, sizes and budget).
- Streaming reply text token by token instead of one block at a time.
- Migrating the agent from the tool loop to an explicit LangGraph graph, with nodes that call the LLM layer from `09-llm-providers.md` and a checkpointer as the session store. The API contract in `05-api.md` stays unchanged, so the frontend is unaffected.
