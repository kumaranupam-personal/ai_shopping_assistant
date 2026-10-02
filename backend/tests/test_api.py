import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.agent.loop import MAX_MODEL_CALLS
from app.catalog.cards import build_card
from app.catalog.embed import embed
from app.catalog.ingest import ingest
from app.config import Settings
from app.llm.base import LLMUpstreamError
from app.main import create_app, stream_turn
from app.search.index import load_index
from tests.conftest import CATALOG
from tests.test_embed import FakeModel
from tests.test_ingest import write_lines
from tests.test_loop import SEARCH, SHOW, ScriptedProvider, reply

MAX_TURNS = 2
HAPPY_TURN = (
    reply("Let me look.", stop="tool_use", calls=[SEARCH]),
    reply(stop="tool_use", calls=[SHOW]),
    reply("Here are 2 warm jackets."),
)


@pytest.fixture
def make_client(index):
    clients = []

    def make(*responses):
        settings = Settings(_env_file=None, max_turns_per_session=MAX_TURNS)
        client = TestClient(create_app(settings, ScriptedProvider(*responses), index))
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
     {"message": "hi"}, "not json"],
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
        stream = stream_turn(BlockingProvider(reply(stop="tool_use", calls=[SEARCH])), index, store, session_id, "hi")
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
    response = client.get("/api/products/NOPE")
    assert (response.status_code, response.json()["error"]["code"]) == (404, "product_not_found")


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
    stream_turn(ScriptedProvider(), index, client.app.state.store, session_id, "hi")  # client gone before streaming
    assert session(client, session_id).busy is False


def test_a_turn_that_loses_the_race_gets_an_error_event(make_client, index):
    client = make_client()
    store = client.app.state.store
    session_id = new_session(client)
    store.begin_turn(session_id)  # another request started a turn after this one was checked

    async def read_all():
        return [frame async for frame in stream_turn(ScriptedProvider(), index, store, session_id, "hi")]

    assert parse_events("".join(asyncio.run(read_all()))) == [
        ("error", {"code": "turn_in_progress", "message": "A reply is still being generated for this chat."})
    ]
