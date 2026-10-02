"""In-memory sessions and per-turn commit or rollback (docs/04-agent.md, Conversation state)."""

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field


class SessionNotFoundError(Exception):
    pass


class TurnInProgressError(Exception):
    pass


class SessionFullError(Exception):
    pass


@dataclass
class Session:
    id: str
    provider: str
    last_active: float
    history: list = field(default_factory=list)  # provider-native, append-only
    transcript: list[dict] = field(default_factory=list)  # committed display entries
    shown_ids: list[str] = field(default_factory=list)
    turn_count: int = 0
    busy: bool = False


@dataclass
class Turn:
    """One running turn. Display entries and the shown list stay here until the turn commits."""

    session: Session
    history_length: int
    transcript: list[dict] = field(default_factory=list)
    shown_ids: list[str] | None = None

    def commit(self) -> None:
        s = self.session
        s.transcript.extend(self.transcript)
        if self.shown_ids is not None:
            s.shown_ids = self.shown_ids
        s.turn_count += 1
        s.busy = False

    def rollback(self) -> None:
        del self.session.history[self.history_length :]
        self.session.busy = False


class SessionStore:
    def __init__(self, ttl_minutes: int, max_turns: int, clock: Callable[[], float] = time.monotonic):
        self.ttl_seconds, self.max_turns, self.clock = ttl_minutes * 60, max_turns, clock
        self.sessions: dict[str, Session] = {}

    def _purge_expired(self) -> None:
        cutoff = self.clock() - self.ttl_seconds
        self.sessions = {k: s for k, s in self.sessions.items() if s.busy or s.last_active >= cutoff}

    def create(self, provider: str) -> Session:
        self._purge_expired()
        session = Session(str(uuid.uuid4()), provider, self.clock())
        self.sessions[session.id] = session
        return session

    def get(self, session_id: str) -> Session:
        """Returns the session and marks it active, or raises SessionNotFoundError."""
        self._purge_expired()
        session = self.sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError(session_id)
        session.last_active = self.clock()
        return session

    def check_can_start(self, session_id: str) -> Session:
        """Raises the error a new turn would hit, without starting one."""
        session = self.get(session_id)
        if session.busy:
            raise TurnInProgressError(session_id)
        if session.turn_count >= self.max_turns:
            raise SessionFullError(session_id)
        return session

    def begin_turn(self, session_id: str) -> Turn:
        session = self.check_can_start(session_id)
        session.busy = True
        return Turn(session, len(session.history))
