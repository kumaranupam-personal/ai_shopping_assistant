"""Rate limits, the daily budget, the Turnstile check and the client IP they key on (docs/11-abuse-protection.md)."""

import ipaddress
import logging
import math
import time
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime

import httpx
from fastapi import Request

from app.llm.base import LLMProvider, LLMResponse

log = logging.getLogger(__name__)
TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TIMEOUT_SECONDS = 5
SWEEP_SECONDS = 60  # how often a limiter forgets idle clients


class Rejected(Exception):
    """A request refused by an abuse check, carrying its error code from docs/05-api.md."""

    def __init__(self, code: str, retry_after: int | None = None):
        super().__init__(code)
        self.code, self.retry_after = code, retry_after


def client_ip(request: Request, header: str | None) -> str:
    """The client IP: the configured header's value when present, otherwise the TCP peer."""
    return (header and request.headers.get(header)) or (request.client.host if request.client else "unknown")


def rate_key(ip: str) -> str:
    """The key the per-client limits count `ip` under: its /64 network for IPv6, the address itself otherwise."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:  # a header value that isn't an address counts as it is
        return ip
    if address.version == 4:
        return ip
    if address.ipv4_mapped:
        return str(address.ipv4_mapped)
    return str(ipaddress.ip_network(f"{ip}/64", strict=False))


def log_rejection(code: str, ip: str | None) -> None:
    log.warning("Rejected %s for %s", code, ip or "unknown client")


class RateLimit:
    """Sliding windows per client IP. A request passes when every window has room, and then counts in each."""

    def __init__(self, windows: list[tuple[int, float]], clock: Callable[[], float] = time.monotonic):
        self.windows = [(limit, seconds) for limit, seconds in windows if limit > 0]  # a limit of 0 is off
        self.clock = clock
        self.hits: dict[str, deque[float]] = {}
        self.last_sweep = clock()

    def hit(self, key: str) -> None:
        """Counts one request for `key`, or raises Rejected("rate_limited") without counting it."""
        if not self.windows:
            return
        now = self.clock()
        oldest = now - max(seconds for _, seconds in self.windows)
        if now - self.last_sweep >= SWEEP_SECONDS:  # forget clients idle past every window, at most once a minute
            self.hits = {k: h for k, h in self.hits.items() if h and h[-1] > oldest}
            self.last_sweep = now
        times = self.hits.setdefault(key, deque())
        while times and times[0] <= oldest:
            times.popleft()
        waits = []
        for limit, seconds in self.windows:
            inside = [t for t in times if t > now - seconds]
            if len(inside) >= limit:  # room comes back when the oldest counted request leaves the window
                waits.append(inside[-limit] + seconds - now)
        if waits:
            raise Rejected("rate_limited", retry_after=math.ceil(max(waits)))
        times.append(now)


class DailyBudget:
    """Model spend per UTC day. With no limit it never runs out."""

    def __init__(self, limit_usd: float | None, clock: Callable[[], float] = time.time):
        self.limit, self.clock = limit_usd, clock
        self.day, self.spent = None, 0.0

    def _roll_over(self) -> None:
        day = datetime.fromtimestamp(self.clock(), UTC).date()
        if day != self.day:
            self.day, self.spent = day, 0.0

    def add(self, usd: float) -> None:
        self._roll_over()
        self.spent += usd

    def exhausted(self) -> bool:
        if self.limit is None:
            return False
        self._roll_over()
        return self.spent >= self.limit


class MeteredProvider:
    """Passes everything through to a provider, adding each model call's cost to the budget as soon as it returns."""

    def __init__(self, provider: LLMProvider, budget: DailyBudget):
        self.provider, self.budget = provider, budget

    def __getattr__(self, name: str):
        return getattr(self.provider, name)

    async def complete(self, system: str, history: list, tools: list) -> LLMResponse:
        response = await self.provider.complete(system, history, tools)
        self.budget.add(self.provider.prices.cost(response.usage))
        return response


async def verify_turnstile(http: httpx.AsyncClient, secret: str, token: str | None, ip: str) -> None:
    """Asks Cloudflare whether a Turnstile token is valid. Raises Rejected("verification_failed") unless it is,
    including when the token is missing or Cloudflare can't be reached in time."""
    if token:
        try:
            response = await http.post(
                TURNSTILE_VERIFY_URL,
                data={"secret": secret, "response": token, "remoteip": ip},
                timeout=TURNSTILE_TIMEOUT_SECONDS,
            )
            if response.is_success and response.json().get("success") is True:
                return
        except (httpx.HTTPError, ValueError):  # unreachable, timed out, or not JSON
            pass
    raise Rejected("verification_failed")
