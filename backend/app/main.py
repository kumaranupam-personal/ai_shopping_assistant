"""FastAPI app: endpoints and chat streaming (docs/05-api.md)."""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app.agent.loop import TurnLimitError, run_turn
from app.agent.session import (
    ClientSessionsError,
    ServerBusyError,
    SessionFullError,
    SessionNotFoundError,
    SessionStore,
    TurnInProgressError,
)
from app.catalog.cards import attribute_details, build_card, featured_cards
from app.catalog.store import fetch_products
from app.config import Settings
from app.limits import DailyBudget, MeteredProvider, RateLimit, Rejected, client_ip, log_rejection, rate_key, verify_turnstile
from app.llm.base import LLMConfigError, LLMProvider, LLMUpstreamError
from app.llm.registry import build_provider
from app.search.index import SearchIndex, load_index
from app.sse import format_event
from app.tracing import TraceOptions, setup_tracing, shutdown_tracing

log = logging.getLogger(__name__)

# Session errors -> (HTTP status, code). Raised before a response starts, or as an error event once streaming.
HTTP_ERRORS = {
    SessionNotFoundError: (404, "session_not_found"),
    TurnInProgressError: (409, "turn_in_progress"),
    SessionFullError: (429, "session_full"),
    ServerBusyError: (503, "server_busy"),
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
    "rate_limited": "You're sending requests too quickly. Try again in a moment.",
    "verification_failed": "We couldn't check that you're a person. Reload the page to try again.",
    "server_busy": "The store is busy right now. Try again in a moment.",
    "chat_unavailable": "Chat is paused right now. Please come back later.",
}
# Abuse-check rejections -> HTTP status (docs/11-abuse-protection.md).
REJECTED_STATUS = {"rate_limited": 429, "verification_failed": 403, "chat_unavailable": 503}


class SessionRequest(BaseModel):
    turnstile_token: str | None = None


class ChatRequest(BaseModel):
    session_id: str = Field(max_length=64)
    message: str = Field(max_length=1000, pattern=r"\S")  # at least one non-space character


def error_response(status: int, code: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": MESSAGES[code]}}, status_code=status, headers=headers)


def stream_error_code(error: BaseException) -> str:
    if type(error) in HTTP_ERRORS:
        return HTTP_ERRORS[type(error)][1]
    if isinstance(error, Rejected):  # today's budget ran out during the turn
        return error.code
    if isinstance(error, TurnLimitError):
        return "turn_limit"
    if isinstance(error, LLMUpstreamError):
        return "upstream_error"
    log.error("Turn failed", exc_info=error)
    return "internal_error"


async def stream_turn(
    provider: LLMProvider,
    index: SearchIndex,
    store: SessionStore,
    session_id: str,
    text: str,
    options: TraceOptions,
    client: str | None = None,
    budget: DailyBudget | None = None,
) -> AsyncIterator[str]:
    """Streams one turn's events, ending with `done` or `error`. Closing the stream cancels the turn.

    The turn starts here, on the first read of the stream, so a stream that is never read never leaves the
    session busy.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def run():
        try:
            turn = store.begin_turn(session_id)
            emit = lambda event, data: queue.put_nowait(format_event(event, data))
            return await run_turn(provider, index, turn, text, emit, options, budget)
        finally:
            queue.put_nowait(None)  # end of the turn's events

    task = asyncio.create_task(run())
    try:
        while (frame := await queue.get()) is not None:
            yield frame
        await asyncio.wait({task})
        if error := task.exception():
            code = stream_error_code(error)
            if code in ("server_busy", "chat_unavailable"):  # a cap filled or the budget ran out after the checks
                log_rejection(code, client)
            yield format_event("error", {"code": code, "message": MESSAGES[code]})
        else:
            yield format_event("done", {"turn": task.result().turn})
    finally:  # the client disconnected before the turn ended: cancel it, which rolls it back
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


# Controls a deployment behind a proxy should have on (docs/11-abuse-protection.md, State and logging).
PROXY_CONTROLS = (
    "daily_budget_usd",
    "rate_limit_sessions_per_hour",
    "rate_limit_chat_per_minute",
    "rate_limit_chat_per_day",
    "max_sessions",
    "max_sessions_per_ip",
    "max_concurrent_turns",
    "turnstile_secret",
)


def warn_controls_off(settings: Settings) -> None:
    """With CLIENT_IP_HEADER set, the mark of a deployment behind a proxy, logs one warning per control that is off."""
    if settings.client_ip_header:
        for name in PROXY_CONTROLS:
            if not getattr(settings, name):  # unset, or a count limit of 0
                log.warning("%s is off", name.upper())


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None, index: SearchIndex | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        warn_controls_off(settings)
        app.state.provider = provider or build_provider(settings)
        if settings.daily_budget_usd is not None:
            if app.state.provider.prices is None:
                raise LLMConfigError(f"DAILY_BUDGET_USD needs prices for model {app.state.provider.model!r}, which has none.")
            app.state.provider = MeteredProvider(app.state.provider, app.state.budget)
        app.state.index = index or load_index(settings.data_dir)
        app.state.store = SessionStore(
            settings.session_ttl_minutes,
            settings.max_turns_per_session,
            settings.max_sessions,
            settings.max_concurrent_turns,
            max_per_client=settings.max_sessions_per_ip,
        )
        app.state.featured = {"headline": "Popular picks", "suggestions": [], "products": featured_cards(app.state.index.conn)}
        app.state.http = httpx.AsyncClient()  # for the Turnstile check
        tracing = setup_tracing(settings)
        yield
        await app.state.http.aclose()
        shutdown_tracing(tracing)  # flushes the remaining spans

    # Endpoints are async so all session-store access stays on the event loop thread.
    app = FastAPI(title="AI shopping assistant", lifespan=lifespan)
    app.state.budget = DailyBudget(settings.daily_budget_usd)
    app.state.session_rate = RateLimit([(settings.rate_limit_sessions_per_hour, 3600)])
    app.state.chat_rate = RateLimit([(settings.rate_limit_chat_per_minute, 60), (settings.rate_limit_chat_per_day, 86400)])
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
    @app.exception_handler(ServerBusyError)
    async def session_error(request: Request, error: Exception) -> JSONResponse:
        status, code = HTTP_ERRORS[type(error)]
        if code == "server_busy":
            log_rejection(code, client_ip(request, settings.client_ip_header))
        return error_response(status, code)

    @app.exception_handler(Rejected)
    async def rejected(request: Request, error: Rejected) -> JSONResponse:
        log_rejection(error.code, client_ip(request, settings.client_ip_header))
        headers = {"Retry-After": str(error.retry_after)} if error.retry_after is not None else None
        return error_response(REJECTED_STATUS[error.code], error.code, headers)

    @app.post("/api/sessions", status_code=201)
    async def create_session(request: Request, body: SessionRequest | None = None) -> dict:
        state = request.app.state
        ip = client_ip(request, settings.client_ip_header)
        key = rate_key(ip)
        # The checks in docs/11-abuse-protection.md, in order; the first that fails rejects the request.
        state.session_rate.hit(key)
        try:
            state.store.check_can_create(key)
            if settings.turnstile_secret:
                await verify_turnstile(state.http, settings.turnstile_secret, body and body.turnstile_token, ip)
            session = state.store.create(state.provider.name, key)  # the live-session cap
        except ClientSessionsError:  # a place frees only when a session expires, so no Retry-After
            raise Rejected("rate_limited") from None
        return {"session_id": session.id}

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
        ip = client_ip(request, settings.client_ip_header)
        # The checks in docs/11-abuse-protection.md, in order; the first that fails rejects the request.
        if not settings.chat_enabled or state.budget.exhausted():
            raise Rejected("chat_unavailable")
        state.chat_rate.hit(rate_key(ip))
        state.store.check_can_start(body.session_id)  # unknown, busy, full sessions and the running-turn cap
        options = TraceOptions(["api"], settings.trace_message_text)
        stream = stream_turn(state.provider, state.index, state.store, body.session_id, body.message, options, ip, state.budget)
        return StreamingResponse(stream, media_type="text/event-stream")

    @app.get("/api/featured")
    async def featured(request: Request) -> dict:
        return request.app.state.featured

    @app.get("/api/products/{product_id}")
    async def product_details(product_id: str, request: Request):
        product = fetch_products(request.app.state.index.conn, [product_id]).get(product_id)
        if product is None:
            return error_response(404, "product_not_found")
        return {**product, "card": build_card(product), "details": attribute_details(product)}

    @app.get("/api/health")
    async def health(request: Request) -> dict:
        count = request.app.state.index.conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        return {"status": "ok", "products": count}

    return app


app = create_app()
