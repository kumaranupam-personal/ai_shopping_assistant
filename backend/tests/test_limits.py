import asyncio
from datetime import UTC, datetime

import pytest

from app.limits import DailyBudget, MeteredProvider, RateLimit, Rejected, rate_key
from app.llm.base import Prices
from tests.test_loop import ScriptedProvider, reply
from tests.test_session import Clock


def retry_after(limit, key="1.2.3.4"):
    with pytest.raises(Rejected) as rejected:
        limit.hit(key)
    assert rejected.value.code == "rate_limited"
    return rejected.value.retry_after


def test_a_limit_of_zero_is_off():
    limit = RateLimit([(0, 60)], Clock())
    for _ in range(100):
        limit.hit("1.2.3.4")
    assert limit.hits == {}


def test_the_window_slides_and_rejected_requests_do_not_count():
    clock = Clock()
    limit = RateLimit([(2, 60)], clock)
    limit.hit("1.2.3.4")
    clock.now = 30
    limit.hit("1.2.3.4")
    clock.now = 40
    assert retry_after(limit) == 20  # the request at 0 leaves the window at 60
    clock.now = 59.5
    assert retry_after(limit) == 1  # rounded up to whole seconds
    clock.now = 60
    limit.hit("1.2.3.4")  # the rejections didn't count, so one place is free
    limit.hit("5.6.7.8")  # each client IP has its own window


def test_a_request_must_fit_every_window_and_then_counts_in_each():
    clock = Clock()
    limit = RateLimit([(2, 60), (3, 86400)], clock)
    limit.hit("1.2.3.4"), limit.hit("1.2.3.4")
    assert retry_after(limit) == 60  # the minute window is full
    clock.now = 60
    limit.hit("1.2.3.4")
    clock.now = 120
    assert retry_after(limit) == 86400 - 120  # the day window is full though the minute window has room


def test_clients_idle_past_every_window_are_forgotten():
    clock = Clock()
    limit = RateLimit([(5, 60)], clock)
    limit.hit("1.2.3.4")
    clock.now = 61
    limit.hit("5.6.7.8")
    assert list(limit.hits) == ["5.6.7.8"]


def test_idle_clients_are_swept_at_most_once_a_minute():
    clock = Clock()
    limit = RateLimit([(5, 60)], clock)
    limit.hit("1.2.3.4")  # at 0
    clock.now = 10
    limit.hit("5.6.7.8")
    clock.now = 60
    limit.hit("9.9.9.9")  # sweeps; 5.6.7.8 is still inside its window
    clock.now = 100
    limit.hit("9.9.9.9")
    assert "5.6.7.8" in limit.hits  # idle past the window, but the last sweep was under a minute ago
    clock.now = 120
    limit.hit("9.9.9.9")
    assert list(limit.hits) == ["9.9.9.9"]


def test_ipv6_addresses_in_one_64_share_a_window():
    limit = RateLimit([(1, 60)], Clock())
    limit.hit(rate_key("2001:db8:1:2::1"))
    assert retry_after(limit, rate_key("2001:db8:1:2:ffff:ffff:ffff:ffff")) == 60
    limit.hit(rate_key("2001:db8:1:3::1"))  # another /64 has its own window


@pytest.mark.parametrize(
    ("ip", "key"),
    [
        ("2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"),
        ("::ffff:1.2.3.4", "1.2.3.4"),  # an IPv4 address mapped into IPv6 counts as the IPv4 address
        ("1.2.3.4", "1.2.3.4"),
        ("unknown", "unknown"),  # a header value that isn't an address counts as it is
    ],
    ids=["ipv6", "mapped-ipv4", "ipv4", "not-an-address"],
)
def test_rate_key(ip, key):
    assert rate_key(ip) == key


def test_the_budget_runs_out_at_its_limit_and_resets_at_utc_midnight():
    clock = Clock()
    clock.now = datetime(2026, 10, 4, 23, 59, tzinfo=UTC).timestamp()
    budget = DailyBudget(1.0, clock)
    budget.add(0.6)
    assert not budget.exhausted()
    budget.add(0.4)
    assert budget.exhausted()
    clock.now = datetime(2026, 10, 5, 0, 0, tzinfo=UTC).timestamp()
    assert not budget.exhausted() and budget.spent == 0


def test_no_budget_never_runs_out():
    budget = DailyBudget(None)
    budget.add(1_000_000)
    assert not budget.exhausted()


def test_metered_provider_adds_each_call_cost_and_passes_everything_else_through():
    provider = ScriptedProvider(reply("one"), reply("two"))
    provider.prices = Prices(input=1000, output=1000, cache_read=1000, cache_write=0)  # $0.001 per token
    budget = DailyBudget(1.0)
    metered = MeteredProvider(provider, budget)
    for _ in range(2):
        asyncio.run(metered.complete("system", [], []))
    assert budget.spent == pytest.approx(2 * 0.2)  # 100 input + 20 output + 80 cache-read tokens per call
    assert (metered.name, metered.prices, metered.user_message("hi")) == ("scripted", provider.prices, {"user": "hi"})
