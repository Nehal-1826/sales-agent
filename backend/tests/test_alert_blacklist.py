"""Tests for the blacklist branch of the hourly alert scan.

Exercises ``alert_check._check_blacklist_listings`` against a seeded mailbox.
The DNS checker and both Redis seams are monkeypatched so the test is
hermetic (no network, no Redis) and fast.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

import app.tasks.alert_check as alert_check
from app.db.models.mailboxes import Mailbox, MailboxProvider
from app.services import blacklist_checker
from app.services.blacklist_checker import (
    DomainBlacklistResult,
    ProviderResult,
)


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    """No Redis: dedupe never blocks, cache writes are no-ops."""
    monkeypatch.setattr(alert_check, "_redis_client_or_none", lambda: None)
    monkeypatch.setattr(blacklist_checker, "cache_hits_put", lambda *a, **k: None)


def _result(domain: str, hits: list[str]) -> DomainBlacklistResult:
    providers = [
        ProviderResult(p.name, p.zone, p.kind, p.name in hits)
        for p in blacklist_checker.PROVIDERS
    ]
    return DomainBlacklistResult(domain, "1.2.3.4", providers, hits, datetime.now(UTC))


async def _seed_mailbox(session, *, workspace_id: uuid.UUID, email: str) -> None:
    session.add(
        Mailbox(
            user_id=uuid.uuid4(),
            workspace_id=workspace_id,
            email_address=email,
            provider=MailboxProvider.smtp,
        )
    )
    await session.commit()


async def test_listed_domain_produces_alert(db_session, monkeypatch):
    ws = uuid.uuid4()
    await _seed_mailbox(db_session, workspace_id=ws, email="sales@acme.com")

    async def _fake_check(domain: str):
        return _result(domain, ["Spamhaus ZEN", "Barracuda"])

    monkeypatch.setattr(blacklist_checker, "check_domain_blacklists", _fake_check)

    alerts = await alert_check._check_blacklist_listings(db_session)

    assert len(alerts) == 1
    alert = alerts[0]
    assert alert["event"] == "warmup.blacklisted"
    assert alert["workspace_id"] == str(ws)
    assert "acme.com" in alert["body"]
    assert "Spamhaus ZEN" in alert["body"]
    assert "Barracuda" in alert["body"]


async def test_clean_domain_produces_no_alert(db_session, monkeypatch):
    await _seed_mailbox(db_session, workspace_id=uuid.uuid4(), email="hi@clean.com")

    async def _fake_check(domain: str):
        return _result(domain, [])

    monkeypatch.setattr(blacklist_checker, "check_domain_blacklists", _fake_check)

    alerts = await alert_check._check_blacklist_listings(db_session)

    assert alerts == []


async def test_dedupe_suppresses_repeat_alert(db_session, monkeypatch):
    ws = uuid.uuid4()
    await _seed_mailbox(db_session, workspace_id=ws, email="sales@listed.com")

    async def _fake_check(domain: str):
        return _result(domain, ["SpamCop"])

    monkeypatch.setattr(blacklist_checker, "check_domain_blacklists", _fake_check)
    # Simulate "already alerted today" → the scan must skip it.
    monkeypatch.setattr(alert_check, "_blacklist_already_alerted", lambda ws_id, d: True)

    alerts = await alert_check._check_blacklist_listings(db_session)

    assert alerts == []


async def test_one_domain_per_workspace_dedup(db_session, monkeypatch):
    # Two mailboxes on the same domain in one workspace → a single alert.
    ws = uuid.uuid4()
    await _seed_mailbox(db_session, workspace_id=ws, email="a@dup.com")
    await _seed_mailbox(db_session, workspace_id=ws, email="b@dup.com")

    calls: list[str] = []

    async def _fake_check(domain: str):
        calls.append(domain)
        return _result(domain, ["SORBS"])

    monkeypatch.setattr(blacklist_checker, "check_domain_blacklists", _fake_check)

    alerts = await alert_check._check_blacklist_listings(db_session)

    assert calls == ["dup.com"]  # domain de-duplicated before the DNS lookup
    assert len(alerts) == 1


async def test_checker_failure_is_swallowed(db_session, monkeypatch):
    await _seed_mailbox(db_session, workspace_id=uuid.uuid4(), email="x@boom.com")

    async def _explode(domain: str):
        raise RuntimeError("dns exploded")

    monkeypatch.setattr(blacklist_checker, "check_domain_blacklists", _explode)

    # Must not raise — one bad domain can't take down the whole scan.
    alerts = await alert_check._check_blacklist_listings(db_session)
    assert alerts == []
