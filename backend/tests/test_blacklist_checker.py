"""Unit tests for services/blacklist_checker.

The only network seam is ``_resolve_a`` — every test monkeypatches it with a
deterministic dict so no real DNS is hit. ``MAILBOX_PROBES_DUMMY=false`` is set
by conftest, so the live code path runs (the dummy short-circuit is covered by
its own test that flips the setting).
"""
from __future__ import annotations

import app.services.blacklist_checker as bl


def _fake_resolver(mapping: dict[str, list[str]]):
    """Build an async _resolve_a replacement backed by ``mapping``.

    Missing names resolve to [] (NXDOMAIN/clear), exactly like the real one.
    """

    async def _fake(name: str) -> list[str]:
        return mapping.get(name, [])

    return _fake


def test_reverse_ipv4():
    assert bl._reverse_ipv4("1.2.3.4") == "4.3.2.1"
    assert bl._reverse_ipv4("not-an-ip") is None
    assert bl._reverse_ipv4("1.2.3") is None


def test_listed_from_answers_distinguishes_hits_from_error_codes():
    assert bl._listed_from_answers(["127.0.0.2"]) is True
    assert bl._listed_from_answers(["127.0.0.11"]) is True
    # 127.255.255.x is the provider "query blocked / rate limited" range — not a listing.
    assert bl._listed_from_answers(["127.255.255.254"]) is False
    assert bl._listed_from_answers([]) is False
    assert bl._listed_from_answers(["93.184.216.34"]) is False


async def test_clean_domain_has_no_hits(monkeypatch):
    # Domain resolves to an IP, but no DNSBL zone returns anything → all clear.
    mapping = {"good.com": ["93.184.216.34"]}
    monkeypatch.setattr(bl, "_resolve_a", _fake_resolver(mapping))

    res = await bl.check_domain_blacklists("good.com")

    assert res.domain == "good.com"
    assert res.checked_ip == "93.184.216.34"
    assert res.hits == []
    assert all(p.listed is False for p in res.providers)
    # Envelope keeps the legacy keys + adds the new ones.
    env = res.to_envelope()
    assert env["hits"] == []
    assert "Spamhaus ZEN" in env["checked_against"]
    assert env["checked_ip"] == "93.184.216.34"
    assert {"name", "listed"} <= set(env["providers"][0].keys())


async def test_ip_listing_is_detected(monkeypatch):
    # IP 11.22.33.44 → reversed 44.33.22.11; list it on Barracuda's zone.
    barracuda = next(p for p in bl.PROVIDERS if p.name == "Barracuda")
    mapping = {
        "bad.com": ["11.22.33.44"],
        f"44.33.22.11.{barracuda.zone}": ["127.0.0.2"],
    }
    monkeypatch.setattr(bl, "_resolve_a", _fake_resolver(mapping))

    res = await bl.check_domain_blacklists("bad.com")

    assert "Barracuda" in res.hits
    assert res.checked_ip == "11.22.33.44"
    listed = {p.name for p in res.providers if p.listed}
    assert listed == {"Barracuda"}


async def test_domain_based_listing_is_detected(monkeypatch):
    # Spamhaus DBL is domain-based: query is "<domain>.<zone>", no IP needed.
    dbl = next(p for p in bl.PROVIDERS if p.kind == "domain")
    mapping = {
        "spammy.com": ["198.51.100.7"],
        f"spammy.com.{dbl.zone}": ["127.0.1.2"],
    }
    monkeypatch.setattr(bl, "_resolve_a", _fake_resolver(mapping))

    res = await bl.check_domain_blacklists("spammy.com")

    assert dbl.name in res.hits


async def test_error_code_is_not_a_hit(monkeypatch):
    barracuda = next(p for p in bl.PROVIDERS if p.name == "Barracuda")
    mapping = {
        "x.com": ["11.22.33.44"],
        f"44.33.22.11.{barracuda.zone}": ["127.255.255.254"],  # blocked, not listed
    }
    monkeypatch.setattr(bl, "_resolve_a", _fake_resolver(mapping))

    res = await bl.check_domain_blacklists("x.com")

    assert res.hits == []


async def test_unresolvable_domain_reports_clear_ip_lists(monkeypatch):
    # No A record at all → IP-based lists can't be evaluated, report clear.
    monkeypatch.setattr(bl, "_resolve_a", _fake_resolver({}))

    res = await bl.check_domain_blacklists("ghost.invalid")

    assert res.checked_ip is None
    assert res.hits == []


async def test_dummy_mode_skips_network(monkeypatch):
    # Flip the probe-dummy flag; _resolve_a must never be called.
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "mailbox_probes_dummy", True, raising=False)

    async def _boom(name: str):  # pragma: no cover — must not run
        raise AssertionError("network hit in dummy mode")

    monkeypatch.setattr(bl, "_resolve_a", _boom)

    res = await bl.check_domain_blacklists("anything.com")

    assert res.hits == []
    assert all(p.listed is False for p in res.providers)
