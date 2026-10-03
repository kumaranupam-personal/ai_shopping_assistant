# AI Shopping Assistant

[![CI](https://github.com/kumaranupam-personal/ai_shopping_assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/kumaranupam-personal/ai_shopping_assistant/actions/workflows/ci.yml)

A conversational shopping agent. Describe what you want in plain English or Hinglish ("garam jacket chahiye, 8k tak"), and the agent searches the catalog, shows matching products as cards, and refines the results as the conversation goes on.

<!-- TODO: add a demo GIF here (the example conversation: Ladakh jacket → "only waterproof" → "compare the first two" → "aur sasta dikhao") -->

```
You:   I'm going trekking in Ladakh in December, need a jacket under 8k, size L.
Agent: [searches jackets ≤ ₹8,000, size L, "warm jacket for high-altitude winter trekking"] → shows 6 cards
You:   only waterproof ones
Agent: [repeats the search with waterproof added] → shows new cards
You:   compare the first two
Agent: [compares the first two products it showed] → summarizes the differences
You:   aur sasta dikhao
Agent: [lowers the budget below the cheapest shown] → new cards, reply in Hinglish
```

## Highlights

- **Provider-agnostic agent.** One tool-calling loop runs on Anthropic, OpenAI or Gemini, chosen by a config variable. Each provider sits behind a small adapter, and only adapters may import a provider SDK (a test enforces this).
- **Grounded by design.** The model picks *which* products to show; product cards are built on the server from catalog rows, never from model text. An eval check flags any price or product the model mentions that no tool returned.
- **Hybrid search.** SQL filters for hard constraints, then SQLite FTS5 keyword ranking and vector similarity, merged with reciprocal rank fusion and capped at 3 products per brand. About 12 ms per search over the 2,400-product demo catalog.
- **Measured, not guessed.** A 20-case eval suite scores pass rate, grounding violations, latency and prompt-cache hits for each provider. Prompt changes were tuned against it (see [Evaluation](#evaluation)).
- **Robust turns.** Each turn commits or rolls back as a unit: a provider failure, the model-call limit or a client disconnect leaves no half-finished exchange in the session.
- **Hinglish.** Users can write Hindi in Latin script; the agent maps it to catalog terms ("shaadi" → occasion `wedding`, "teen hazaar tak" → `price_max` 3000) and replies in the same language.
- **Polished, responsive UI.** React 19 + Tailwind v4, streaming over server-sent events, 320 px to 4K layouts, light and dark themes, session restore after reload, and Lighthouse-checked accessibility.

## Architecture

```mermaid
flowchart LR
    UI["React frontend<br/>chat + results"] -- "POST /api/chat<br/>(SSE stream)" --> API["FastAPI server"]
    API --> Loop["Agent turn loop"]
    Loop <--> LLM["LLM interface"]
    LLM --- A["Anthropic adapter"]
    LLM --- O["OpenAI adapter"]
    LLM --- G["Gemini adapter"]
    Loop --> Tools["Tools<br/>search · details · compare · show"]
    Tools --> Search["Hybrid search<br/>SQL filters + FTS5 + vectors (RRF)"]
    Search --> Catalog[("SQLite catalog<br/>+ embeddings")]
    Tools -- "cards from catalog rows" --> API
```

One user message is one **turn**. The loop calls the model, runs the tools it asks for (streaming a status line for each), and ends once `show_products` sends the cards and the reply. The system prompt is static so every provider can cache it, and the conversation history is cached too, so a typical search turn takes 2 model calls.

The agent has four tools:

| Tool | Purpose |
|---|---|
| `search_products` | Filters (category, budget, size, color, brand, rating, attributes) plus a semantic query |
| `get_product_details` | The full record of one product |
| `compare_products` | 2 to 4 products side by side, with the attributes that differ |
| `show_products` | Displays cards with the reply and refinement suggestions; IDs are validated against the catalog |

## Evaluation

`backend/evals/` runs 20 scored cases against the real agent and demo catalog. They cover every category, multi-turn refinements, ordinal references ("the second one", "dusra wala"), comparisons, clarifying questions, out-of-scope requests, no-result relaxation and 6 Hinglish cases. Each run records its prompt version (a hash of the prompt and tool schemas) and git commit, and results are tracked in git so runs can be compared.

Targets: pass rate ≥ 90%, 0 grounding violations, latency p50 < 8 s and p95 < 15 s, and every cacheable call reading from the prompt cache.

| Provider (model) | Baseline | Current | Grounding violations | Latency p50 / p95 |
|---|---|---|---|---|
| Anthropic (`claude-opus-5-5`) | 17/20 | **20/20** | 4 → **0** | 6.1 s / 10.1 s |
| OpenAI (`gpt-6-astra`) | 19/20 | **20/20** | 1 → **0** | 5.9 s / 9.0 s |
| Gemini (`gemini-3.8-flash`) | 19/20 | **20/20** | 0 → **0** | 3.3 s / 5.7 s |

The gains came from prompt and tool-description changes only, one change per commit, with every change rerun on all three providers: quoting amounts exactly instead of computing or rounding them, and separating filters the user stated from ones the agent inferred, so relaxation drops the inferred ones first and raises the budget by 15% at most once.

## Tech stack

- **Backend:** Python 3.12, FastAPI, Pydantic, SQLite with FTS5, `fastembed` (all-MiniLM-L6-v2, ONNX, no PyTorch), NumPy, managed with `uv`.
- **LLM SDKs:** Anthropic, OpenAI (Responses API) and Google GenAI, each used only inside its adapter.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, `lucide-react`.
- **Testing:** pytest (291 tests, no LLM calls), Playwright (layout at 8 widths in both themes, drag-resize, layout shift, session restore), Lighthouse.

## Quick start

Requires [uv](https://docs.astral.sh/uv/), Node 24 and an API key for at least one provider.

```bash
cd backend
cp .env.example .env          # set LLM_PROVIDER and its LLM_<PROVIDER>_API_KEY
uv sync
uv run python -m demo.generate                          # 2,400 synthetic products
uv run python -m app.catalog.ingest demo/products.jsonl  # build the catalog
uv run python -m app.catalog.embed                      # build the vectors
uv run python -m app                                    # API on :8000
```

```bash
cd frontend
npm install
npm run dev                   # UI on http://localhost:5173
```

Other commands:

| Command | Where | What it does |
|---|---|---|
| `uv run python -m app.cli` | `backend/` | Terminal chat, no frontend needed |
| `uv run pytest` | `backend/` | Backend tests (no API key needed) |
| `uv run python -m evals.run` | `backend/` | Eval suite against the configured provider (makes paid API calls) |
| `npm test` | `frontend/` | Playwright tests against a mocked API |
| `npm run lighthouse` | `frontend/` | Lighthouse on the production build |

## Bring your own catalog

The app serves any catalog that follows the product schema and taxonomy in [`docs/02-catalog.md`](docs/02-catalog.md). Ingestion validates every line, writes rejects with reasons, and swaps the new database in atomically, so a bad file never breaks the running catalog. The demo catalog is synthetic, generated deterministically (seed 42) with no LLM calls.

## Documentation

The full specification lives in [`docs/`](docs/00-overview.md): architecture, catalog, search, agent, API, frontend, evaluation, roadmap and LLM providers. Each fact lives in exactly one document.
