"""Tests for the DNS validator service and the DNS-check HTTP endpoints.

All DNS I/O is mocked via ``unittest.mock.patch`` on
``app.services.dns_validator.dns.resolver.resolve`` - we never touch a real
resolver. The route tests reuse the shared-in-memory-sqlite pattern from
``test_auth.py`` so each test gets a fresh app + fresh DB + fresh override.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import MagicMock, patch

import dns.resolver
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.services import dns_validator
from app.services.dns_validator import DKIM_FIX, DMARC_FIX, SPF_FIX


@pytest.fixture(autouse=True)
def _clear_dns_check_cache():
    """Reset the in-process check_domain cache between tests so prior results
    can't bleed into the next case (which mocks the resolver differently)."""
    dns_validator._check_cache.clear()
    yield
    dns_validator._check_cache.clear()

# --------------------------------------------------------------------------- #
# dns.resolver.Answer mock helpers                                             #
# --------------------------------------------------------------------------- #


def make_txt_answer(records: list[str]):
    """Build a mock dns.resolver.Answer whose iteration yields rdata with
    a ``strings`` attribute (bytes tuple)."""
    answer = MagicMock()
    rdatas = [MagicMock(strings=[r.encode()]) for r in records]
    answer.__iter__ = lambda self: iter(rdatas)
    return answer


def make_resolver_side_effect(mapping: dict[str, object]):
    """Build a side_effect callable for dns.resolver.resolve.

    ``mapping`` is ``{qname: answer_or_exception}``. Unmapped names raise
    NXDOMAIN so the DKIM fallback loop can be exercised deterministically.
    """

    def _resolve(qname, rdtype, lifetime=None):  # noqa: ARG001
        if qname not in mapping:
            raise dns.resolver.NXDOMAIN(f"mock: no entry for {qname}")
        val = mapping[qname]
        if isinstance(val, Exception):
            raise val
        return val

    return _resolve


# --------------------------------------------------------------------------- #
# Service-level SPF tests                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_spf_valid_soft_fail() -> None:
    side = make_resolver_side_effect(
        {"example.com": make_txt_answer(["v=spf1 include:_spf.google.com ~all"])}
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_spf("example.com")
    assert result.valid is True
    assert result.warnings == []
    assert result.record and result.record.endswith("~all")


@pytest.mark.asyncio
async def test_spf_warning_on_plus_all() -> None:
    side = make_resolver_side_effect(
        {"example.com": make_txt_answer(["v=spf1 include:_spf.google.com +all"])}
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_spf("example.com")
    assert result.valid is True
    assert any("+all" in w for w in result.warnings)


@pytest.mark.asyncio
async def test_spf_invalid_on_multiple_records() -> None:
    side = make_resolver_side_effect(
        {
            "example.com": make_txt_answer(
                [
                    "v=spf1 include:_spf.google.com ~all",
                    "v=spf1 include:mailgun.org ~all",
                ]
            )
        }
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_spf("example.com")
    assert result.valid is False
    assert any("Multiple SPF" in e for e in result.errors)


@pytest.mark.asyncio
async def test_spf_invalid_on_missing_record() -> None:
    # Empty TXT answer: no v=spf1 line.
    side = make_resolver_side_effect(
        {"example.com": make_txt_answer(["something-else=foo"])}
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_spf("example.com")
    assert result.valid is False
    assert any("No SPF record" in e for e in result.errors)


# --------------------------------------------------------------------------- #
# DMARC                                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_dmarc_valid_quarantine() -> None:
    side = make_resolver_side_effect(
        {
            "_dmarc.example.com": make_txt_answer(
                ["v=DMARC1; p=quarantine; rua=mailto:x@x.com"]
            )
        }
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_dmarc("example.com")
    assert result.valid is True
    assert result.policy == "quarantine"
    assert result.warnings == []


@pytest.mark.asyncio
async def test_dmarc_warning_on_policy_none() -> None:
    side = make_resolver_side_effect(
        {
            "_dmarc.example.com": make_txt_answer(
                ["v=DMARC1; p=none; rua=mailto:x@x.com"]
            )
        }
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_dmarc("example.com")
    assert result.valid is False  # monitoring only
    assert result.policy == "none"
    assert any("none" in w for w in result.warnings)


@pytest.mark.asyncio
async def test_dmarc_missing_rua_warning() -> None:
    side = make_resolver_side_effect(
        {"_dmarc.example.com": make_txt_answer(["v=DMARC1; p=reject"])}
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_dmarc("example.com")
    assert result.valid is True
    assert result.policy == "reject"
    assert any("aggregate reporting" in w for w in result.warnings)


# --------------------------------------------------------------------------- #
# DKIM                                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_dkim_tries_fallback_selectors() -> None:
    # default + google miss (NXDOMAIN), selector1 hits.
    side = make_resolver_side_effect(
        {
            "selector1._domainkey.example.com": make_txt_answer(
                ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA"]
            ),
        }
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_dkim("example.com", selector="default")
    assert result.valid is True
    assert result.selector == "selector1"


@pytest.mark.asyncio
async def test_dkim_invalid_when_all_selectors_fail() -> None:
    # Empty mapping -> every resolve raises NXDOMAIN.
    side = make_resolver_side_effect({})
    with patch.object(dns.resolver, "resolve", side_effect=side):
        result = await dns_validator.check_dkim("example.com", selector="default")
    assert result.valid is False
    assert any("No DKIM record" in e for e in result.errors)


# --------------------------------------------------------------------------- #
# Timeout / wait_for                                                           #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_timeout_returns_partial_with_error() -> None:
    async def _boom(*_a, **_k):
        raise TimeoutError

    with patch.object(dns_validator, "_run_all", side_effect=_boom):
        result = await dns_validator.check_domain("slow.example.com")
    assert result.timed_out is True
    assert result.spf.valid is False
    assert result.dkim.valid is False
    assert result.dmarc.valid is False
    assert any("timed out" in e.lower() for e in result.spf.errors)


# --------------------------------------------------------------------------- #
# Endpoint tests (shared in-memory SQLite + app override)                      #
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def app_and_client() -> AsyncIterator[tuple[object, AsyncClient]]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.notifications import Notification
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.session import get_db
    from app.main import create_app

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Notification is needed because mailbox_service.delete_mailbox now writes
    # a "mailbox_disconnected" inbox row.
    tables = [t.__table__ for t in (User, Plan, AuditLog, Mailbox, Notification)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            try:
                yield session
            finally:
                await session.close()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield maker, ac

    await engine.dispose()


async def _signup_and_auth(ac: AsyncClient, email: str = "alice@example.com") -> dict:
    resp = await ac.post(
        "/api/auth/signup",
        json={"email": email, "password": "correcthorse"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return {
        "Authorization": f"Bearer {body['tokens']['access_token']}",
        "workspace_id": body["user"]["workspace_id"],
        "user_id": body["user"]["id"],
    }


@pytest.mark.asyncio
async def test_check_endpoint_extracts_domain_from_email(app_and_client) -> None:
    _, ac = app_and_client
    auth = await _signup_and_auth(ac, "u1@example.com")

    side = make_resolver_side_effect(
        {"example.com": make_txt_answer(["v=spf1 include:_spf.google.com ~all"])}
    )
    with patch.object(dns.resolver, "resolve", side_effect=side):
        resp = await ac.post(
            "/api/workspace/dns/check",
            json={"email": "user@example.com"},
            headers={"Authorization": auth["Authorization"]},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["domain"] == "example.com"
    assert body["spf"]["valid"] is True


@pytest.mark.asyncio
async def test_check_request_requires_domain_or_email(app_and_client) -> None:
    _, ac = app_and_client
    auth = await _signup_and_auth(ac, "u2@example.com")
    resp = await ac.post(
        "/api/workspace/dns/check",
        json={},
        headers={"Authorization": auth["Authorization"]},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_fixes_only_present_for_failed_records(app_and_client) -> None:
    _, ac = app_and_client
    auth = await _signup_and_auth(ac, "u3@example.com")

    # SPF passes; DKIM fails (no selector resolves); DMARC passes.
    mapping = {
        "example.com": make_txt_answer(["v=spf1 include:_spf.google.com ~all"]),
        "_dmarc.example.com": make_txt_answer(
            ["v=DMARC1; p=quarantine; rua=mailto:x@x.com"]
        ),
    }
    side = make_resolver_side_effect(mapping)
    with patch.object(dns.resolver, "resolve", side_effect=side):
        resp = await ac.post(
            "/api/workspace/dns/check",
            json={"domain": "example.com"},
            headers={"Authorization": auth["Authorization"]},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["spf"]["valid"] is True
    assert body["dkim"]["valid"] is False
    assert body["dmarc"]["valid"] is True

    assert body["fixes"]["spf"] == []
    assert body["fixes"]["dkim"] == [DKIM_FIX]
    assert body["fixes"]["dmarc"] == []

    assert body["summary"]["passing"] == 2
    assert body["summary"]["total"] == 3
    assert body["summary"]["overall_pass"] is False


@pytest.mark.asyncio
async def test_mailbox_dns_check_persists_flags(app_and_client) -> None:
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus

    maker, ac = app_and_client
    auth = await _signup_and_auth(ac, "u4@example.com")

    # Seed a mailbox scoped to the caller's workspace.
    mailbox_id = uuid.uuid4()
    async with maker() as s:
        mb = Mailbox(
            id=mailbox_id,
            user_id=uuid.UUID(auth["user_id"]),
            workspace_id=uuid.UUID(auth["workspace_id"]),
            email_address="ceo@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.pending,
            daily_target=5,
            current_day=0,
            warmth_score=0.0,
        )
        s.add(mb)
        await s.commit()

    mapping = {
        "example.com": make_txt_answer(["v=spf1 include:_spf.google.com ~all"]),
        "_dmarc.example.com": make_txt_answer(
            ["v=DMARC1; p=quarantine; rua=mailto:x@x.com"]
        ),
        "default._domainkey.example.com": make_txt_answer(
            ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQ"]
        ),
    }
    side = make_resolver_side_effect(mapping)
    with patch.object(dns.resolver, "resolve", side_effect=side):
        resp = await ac.post(
            f"/api/workspace/mailboxes/{mailbox_id}/dns-check",
            headers={"Authorization": auth["Authorization"]},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary"]["overall_pass"] is True

    # Flags persisted to the row.
    async with maker() as s:
        refreshed = await s.get(Mailbox, mailbox_id)
        assert refreshed is not None
        assert refreshed.spf_valid is True
        assert refreshed.dkim_valid is True
        assert refreshed.dmarc_valid is True


@pytest.mark.asyncio
async def test_mailbox_dns_check_404_for_other_workspace(app_and_client) -> None:
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus

    maker, ac = app_and_client
    auth = await _signup_and_auth(ac, "u5@example.com")

    # Mailbox in a *different* workspace.
    other_workspace = uuid.uuid4()
    mailbox_id = uuid.uuid4()
    async with maker() as s:
        mb = Mailbox(
            id=mailbox_id,
            user_id=uuid.UUID(auth["user_id"]),
            workspace_id=other_workspace,
            email_address="ceo@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.pending,
            daily_target=5,
            current_day=0,
            warmth_score=0.0,
        )
        s.add(mb)
        await s.commit()

    resp = await ac.post(
        f"/api/workspace/mailboxes/{mailbox_id}/dns-check",
        headers={"Authorization": auth["Authorization"]},
    )
    assert resp.status_code == 404


# Constants sanity check so the fix strings stay accessible.
def test_fix_constants_nonempty() -> None:
    assert SPF_FIX and "v=spf1" in SPF_FIX
    assert DKIM_FIX and "DKIM" in DKIM_FIX
    assert DMARC_FIX and "v=DMARC1" in DMARC_FIX
