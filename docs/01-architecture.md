# Architecture

## Components

- **Frontend**: a single-page React app with a chat panel and a results panel. See `06-frontend.md`.
- **API server**: FastAPI. It exposes the endpoints in `05-api.md` and streams agent output as server-sent events.
- **Agent**: a tool-use loop that interprets each user turn and calls tools. See `04-agent.md`.
- **LLM layer**: a provider-independent interface with one adapter per provider, chosen by configuration. See `09-llm-providers.md`.
- **Search service**: an in-process Python module that combines SQL filters, keyword search and vector search. See `03-search.md`.
- **Catalog store**: a SQLite database plus a vector file, both built offline by ingesting a product file. See `02-catalog.md`.
- **Demo data generator**: a separate folder outside the runtime app that produces the demo product file. See `02-catalog.md`.

## Request flow

1. The frontend sends the user message to the chat endpoint with its session ID.
2. The API server loads the session and runs one agent turn, which alternates model calls and tool calls (see `04-agent.md`).
3. Tools query the catalog through the search service. The display tool sends product cards and the reply that comes with them to the client over the open stream, and any other model text is streamed after each model call.
4. The turn is committed to the session when it succeeds and rolled back otherwise, and the stream closes.

## Grounding principle

The model chooses which products to show and writes prose about them. It never supplies product facts for display. Product cards are built on the server from catalog rows, keyed by product ID, and every ID is validated against the catalog before it reaches the client. Any price or spec the model mentions in prose must come from a tool result in the same conversation. The eval suite checks this (see `07-evaluation.md`).

## Tech stack

- Python 3.12, managed with `uv`.
- FastAPI and Uvicorn for the API server. Server-sent events use FastAPI's built-in `StreamingResponse`, with no extra library.
- Pydantic, which FastAPI already depends on, for product validation during ingestion, and `pydantic-settings` for reading configuration.
- The Python SDK of each provider in `09-llm-providers.md`, used only inside that provider's adapter.
- SQLite from the Python standard library, with FTS5 for keyword search.
- `fastembed` with the model `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) for embeddings. It runs on ONNX Runtime, so no PyTorch install is needed. The model downloads once, on first use, into `DATA_DIR/models`.
- NumPy for vector similarity. The catalog is small enough for exact search, so no vector database is needed.
- `pytest` for tests, `httpx` for FastAPI's test client, and `pyyaml` for eval cases.
- Node 24 LTS for the frontend toolchain. The frontend libraries are listed in `06-frontend.md`.

## Repository layout

```
ai_shopping_assistant/
  .gitignore                 ignores .env, generated files and build output
  docs/                      this specification
  backend/
    pyproject.toml
    .env.example
    app/
      __main__.py            starts uvicorn using PORT
      config.py              reads configuration variables
      main.py                FastAPI app and routes
      sse.py                 event formatting
      llm/
        base.py              provider interface and shared types
        registry.py          builds the adapter named by LLM_PROVIDER
        anthropic_provider.py
        openai_provider.py
        gemini_provider.py
      agent/
        loop.py              runs one agent turn
        prompt.py            system prompt text
        tools.py             tool functions
        session.py           session store
      search/
        engine.py            search_products implementation
        index.py             loads database and vectors at startup
      catalog/
        taxonomy.py          categories, attributes and display rules
        store.py             catalog file names and read access
        cards.py             builds product cards
        ingest.py            validates a product file and writes the catalog database
        embed.py             writes the vector file
        schema.sql
      cli.py                 terminal chat for development
    demo/
      generate.py            writes demo/products.jsonl, which is git-ignored
      templates/             generator data files
    data/                    built catalog files, git-ignored
    tests/                   backend tests
    evals/
      cases.yaml
      run.py                 eval runner
      checks.py              grounding check and case expectations
      results/               eval run outputs and each provider's baseline, tracked in git
  frontend/
    package.json
    src/
    tests/                   Playwright browser tests
    scripts/                 Lighthouse check
```

## Configuration

The backend reads these environment variables, optionally from `backend/.env`. Variables set in the shell take precedence over `.env`. `backend/.env.example` lists every backend variable with its default. Every other document refers to them by name. Relative paths resolve against the `backend/` folder, whatever the current directory is.

- `LLM_PROVIDER`: which adapter to use. Default `anthropic`.
- `LLM_API_KEY`: the API key for the chosen provider. The API server, terminal chat and eval runner require it. The catalog commands and backend tests don't.
- `LLM_MODEL`: model ID for the chosen provider. Default: unset, which means the adapter's default model from `09-llm-providers.md`.
- `LLM_EFFORT`: `low`, `medium` or `high`. Default `low`.
- `LLM_MAX_TOKENS`: maximum output tokens per model call. Default `16000`.
- `DATA_DIR`: directory with built catalog files. Default `data`.
- `SESSION_TTL_MINUTES`: idle time before a session expires. Default `60`.
- `MAX_TURNS_PER_SESSION`: user messages allowed per session. Default `30`.
- `CORS_ORIGINS`: comma-separated allowed origins. Default `http://localhost:5173`.
- `PORT`: API server port. Default `8000`.

The frontend reads one variable:

- `VITE_API_BASE_URL`: API server base URL. Default `http://localhost:8000`.

## Local development

Steps 1 to 8 run inside `backend/`, and step 9 runs inside `frontend/`.

1. `uv sync` installs dependencies.
2. `uv run python -m demo.generate` writes the demo product file.
3. `uv run python -m app.catalog.ingest demo/products.jsonl` builds the catalog database.
4. `uv run python -m app.catalog.embed` builds the vector file.
5. `uv run python -m app` starts the API server on `PORT` with auto-reload.
6. `uv run python -m app.cli` starts a terminal chat that runs agent turns directly, skipping the API and frontend. It prints status lines, the title and price of each shown product, and reply text.
7. `uv run pytest` runs the backend tests.
8. `uv run python -m evals.run` runs the eval suite against the demo catalog. It calls the configured LLM provider and costs money. Case IDs as arguments run only those cases, and `--cases <path>` reads another case file.
9. `npm install && npm run dev` serves the UI on port 5173. `npm test` runs the Playwright tests, and `npm run lighthouse` builds the app and runs Lighthouse against the production build.
