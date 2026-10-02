import pytest

from app.agent.session import SessionFullError, SessionNotFoundError, SessionStore, TurnInProgressError


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
