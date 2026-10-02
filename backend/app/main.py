"""FastAPI app: endpoints and chat streaming (docs/05-api.md)."""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.agent.loop import TurnLimitError, run_turn
from app.agent.session import SessionFullError, SessionNotFoundError, SessionStore, Turn, TurnInProgressError
from app.catalog.cards import build_card
from app.catalog.store import fetch_products
from app.config import Settings
from app.llm.base import LLMProvider, LLMUpstreamError
from app.llm.registry import build_provider
from app.search.index import SearchIndex, load_index
from app.sse import format_event

log = logging.getLogger(__name__)

# Errors raised before a response starts -> (HTTP status, code).
# Endpoints are async so all session-store access stays on the event loop thread.
HTTP_ERRORS = {
    SessionNotFoundError: (404, "session_not_found"),
    TurnInProgressError: (409, "turn_in_progress"),
    SessionFullError: (429, "session_full"),
}
MESSAGES = {
    "session_not_found": "This chat session doesn't exist or has expired.",
    "turn_in_progress": "A reply is still being generated for this chat.",
    "session_full": "This chat has reached its message limit. Start a new chat.",
    "invalid_request": "The request is invalid.",
    "product_not_found": "This product doesn't exist.",
    "turn_limit": "The assistant needed too many steps to answer. Try rephrasing your request.",
    "upstream_error": "The AI service is unavailable right now. Try again in a moment.",
    "internal_error": "Something went wrong. Try again.",
}


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(max_length=1000, pattern=r"\S")  # at least one non-space character


def error_response(status: int, code: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": MESSAGES[code]}}, status_code=status)


def stream_error_code(error: BaseException) -> str:
    if isinstance(error, TurnLimitError):
        return "turn_limit"
    if isinstance(error, LLMUpstreamError):
        return "upstream_error"
    log.error("Turn failed", exc_info=error)
    return "internal_error"


async def stream_turn(provider: LLMProvider, index: SearchIndex, turn: Turn, text: str) -> AsyncIterator[str]:
    """Streams one turn's events, ending with `done` or `error`. Closing the stream cancels the turn."""
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def run():
        try:
            return await run_turn(provider, index, turn, text, lambda event, data: queue.put_nowait(format_event(event, data)))
        finally:
            queue.put_nowait(None)  # end of the turn's events

    task = asyncio.create_task(run())
    try:
        while (frame := await queue.get()) is not None:
            yield frame
        await asyncio.wait({task})
        if error := task.exception():
            code = stream_error_code(error)
            yield format_event("error", {"code": code, "message": MESSAGES[code]})
        else:
            yield format_event("done", {"turn": task.result().turn})
    finally:  # the client disconnected before the turn ended: cancel it, which rolls it back
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None, index: SearchIndex | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.provider = provider or build_provider(settings)
        app.state.index = index or load_index(settings.data_dir)
        app.state.store = SessionStore(settings.session_ttl_minutes, settings.max_turns_per_session)
        yield

    app = FastAPI(title="AI shopping assistant", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _error: RequestValidationError) -> JSONResponse:
        return error_response(422, "invalid_request")

    @app.exception_handler(SessionNotFoundError)
    @app.exception_handler(TurnInProgressError)
    @app.exception_handler(SessionFullError)
    async def session_error(_request: Request, error: Exception) -> JSONResponse:
        return error_response(*HTTP_ERRORS[type(error)])

    @app.post("/api/sessions", status_code=201)
    async def create_session(request: Request) -> dict:
        return {"session_id": request.app.state.store.create(request.app.state.provider.name).id}

    @app.get("/api/sessions/{session_id}")
    async def restore_session(session_id: str, request: Request) -> dict:
        session = request.app.state.store.get(session_id)
        conn = request.app.state.index.conn
        entries = []
        for entry in session.transcript:
            if entry["type"] == "products":
                found = fetch_products(conn, entry["product_ids"])
                cards = [build_card(found[i]) for i in entry["product_ids"] if i in found]
                entry = {"type": "products", "headline": entry["headline"], "suggestions": entry["suggestions"], "products": cards}
            entries.append(entry)
        return {"session_id": session.id, "turn_count": session.turn_count, "entries": entries}

    @app.post("/api/chat")
    async def chat(body: ChatRequest, request: Request) -> StreamingResponse:
        state = request.app.state
        turn = state.store.begin_turn(body.session_id)  # rejects before the stream starts
        return StreamingResponse(stream_turn(state.provider, state.index, turn, body.message), media_type="text/event-stream")

    @app.get("/api/products/{product_id}")
    async def product_details(product_id: str, request: Request):
        product = fetch_products(request.app.state.index.conn, [product_id]).get(product_id)
        if product is None:
            return error_response(404, "product_not_found")
        return {**product, "card": build_card(product)}

    @app.get("/api/health")
    async def health(request: Request) -> dict:
        count = request.app.state.index.conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        return {"status": "ok", "products": count}

    return app


app = create_app()
