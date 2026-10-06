# syntax=docker/dockerfile:1
# The API image (docs/13-deployment.md): locked dependencies, the code, and the demo catalog with its embedding model
# built in, so the container starts without downloading anything. Settings and secrets come from the environment.
ARG PYTHON_IMAGE=python:3.12-slim-bookworm

# Dependencies, from the lockfile only, so code changes don't reinstall them.
FROM ${PYTHON_IMAGE} AS deps
COPY --from=ghcr.io/astral-sh/uv:0.11.17 /uv /usr/local/bin/uv
ENV UV_PYTHON_DOWNLOADS=never UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

# The demo catalog: generated, ingested and embedded (docs/02-catalog.md). Only the code these commands import is
# copied, so the catalog is rebuilt when it or the generator changes, not on every API change.
FROM deps AS catalog
COPY app/__init__.py app/config.py app/
COPY app/catalog app/catalog
COPY demo demo
RUN .venv/bin/python -m demo.generate \
 && .venv/bin/python -m app.catalog.ingest demo/products.jsonl \
 && .venv/bin/python -m app.catalog.embed

# One uvicorn process, never several: sessions, rate windows and the day's spend live in its memory
# (docs/11-abuse-protection.md, State and logging).
FROM ${PYTHON_IMAGE}
RUN useradd --system --uid 10001 --no-create-home --home-dir /app saathi
WORKDIR /app
COPY --from=deps /app/.venv .venv
COPY app app
COPY --from=catalog /app/data data
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1
USER saathi
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "10"]
