import asyncio
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient
from opentelemetry import trace

from app.agent.loop import MAX_MODEL_CALLS
from app.catalog.cards import build_card, featured_cards
from app.catalog.embed import embed
from app.catalog.ingest import ingest
from app.catalog.store import open_catalog
from app.config import Settings
from app.llm.base import LLMConfigError, LLMUpstreamError, Prices
from app.main import SKIP_HEALTH_CHECKS, create_app, stream_turn
from app.search.index import load_index
from tests.conftest import CATALOG, jacket
from tests.test_embed import FakeModel
from tests.test_ingest import write_lines
from tests.test_loop import OPTIONS, SEARCH, SHOW, ScriptedProvider, reply
from tests.test_session import Clock

MAX_TURNS = 2
HAPPY_TURN = (reply("Let me look.", stop="tool_use", calls=[SEARCH]), reply(stop="tool_use", calls=[SHOW]))


@pytest.fixture
def make_client(index):
    clients = []

    def make(*responses, provider=None, **overrides):
        settings = Settings(_env_file=None, max_turns_per_session=MAX_TURNS, **overrides)
        client = TestClient(create_app(settings, provider or ScriptedProvider(*responses), index))
        clients.append(client.__enter__())  # runs the app's startup
        return client

    yield make
    for client in clients:
        client.__exit__(None, None, None)


def new_session(client):
    response = client.post("/api/sessions")
    assert response.status_code == 201
    return response.json()["session_id"]


def chat(client, session_id, message="warm jacket under 3k"):
    response = client.post("/api/chat", json={"session_id": session_id, "message": message})
    return response, parse_events(response.text) if response.status_code == 200 else None


def parse_events(body):
    events = []
    for frame in body.strip().split("\n\n"):
        event_line, data_line = frame.split("\n")
        events.append((event_line.removeprefix("event: "), json.loads(data_line.removeprefix("data: "))))
    return events


def session(client, session_id):
    return client.app.state.store.sessions[session_id]


def test_chat_streams_events_in_the_order_the_turn_produces_them(make_client):
    client = make_client(*HAPPY_TURN)
    response, events = chat(client, new_session(client))
    assert response.headers["content-type"].startswith("text/event-stream")
    assert [e for e, _ in events] == ["text", "status", "products", "text", "done"]
    assert events[1][1] == {"text": "Searching jackets under ₹3,000"}
    assert [card["id"] for card in events[2][1]["products"]] == ["J3", "J1"]
    assert events[-1] == ("done", {"turn": 1})


def test_restore_returns_committed_turns_with_current_cards(make_client, tmp_path):
    client = make_client(*HAPPY_TURN)
    session_id = new_session(client)
    chat(client, session_id)

    restored = client.get(f"/api/sessions/{session_id}").json()
    assert restored["session_id"] == session_id and restored["turn_count"] == 1
    assert [e["type"] for e in restored["entries"]] == ["user", "assistant", "products", "assistant"]
    assert [card["id"] for card in restored["entries"][2]["products"]] == ["J3", "J1"]

    # The catalog changes after the turn: J1 gets cheaper and J3 is removed.
    changed = [{**p, "price": 900} if p["id"] == "J1" else p for p in CATALOG if p["id"] != "J3"]
    ingest(write_lines(tmp_path / "p.jsonl", changed), tmp_path)
    embed(tmp_path, FakeModel())
    client.app.state.index = load_index(tmp_path, model=FakeModel())

    cards = client.get(f"/api/sessions/{session_id}").json()["entries"][2]["products"]
    assert [(card["id"], card["price"]) for card in cards] == [("J1", 900)]


@pytest.mark.parametrize(
    ("responses", "code"),
    [
        ([reply(stop="tool_use", calls=[SEARCH])] * MAX_MODEL_CALLS, "turn_limit"),
        ([LLMUpstreamError("overloaded")], "upstream_error"),
        ([RuntimeError("bug")], "internal_error"),
    ],
)
def test_failed_turns_end_with_an_error_event_and_roll_back(make_client, responses, code):
    client = make_client(*responses)
    session_id = new_session(client)
    _, events = chat(client, session_id)
    assert events[-1][0] == "error" and events[-1][1]["code"] == code and events[-1][1]["message"]
    assert [e for e, _ in events].count("error") == 1 and "done" not in [e for e, _ in events]
    s = session(client, session_id)
    assert (s.history, s.transcript, s.turn_count, s.busy) == ([], [], 0, False)


def test_session_errors_are_rejected_before_streaming(make_client):
    client = make_client(*HAPPY_TURN)
    assert chat(client, "missing")[0].json() == {
        "error": {"code": "session_not_found", "message": "This chat session doesn't exist or has expired."}
    }
    assert client.get("/api/sessions/missing").status_code == 404

    busy = new_session(client)
    session(client, busy).busy = True
    response, _ = chat(client, busy)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "turn_in_progress")

    full = new_session(client)
    session(client, full).turn_count = MAX_TURNS
    response, _ = chat(client, full)
    assert (response.status_code, response.json()["error"]["code"]) == (429, "session_full")


@pytest.mark.parametrize(
    "body",
    [{"session_id": "s", "message": ""}, {"session_id": "s", "message": "   "}, {"session_id": "s", "message": "x" * 1001},
     {"message": "hi"}, {"session_id": "s" * 65, "message": "hi"}, "not json"],
)
def test_invalid_chat_requests_get_invalid_request(make_client, body):
    client = make_client()
    kwargs = {"content": body, "headers": {"content-type": "application/json"}} if isinstance(body, str) else {"json": body}
    response = client.post("/api/chat", **kwargs)
    assert (response.status_code, response.json()["error"]["code"]) == (422, "invalid_request")


class BlockingProvider(ScriptedProvider):
    """Searches once, then waits forever on the next model call, like a slow model."""

    async def complete(self, system, history, tools):
        if not self.responses:
            await asyncio.Event().wait()  # never set
        return await super().complete(system, history, tools)


def test_client_disconnect_cancels_and_rolls_back_the_turn(make_client, index):
    client = make_client()
    store = client.app.state.store
    session_id = new_session(client)

    async def disconnect_after_first_event():
        stream = stream_turn(BlockingProvider(reply(stop="tool_use", calls=[SEARCH])), index, store, session_id, "hi", OPTIONS)
        first = await anext(stream)
        await stream.aclose()  # what the server does when the client goes away
        return first

    assert asyncio.run(disconnect_after_first_event()).startswith("event: status")
    s = session(client, session_id)
    assert (s.history, s.transcript, s.turn_count, s.busy) == ([], [], 0, False)


def test_product_details_include_the_card(make_client):
    client = make_client()
    product = client.get("/api/products/J1").json()
    assert product["attributes"]["type"] == "down" and product["card"] == build_card({**product})
    assert product["details"] == [
        {"label": "type", "value": "down"}, {"label": "warmth", "value": "extreme"}, {"label": "waterproof", "value": "yes"},
        {"label": "weight", "value": "650 g"}, {"label": "gender", "value": "men"},
    ]
    response = client.get("/api/products/NOPE")
    assert (response.status_code, response.json()["error"]["code"]) == (404, "product_not_found")


def test_featured_picks_the_best_rated_trusted_product_per_category(make_client):
    body = make_client().get("/api/featured").json()
    # J4 is the only in-stock jacket with 100+ reviews, and no phone qualifies, so phones are skipped.
    assert (body["headline"], body["suggestions"]) == ("Popular picks", [])
    assert [card["id"] for card in body["products"]] == ["J4"]


def test_featured_ties_go_to_more_reviews_then_the_lower_id(tmp_path):
    catalog = [
        jacket("A2", "X", 1000, 4.5, 200, 1, ["M"], ["black"]),
        jacket("A1", "X", 1000, 4.5, 200, 1, ["M"], ["black"]),
        jacket("B1", "X", 1000, 4.5, 150, 1, ["M"], ["black"]),
        jacket("C1", "X", 1000, 4.9, 500, 0, ["M"], ["black"]),  # best rated, but out of stock
    ]
    ingest(write_lines(tmp_path / "p.jsonl", catalog), tmp_path)
    assert [card["id"] for card in featured_cards(open_catalog(tmp_path))] == ["A1"]


def test_health_reports_the_product_count(make_client):
    assert make_client().get("/api/health").json() == {"status": "ok", "products": len(CATALOG)}


def test_cors_allows_the_configured_origin(make_client):
    response = make_client().options(
        "/api/chat", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"}
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_a_stream_that_is_never_read_leaves_the_session_free(make_client, index):
    client = make_client()
    session_id = new_session(client)
    stream_turn(ScriptedProvider(), index, client.app.state.store, session_id, "hi", OPTIONS)  # client gone before streaming
    assert session(client, session_id).busy is False


def test_a_turn_that_loses_the_race_gets_an_error_event(make_client, index):
    client = make_client()
    store = client.app.state.store
    session_id = new_session(client)
    store.begin_turn(session_id)  # another request started a turn after this one was checked

    async def read_all():
        return [frame async for frame in stream_turn(ScriptedProvider(), index, store, session_id, "hi", OPTIONS)]

    assert parse_events("".join(asyncio.run(read_all()))) == [
        ("error", {"code": "turn_in_progress", "message": "A reply is still being generated for this chat."})
    ]


# Abuse protection (docs/11-abuse-protection.md)


def rejection(response):
    return response.status_code, response.json()["error"]["code"]


def priced(*responses):
    provider = ScriptedProvider(*responses)
    provider.prices = Prices(input=1000, output=1000, cache_read=1000, cache_write=0)  # $0.2 per scripted call
    return provider


def test_the_kill_switch_comes_before_every_other_chat_check(make_client):
    client = make_client(chat_enabled=False)
    assert rejection(chat(client, "missing")[0]) == (503, "chat_unavailable")


def test_a_spent_budget_pauses_chat_before_the_rate_and_session_checks(make_client):
    client = make_client(provider=priced(), daily_budget_usd=1, rate_limit_chat_per_minute=1)
    client.app.state.budget.add(1)
    for _ in range(2):  # a rate check would have rejected the second
        assert rejection(chat(client, "missing")[0]) == (503, "chat_unavailable")


def test_model_calls_in_failed_turns_count_toward_the_budget(make_client):
    responses = (reply(stop="tool_use", calls=[SEARCH]), reply("Partial", stop="max_tokens"), LLMUpstreamError("down"))
    client = make_client(provider=priced(*responses), daily_budget_usd=0.5)
    _, events = chat(client, new_session(client))
    assert events[-1][1]["code"] == "turn_limit"
    _, events = chat(client, new_session(client))
    assert events[-1][1]["code"] == "upstream_error"
    assert client.app.state.budget.spent == pytest.approx(0.4)  # both calls of the failed turn; the failed call adds nothing
    client.app.state.budget.add(0.1)
    assert rejection(chat(client, new_session(client))[0]) == (503, "chat_unavailable")


def test_a_budget_spent_during_a_turn_ends_it_with_chat_unavailable_and_rolls_it_back(make_client, caplog):
    client = make_client(provider=priced(reply(stop="tool_use", calls=[SEARCH]), reply("never sent")), daily_budget_usd=0.2)
    session_id = new_session(client)
    _, events = chat(client, session_id)
    assert [e for e, _ in events] == ["status", "error"] and events[-1][1]["code"] == "chat_unavailable"
    s = session(client, session_id)
    assert (s.history, s.transcript, s.turn_count, s.busy) == ([], [], 0, False)
    assert "Rejected chat_unavailable for testclient" in caplog.text


def test_a_budget_without_prices_stops_startup(index):
    with pytest.raises(LLMConfigError, match="DAILY_BUDGET_USD"):
        TestClient(create_app(Settings(_env_file=None, daily_budget_usd=1), ScriptedProvider(), index)).__enter__()


def test_the_chat_rate_counts_requests_that_later_checks_reject(make_client, caplog):
    client = make_client(rate_limit_chat_per_minute=1)
    assert rejection(chat(client, "missing")[0]) == (404, "session_not_found")  # passed the rate check, so it counts
    response, _ = chat(client, "missing")
    assert rejection(response) == (429, "rate_limited") and response.headers["retry-after"] == "60"
    assert "Rejected rate_limited for testclient" in caplog.text


def test_the_running_turn_cap_comes_after_the_session_checks(make_client):
    client = make_client(max_concurrent_turns=1)
    running, waiting, full = new_session(client), new_session(client), new_session(client)
    session(client, running).busy = True
    session(client, full).turn_count = MAX_TURNS
    assert rejection(chat(client, running)[0]) == (409, "turn_in_progress")
    assert rejection(chat(client, full)[0]) == (429, "session_full")
    assert rejection(chat(client, waiting)[0]) == (503, "server_busy")


def test_a_turn_that_loses_the_race_for_the_last_running_place_gets_an_error_event(make_client, index):
    client = make_client(max_concurrent_turns=1)
    store = client.app.state.store
    session_id = new_session(client)
    store.begin_turn(new_session(client))  # another turn started after this request was checked

    async def read_all():
        return [frame async for frame in stream_turn(ScriptedProvider(), index, store, session_id, "hi", OPTIONS)]

    assert parse_events("".join(asyncio.run(read_all())))[0][1]["code"] == "server_busy"
    assert session(client, session_id).busy is False


def test_session_creation_checks_the_rate_before_the_live_session_cap(make_client):
    client = make_client(rate_limit_sessions_per_hour=1, max_sessions=1)
    new_session(client)
    response = client.post("/api/sessions")
    assert rejection(response) == (429, "rate_limited") and response.headers["retry-after"] == "3600"
    client = make_client(max_sessions=1)
    new_session(client)
    assert rejection(client.post("/api/sessions")) == (503, "server_busy")


def test_per_ip_limits_key_on_the_configured_header_or_the_peer(make_client):
    client = make_client(rate_limit_sessions_per_hour=1, client_ip_header="CF-Connecting-IP")
    for ip in ("1.1.1.1", "2.2.2.2"):
        assert client.post("/api/sessions", headers={"CF-Connecting-IP": ip}).status_code == 201
    assert rejection(client.post("/api/sessions", headers={"CF-Connecting-IP": "1.1.1.1"})) == (429, "rate_limited")
    assert client.post("/api/sessions").status_code == 201  # without the header: the TCP peer


def test_the_per_client_session_cap_rejects_without_retry_after_and_keys_ipv6_by_64(make_client, caplog):
    client = make_client(max_sessions_per_ip=2, client_ip_header="X-Real-IP")
    for ip in ("2001:db8::1", "2001:db8::2"):  # one /64
        assert client.post("/api/sessions", headers={"X-Real-IP": ip}).status_code == 201
    response = client.post("/api/sessions", headers={"X-Real-IP": "2001:db8::3"})
    assert rejection(response) == (429, "rate_limited") and "retry-after" not in response.headers
    assert "Rejected rate_limited for 2001:db8::3" in caplog.text  # the log line keeps the full address
    assert client.post("/api/sessions", headers={"X-Real-IP": "2001:db8:0:1::1"}).status_code == 201  # another /64


def test_an_expired_session_frees_a_place_under_the_per_client_cap(make_client):
    client = make_client(max_sessions_per_ip=1)
    client.app.state.store.clock = clock = Clock()
    new_session(client)
    assert rejection(client.post("/api/sessions")) == (429, "rate_limited")
    clock.now = 61 * 60
    new_session(client)


def stub_cloudflare(client, answer):
    """Routes the Turnstile check to `answer(request)` instead of Cloudflare, recording each request's form."""
    calls = []

    def handler(request):
        calls.append(dict(httpx.QueryParams(request.content.decode())))
        return answer(request)

    client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return calls


def accept(_request):
    return httpx.Response(200, json={"success": True})


def test_without_a_secret_turnstile_is_off_and_tokens_are_ignored(make_client):
    client = make_client()
    calls = stub_cloudflare(client, accept)
    assert client.post("/api/sessions", json={"turnstile_token": "anything"}).status_code == 201
    assert calls == []


def test_an_accepted_token_creates_a_session(make_client):
    client = make_client(turnstile_secret="secret", client_ip_header="CF-Connecting-IP")
    calls = stub_cloudflare(client, accept)
    response = client.post("/api/sessions", json={"turnstile_token": "good"}, headers={"CF-Connecting-IP": "1.1.1.1"})
    assert response.status_code == 201
    assert calls == [{"secret": "secret", "response": "good", "remoteip": "1.1.1.1"}]


def timeout(request):
    raise httpx.ReadTimeout("slow", request=request)


@pytest.mark.parametrize(
    ("body", "answer"),
    [
        (None, accept),  # no token at all
        ({"turnstile_token": "bad"}, lambda _: httpx.Response(200, json={"success": False})),
        ({"turnstile_token": "good"}, timeout),
        ({"turnstile_token": "good"}, lambda _: httpx.Response(500, text="oops")),
    ],
    ids=["missing", "rejected", "timeout", "server-error"],
)
def test_a_token_cloudflare_does_not_accept_gets_verification_failed(make_client, body, answer):
    client = make_client(turnstile_secret="secret")
    stub_cloudflare(client, answer)
    assert rejection(client.post("/api/sessions", json=body)) == (403, "verification_failed")
    assert client.app.state.store.sessions == {}


def test_the_per_client_cap_runs_after_the_session_rate_and_before_the_human_check(make_client):
    client = make_client(turnstile_secret="secret", rate_limit_sessions_per_hour=2, max_sessions_per_ip=1)
    calls = stub_cloudflare(client, accept)
    assert client.post("/api/sessions", json={"turnstile_token": "good"}).status_code == 201
    assert rejection(client.post("/api/sessions", json={"turnstile_token": "good"})) == (429, "rate_limited")
    response = client.post("/api/sessions", json={"turnstile_token": "good"})
    assert rejection(response) == (429, "rate_limited") and response.headers["retry-after"] == "3600"  # the session rate
    assert len(calls) == 1  # the cap stopped the second before Cloudflare was asked


def test_the_human_check_runs_after_the_session_rate_and_before_the_live_session_cap(make_client):
    client = make_client(turnstile_secret="secret", rate_limit_sessions_per_hour=2, max_sessions=1)
    calls = stub_cloudflare(client, lambda request: httpx.Response(200, json={"success": b"good" in request.content}))
    assert client.post("/api/sessions", json={"turnstile_token": "good"}).status_code == 201
    assert rejection(client.post("/api/sessions", json={"turnstile_token": "bad"})) == (403, "verification_failed")
    assert rejection(client.post("/api/sessions", json={"turnstile_token": "good"})) == (429, "rate_limited")
    assert len(calls) == 2  # the rate check stopped the third before Cloudflare was asked


def test_a_malformed_session_body_gets_invalid_request(make_client):
    assert rejection(make_client().post("/api/sessions", json={"turnstile_token": 5})) == (422, "invalid_request")


def test_behind_a_proxy_startup_warns_about_each_control_that_is_off(make_client, caplog):
    make_client(client_ip_header="X-Real-IP", max_sessions=1000, turnstile_secret="secret")
    warned = {r.getMessage() for r in caplog.records if r.levelname == "WARNING"}
    assert warned == {
        f"{name} is off" for name in (
            "DAILY_BUDGET_USD", "RATE_LIMIT_SESSIONS_PER_HOUR", "RATE_LIMIT_CHAT_PER_MINUTE", "RATE_LIMIT_CHAT_PER_DAY",
            "MAX_SESSIONS_PER_IP", "MAX_CONCURRENT_TURNS",
        )
    }


def test_without_a_proxy_startup_does_not_warn(make_client, caplog):
    make_client()
    assert not [r for r in caplog.records if r.levelname == "WARNING"]


def test_fastapi_native_telemetry_stays_off(index, monkeypatch):
    """Only turns are traced: with an OTLP endpoint in the environment, FastAPI must not install its own exporter
    and trace every request, which would send a trace per health check to Langfuse."""
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://cloud.langfuse.com/api/public/otel")
    settings = Settings(_env_file=None, max_turns_per_session=MAX_TURNS)
    with TestClient(create_app(settings, ScriptedProvider(), index)) as client:  # startup is when FastAPI would configure itself
        assert client.get("/api/health").status_code == 200
        assert isinstance(trace.get_tracer_provider(), trace.ProxyTracerProvider)  # the global provider is still unconfigured


def access_record(path, status=200):
    """A log record as uvicorn's access logger makes it."""
    return logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d', ("127.0.0.1:1", "GET", path, "1.1", status), None)


def test_health_checks_are_left_out_of_access_logs(make_client):
    make_client()
    make_client()  # a second app adds no second filter
    logger = logging.getLogger("uvicorn.access")
    assert logger.filters.count(SKIP_HEALTH_CHECKS) == 1
    assert not logger.filter(access_record("/api/health"))
    assert not logger.filter(access_record("/api/health?x=1", status=503))  # a failing one too: Docker reports it
    assert logger.filter(access_record("/api/healthz"))
    assert logger.filter(access_record("/api/featured"))
    assert logger.filter(logging.LogRecord("uvicorn.access", logging.INFO, "", 0, "no args", None, None))
