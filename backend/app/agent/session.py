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


class ServerBusyError(Exception):
    """The store is at its live-session or running-turn cap (docs/11-abuse-protection.md)."""


class ClientSessionsError(Exception):
    """The client already holds its cap of live sessions (docs/11-abuse-protection.md, Sessions per client)."""


EVICT_IDLE_SECONDS = 15 * 60  # an empty session idle this long can make room in a full store


@dataclass
class Session:
    id: str
    provider: str
    last_active: float
    client: str = ""  # the rate key of the visitor who created it
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
    def __init__(
        self,
        ttl_minutes: int,
        max_turns: int,
        max_sessions: int = 0,
        max_running: int = 0,
        clock: Callable[[], float] = time.monotonic,
        max_per_client: int = 0,
    ):
        self.ttl_seconds, self.max_turns, self.clock = ttl_minutes * 60, max_turns, clock
        self.max_sessions, self.max_running, self.max_per_client = max_sessions, max_running, max_per_client  # 0 is off
        self.sessions: dict[str, Session] = {}

    def _purge_expired(self) -> None:
        cutoff = self.clock() - self.ttl_seconds
        self.sessions = {k: s for k, s in self.sessions.items() if s.busy or s.last_active >= cutoff}

    def check_can_create(self, client: str) -> None:
        """Raises ClientSessionsError when `client` already holds its cap of live sessions."""
        self._purge_expired()
        if self.max_per_client and sum(s.client == client for s in self.sessions.values()) >= self.max_per_client:
            raise ClientSessionsError(client)

    def _evict_idle_empty(self) -> bool:
        """Removes the longest-idle empty session that has been idle long enough, if there is one."""
        cutoff = self.clock() - EVICT_IDLE_SECONDS
        empty = [s for s in self.sessions.values() if not s.transcript and not s.busy and s.last_active <= cutoff]
        if not empty:
            return False
        del self.sessions[min(empty, key=lambda s: s.last_active).id]
        return True

    def create(self, provider: str, client: str = "") -> Session:
        """Adds a session for `client`, after the per-client cap and the live-session cap (docs/11-abuse-protection.md)."""
        self.check_can_create(client)
        if self.max_sessions and len(self.sessions) >= self.max_sessions and not self._evict_idle_empty():
            raise ServerBusyError()
        session = Session(str(uuid.uuid4()), provider, self.clock(), client)
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
        if self.max_running and sum(s.busy for s in self.sessions.values()) >= self.max_running:
            raise ServerBusyError()  # a running turn is a busy session
        return session

    def begin_turn(self, session_id: str) -> Turn:
        session = self.check_can_start(session_id)
        session.busy = True
        return Turn(session, len(session.history))
