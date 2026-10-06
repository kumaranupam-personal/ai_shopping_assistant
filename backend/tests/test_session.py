import pytest

from app.agent.session import (
    ClientSessionsError,
    ServerBusyError,
    SessionFullError,
    SessionNotFoundError,
    SessionStore,
    TurnInProgressError,
)


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def store(clock):
    return SessionStore(ttl_minutes=60, max_turns=2, clock=clock)


def test_created_session_can_be_fetched(store):
    session = store.create("anthropic")
    assert store.get(session.id) is session and session.provider == "anthropic"


def test_unknown_session_is_not_found(store):
    with pytest.raises(SessionNotFoundError):
        store.get("missing")


def test_idle_sessions_expire_and_activity_extends_them(store, clock):
    active, idle = store.create("anthropic"), store.create("anthropic")
    clock.now = 50 * 60
    store.get(active.id)  # counts as activity
    clock.now = 61 * 60
    store.get(active.id)
    with pytest.raises(SessionNotFoundError):
        store.get(idle.id)
    assert list(store.sessions) == [active.id]  # every access purges expired sessions


def test_busy_session_rejects_a_second_turn(store):
    session = store.create("anthropic")
    store.begin_turn(session.id)
    with pytest.raises(TurnInProgressError):
        store.begin_turn(session.id)


def test_full_session_rejects_new_turns(store):
    session = store.create("anthropic")
    for _ in range(2):
        store.begin_turn(session.id).commit()
    with pytest.raises(SessionFullError):
        store.begin_turn(session.id)


def test_commit_keeps_the_turn(store):
    session = store.create("anthropic")
    turn = store.begin_turn(session.id)
    session.history += ["user message", "assistant message"]
    turn.transcript += [{"type": "user", "text": "hi"}, {"type": "assistant", "text": "hello"}]
    turn.shown_ids = ["J1"]
    assert session.transcript == []  # held with the turn until it commits
    turn.commit()
    assert session.history == ["user message", "assistant message"]
    assert session.transcript == [{"type": "user", "text": "hi"}, {"type": "assistant", "text": "hello"}]
    assert (session.shown_ids, session.turn_count, session.busy) == (["J1"], 1, False)


def test_rollback_restores_the_state_before_the_turn(store):
    session = store.create("anthropic")
    first = store.begin_turn(session.id)
    session.history.append("turn 1")
    first.transcript.append({"type": "user", "text": "first"})
    first.shown_ids = ["J1"]
    first.commit()

    second = store.begin_turn(session.id)
    session.history += ["turn 2", "half-finished tool call"]
    second.transcript.append({"type": "user", "text": "second"})
    second.shown_ids = ["J3"]
    second.rollback()

    assert session.history == ["turn 1"]
    assert session.transcript == [{"type": "user", "text": "first"}]
    assert (session.shown_ids, session.turn_count, session.busy) == (["J1"], 1, False)


def test_live_session_cap_counts_only_unexpired_sessions(clock):
    store = SessionStore(ttl_minutes=60, max_turns=2, max_sessions=2, clock=clock)
    store.create("anthropic"), store.create("anthropic")
    with pytest.raises(ServerBusyError):
        store.create("anthropic")
    clock.now = 61 * 60  # both expire, freeing their places
    store.create("anthropic")


def test_running_turn_cap_counts_busy_sessions_after_the_session_checks(store):
    store.max_running = 1
    running, waiting, full = store.create("anthropic"), store.create("anthropic"), store.create("anthropic")
    store.begin_turn(running.id)
    full.turn_count = 2
    with pytest.raises(TurnInProgressError):  # the session checks come first
        store.check_can_start(running.id)
    with pytest.raises(SessionFullError):
        store.check_can_start(full.id)
    with pytest.raises(ServerBusyError):
        store.begin_turn(waiting.id)
    store.sessions[running.id].busy = False  # the running turn ended
    store.begin_turn(waiting.id)


def test_a_full_store_removes_the_longest_idle_empty_session_idle_for_15_minutes(clock):
    store = SessionStore(ttl_minutes=60, max_turns=2, max_sessions=3, clock=clock)
    older, newer, chatting = store.create("anthropic"), store.create("anthropic"), store.create("anthropic")
    chatting.transcript.append({"type": "user", "text": "hi"})
    clock.now = 14 * 60
    store.get(newer.id)  # newer is idle from 14 minutes
    with pytest.raises(ServerBusyError):  # nothing has been idle for 15 minutes yet
        store.create("anthropic")
    clock.now = 30 * 60
    store.create("anthropic")
    assert older.id not in store.sessions and {newer.id, chatting.id} <= set(store.sessions)


def test_sessions_with_messages_or_a_running_turn_are_never_evicted(clock):
    store = SessionStore(ttl_minutes=60, max_turns=2, max_sessions=2, clock=clock)
    chatting, running = store.create("anthropic"), store.create("anthropic")
    chatting.transcript.append({"type": "user", "text": "hi"})
    store.begin_turn(running.id)
    clock.now = 59 * 60
    with pytest.raises(ServerBusyError):
        store.create("anthropic")
    assert set(store.sessions) == {chatting.id, running.id}


def test_per_client_cap_counts_only_that_clients_unexpired_sessions(clock):
    store = SessionStore(ttl_minutes=60, max_turns=2, clock=clock, max_per_client=2)
    store.create("anthropic", "1.1.1.1"), store.create("anthropic", "1.1.1.1")
    with pytest.raises(ClientSessionsError):
        store.check_can_create("1.1.1.1")
    with pytest.raises(ClientSessionsError):
        store.create("anthropic", "1.1.1.1")
    assert store.create("anthropic", "2.2.2.2").client == "2.2.2.2"  # another client has its own places
    clock.now = 61 * 60  # the first client's sessions expire, freeing their places
    store.create("anthropic", "1.1.1.1")
