"""Tests for the best-effort Redis cache in ``blacklist_checker``.

Regression tests for the down-latch (commit 9c6d9be) and the decode-error
distinction: a connection failure latches for one 60s window (subsequent
checks return without touching the client), the latch clears once the
window expires, and a *data* error from healthy Redis (corrupt cached
value → json.JSONDecodeError) is a plain cache miss — never a latch.

Hermetic: the module's ``_redis_client`` is replaced with a fake whose
``get`` either raises or returns canned bytes; ``time`` inside the module
is a controllable fake when the test needs to cross the latch window.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import blacklist_checker


class FakeRedis:
    def __init__(self, *, side_effect=None, value: str | None = None):
        self.side_effect = side_effect
        self.value = value
        self.get_calls = 0

    def get(self, key: str) -> str | None:
        self.get_calls += 1
        if self.side_effect is not None:
            raise self.side_effect
        return self.value


@pytest.fixture(autouse=True)
def _reset_cache_state(monkeypatch):
    """Fresh latch state per test; never construct a real client."""
    monkeypatch.setattr(blacklist_checker, "_redis_down_until", 0.0)
    yield
    blacklist_checker._redis_client = None
    blacklist_checker._redis_down_until = 0.0


def test_first_connection_error_latches_and_skips_client(monkeypatch):
    """First failure latches; further checks return without touching Redis."""
    fake = FakeRedis(side_effect=ConnectionError("redis gone"))
    monkeypatch.setattr(blacklist_checker, "_redis_client", fake)

    assert blacklist_checker.cache_hits_get("a.com") is None  # first failure
    assert blacklist_checker.cache_hits_get("a.com") is None  # latched — no client call
    assert blacklist_checker.cache_hits_get("b.com") is None

    assert fake.get_calls == 1  # exactly one touch, then the latch short-circuits
    assert blacklist_checker._redis_client is None  # client dropped for a reconnect later


def test_latch_clears_after_window(monkeypatch):
    """The latch opens again once the 60s window expires."""
    clock = SimpleNamespace(monotonic=lambda: 1000.0)
    monkeypatch.setattr(blacklist_checker, "time", clock)
    fake = FakeRedis(side_effect=ConnectionError("redis gone"))
    monkeypatch.setattr(blacklist_checker, "_redis_client", fake)

    blacklist_checker.cache_hits_get("a.com")  # latches until monotonic 1060.0
    assert fake.get_calls == 1

    clock.monotonic = lambda: 1000.0 + blacklist_checker._REDIS_DOWN_LATCH_S - 1
    blacklist_checker.cache_hits_get("a.com")  # still inside the window
    assert fake.get_calls == 1

    clock.monotonic = lambda: 1000.0 + blacklist_checker._REDIS_DOWN_LATCH_S + 1
    # the latch dropped the client; simulate the post-window reconnect by
    # handing the module a fresh client instance, then prove it gets used
    monkeypatch.setattr(blacklist_checker, "_redis_client", fake)
    blacklist_checker.cache_hits_get("a.com")  # window expired → retry the client
    assert fake.get_calls == 2


def test_corrupt_cached_value_is_miss_not_down_latch(monkeypatch):
    """json.JSONDecodeError with healthy Redis = cache miss, NOT an outage:
    the client survives and the next check still uses the cache."""
    fake = FakeRedis(value="{corrupt json")
    monkeypatch.setattr(blacklist_checker, "_redis_client", fake)

    assert blacklist_checker.cache_hits_get("a.com") is None  # miss, no raise
    assert blacklist_checker.cache_hits_get("a.com") is None

    assert fake.get_calls == 2  # never latched — Redis kept being consulted
    assert blacklist_checker._redis_client is fake  # healthy client not dropped
    assert blacklist_checker._redis_down_until == 0.0  # no latch armed


def test_non_list_cached_value_is_miss(monkeypatch):
    """A structurally wrong payload (valid JSON, not a list) is also a miss."""
    fake = FakeRedis(value=json.dumps({"oops": True}))
    monkeypatch.setattr(blacklist_checker, "_redis_client", fake)

    assert blacklist_checker.cache_hits_get("a.com") is None
    assert fake.get_calls == 1
    assert blacklist_checker._redis_down_until == 0.0


def test_valid_cached_hits_round_trip(monkeypatch):
    """Sanity: a well-formed cached hit list is returned verbatim."""
    fake = FakeRedis(value=json.dumps(["Spamhaus ZEN", "Barracuda"]))
    monkeypatch.setattr(blacklist_checker, "_redis_client", fake)

    assert blacklist_checker.cache_hits_get("listed.com") == ["Spamhaus ZEN", "Barracuda"]
