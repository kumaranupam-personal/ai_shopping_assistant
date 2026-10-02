# Roadmap

Build the phases in order. Each phase is done only when its criteria pass.

## Delivery rules

- Work happens on the `develop` branch. Each part below is one commit, made manually after review.
- A commit changes at most 1000 lines, not counting lockfiles (`uv.lock`, `package-lock.json`).
- Every commit leaves all existing tests passing and depends on no later commit.
- Code is the minimum the spec requires. Tests are parametrized instead of repeated.
- If implementation shows a spec needs to change, the doc is updated in the same commit.

## Phase 1: Catalog

- Part 1: backend skeleton (`.gitignore`, `pyproject.toml`, `.env.example`), configuration and the taxonomy.
- Part 2: database schema, ingestion and embedding.
- Part 3: demo data generator and its templates.
- Done when the ingestion and demo data tests from `07-evaluation.md` pass, and a manual look at 20 random products finds them plausible.

## Phase 2: Search

- Part 1: index loading, filters, the sorts without a query, and warnings, from `03-search.md`.
- Part 2: keyword list, vector list, fusion and brand diversity.
- Done when the search tests pass, the performance target is met, and 20 hand-written queries return sensible top-5 results on manual review.

## Phase 3: Agent

- Part 1: the LLM layer with the Anthropic adapter, from `09-llm-providers.md`.
- Part 2: the session store and the tools.
- Part 3: the system prompt, the agent loop and the terminal chat from `01-architecture.md`.
- Done when the LLM layer, tool and agent loop tests pass and the example conversation in `00-overview.md` works end to end in the terminal.

## Phase 4: API

- Part 1: the endpoints and streaming from `05-api.md`.
- Done when the API tests pass and a `curl` call to the chat endpoint streams events in the documented order.

## Phase 5: Frontend

- Part 1: scaffold, design tokens, app shell, header and theme switch.
- Part 2: API client, stream parser, client state and session lifecycle.
- Part 3: chat panel, message list, status line and composer.
- Part 4: results panel, grid, cards, suggestion chips, results strip and results sheet.
- Part 5: product drawer and the loading, empty and error states.
- Part 6: Playwright tests with a mocked API, and Lighthouse checks.
- Done when the example conversation works in the browser, including clicking a suggestion chip, restoring an earlier result set, the product drawer, a new chat, restoring after a reload and the narrow layout, and every item in the quality bar of `06-frontend.md` holds.

## Phase 6: Faster turns and featured products

- Part 1: ending a turn right after `show_products` and the shorter-reply rule from `04-agent.md`, and history caching from `09-llm-providers.md`.
- Part 2: the featured endpoint from `05-api.md` and the featured products in `06-frontend.md`.
- Done when the tests in `07-evaluation.md` pass, the turn record (see `04-agent.md`) of a live search turn shows 2 model calls instead of 3, with the second call reading more tokens from the cache than the system prompt and tools alone, which shows the history is cached, and the featured products show on first load in both layouts.

## Phase 7: Evaluation baseline

- Part 1: the eval runner and grounding check from `07-evaluation.md`.
- Part 2: the eval cases.
- Done when the suite runs end to end on the Anthropic adapter and writes its results file, which becomes the baseline. Meeting the targets waits for Phase 9, so this phase changes no prompt or tool description.

## Phase 8: OpenAI and Gemini providers

Each part follows steps 1 and 2 of "Adding a provider" in `09-llm-providers.md`.

- Part 1: the OpenAI adapter, selected with `LLM_PROVIDER=openai`.
- Part 2: the Gemini adapter, selected with `LLM_PROVIDER=gemini`.
- Done when, for each new adapter, its tests pass, the suite runs end to end with `LLM_PROVIDER` set to it, and every case that passes on the baseline but fails on it is explained as either an adapter bug (fixed in this phase) or a model difference (left for Phase 9). Nothing changes outside `app/llm/`, its tests, the dependency files and the docs.

## Phase 9: Tuning

- Parts: prompt and tool-description tuning, one change per commit, rerunning the suite as `07-evaluation.md` requires.
- Done when every target in `07-evaluation.md` is met on all three providers, which completes step 3 of "Adding a provider" for OpenAI and Gemini. If a target fails, iterate on the prompt and tool descriptions before changing the search code.

## Stretch goals

These come after Phase 9 and are each specified in a new doc before being built.

- Image input: the user uploads a photo, a vision-capable model extracts the category and attributes, and the agent searches with them.
- A cart with an add-to-cart tool that requires the user to confirm in the UI.
- Personalization from seeded user profiles (preferred brands, sizes and budget).
- Streaming reply text token by token instead of one block at a time. Voice conversation depends on it.
- Voice conversation, in three levels, each specified before it's built:
  - Push-to-talk: recorded speech is transcribed and sent through the existing chat endpoint, and reply text is spoken. The agent, search and evals are unchanged.
  - Hands-free conversation with interruption: a WebSocket voice endpoint, streaming speech-to-text with voice activity detection, sentence-level streaming text-to-speech, and cancelling the current turn when the user starts speaking. Speech providers sit behind adapters, like the LLM layer in `09-llm-providers.md`.
  - Speech-to-speech realtime models, considered only if latency matters more than control, since they would replace the turn loop.
- Migrating the agent from the tool loop to an explicit LangGraph graph, with nodes that call the LLM layer from `09-llm-providers.md` and a checkpointer as the session store. The API contract in `05-api.md` stays unchanged, so the frontend is unaffected.
