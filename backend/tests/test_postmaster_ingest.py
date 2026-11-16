"""Unit tests for the Postmaster ingest task + OAuth client."""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest_asyncio.fixture
async def session():
    from app.db import models  # noqa: F401  — register models
    from app.db.base import Base

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


def _make_credential(*, workspace_id: uuid.UUID, domain: str, active: bool = True):
    """Build a Postmaster DomainCredential with a real Fernet-encrypted refresh token."""
    from app.db.models.domain_credentials import DomainCredential
    from app.services.crypto import get_fernet_service

    fernet = get_fernet_service()
    encrypted = fernet.encrypt(b"fake_refresh_token_value")
    return DomainCredential(
        workspace_id=workspace_id,
        domain=domain,
        provider="postmaster",
        refresh_token_encrypted=encrypted,
        is_active=active,
        last_status="connected" if active else "disconnected",
    )


# ────────────────────────────────────────────────────────────────────────
# OAuth client tests
# ────────────────────────────────────────────────────────────────────────


async def test_oauth_url_includes_postmaster_scope():
    from app.services import postmaster_client

    url = await postmaster_client.get_oauth_url("ws:domain:nonce")
    assert "scope=" in url
    # URL-encoded scope param. Must be the traffic-only scope: it is the
    # narrowest one covering our single call (domains/*/trafficStats/*), and
    # the bare "postmaster" / "postmaster.domain" scopes would additionally
    # grant domain and domain-user management we never use.
    assert "postmaster.traffic.readonly" in url
    assert "postmaster.domain" not in url
    assert "state=ws%3Adomain%3Anonce" in url
    assert "access_type=offline" in url


# ────────────────────────────────────────────────────────────────────────
# Ingest tests
# ────────────────────────────────────────────────────────────────────────


_FAKE_TRAFFIC_STATS = {
    "spammyFeedbackLoops": 0.0001,
    "domainReputation": "HIGH",
    "spfSuccessRatio": 0.99,
    "dkimSuccessRatio": 0.98,
    "dmarcSuccessRatio": 0.95,
    "ipReputations": [
        {"reputation": "HIGH", "ipCount": "3"},
        {"reputation": "MEDIUM", "ipCount": "1"},
    ],
}


async def _patch_session(monkeypatch_target_session):
    """Return a context manager that patches SessionLocal in the ingest task."""

    class _Maker:
        def __call__(self):
            return _Ctx(monkeypatch_target_session)

    class _Ctx:
        def __init__(self, sess):
            self._sess = sess

        async def __aenter__(self):
            return self._sess

        async def __aexit__(self, *exc):
            return False

    return _Maker()


async def test_ingest_stores_snapshot(session: AsyncSession):
    from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
    from app.tasks import postmaster_ingest

    ws = uuid.uuid4()
    cred = _make_credential(workspace_id=ws, domain="acme.com")
    session.add(cred)
    await session.commit()

    maker = await _patch_session(session)

    with patch.object(postmaster_ingest, "SessionLocal", maker), \
         patch(
             "app.services.postmaster_client.refresh_access_token",
             AsyncMock(return_value="access_token_xyz"),
         ), \
         patch(
             "app.services.postmaster_client.fetch_traffic_stats",
             AsyncMock(return_value=_FAKE_TRAFFIC_STATS),
         ), \
         patch(
             "app.services.notifications_dispatch.fire",
             AsyncMock(return_value=None),
         ):
        summary = await postmaster_ingest._impl(
            now=dt.datetime(2026, 5, 15, 3, 0, tzinfo=dt.UTC)
        )

    assert summary["processed"] == 1
    assert summary["ok"] == 1
    assert summary["failed"] == 0

    rows = (
        await session.execute(
            select(DomainReputationSnapshot).where(
                DomainReputationSnapshot.workspace_id == ws,
                DomainReputationSnapshot.domain == "acme.com",
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    snap = rows[0]
    assert snap.provider == "postmaster"
    assert snap.date == dt.date(2026, 5, 14)
    assert float(snap.spam_rate) == pytest.approx(0.0001, rel=1e-3)
    assert snap.domain_reputation == "HIGH"
    assert snap.ip_reputation == "HIGH"
    assert float(snap.auth_pass_pct) == pytest.approx(
        (0.99 + 0.98 + 0.95) / 3 * 100, rel=1e-3
    )

    # last_status / last_pulled_at projection updated
    await session.refresh(cred)
    assert cred.last_status == "ok"
    assert cred.last_pulled_at is not None


async def test_ingest_fires_spam_rate_spike_above_threshold(session: AsyncSession):
    from app.tasks import postmaster_ingest

    ws = uuid.uuid4()
    cred = _make_credential(workspace_id=ws, domain="bad.example")
    session.add(cred)
    await session.commit()

    hot_stats = dict(_FAKE_TRAFFIC_STATS)
    hot_stats["spammyFeedbackLoops"] = 0.005  # well above 0.001 red threshold

    fire_mock = AsyncMock(return_value=None)
    maker = await _patch_session(session)

    with patch.object(postmaster_ingest, "SessionLocal", maker), \
         patch(
             "app.services.postmaster_client.refresh_access_token",
             AsyncMock(return_value="tok"),
         ), \
         patch(
             "app.services.postmaster_client.fetch_traffic_stats",
             AsyncMock(return_value=hot_stats),
         ), \
         patch("app.services.notifications_dispatch.fire", fire_mock):
        await postmaster_ingest._impl(
            now=dt.datetime(2026, 5, 15, 3, 0, tzinfo=dt.UTC)
        )

    assert fire_mock.await_count == 1
    args, kwargs = fire_mock.await_args
    event, payload = args[0], args[1]
    assert event == "spam_rate_spike"
    assert payload["domain"] == "bad.example"
    assert payload["source"] == "postmaster"
    assert payload["rate"] == pytest.approx(0.005, rel=1e-3)
    assert payload["workspace_id"] == str(ws)


async def test_ingest_skips_revoked_credentials(session: AsyncSession):
    from app.tasks import postmaster_ingest

    ws = uuid.uuid4()
    cred = _make_credential(workspace_id=ws, domain="dead.example", active=False)
    session.add(cred)
    await session.commit()

    refresh_mock = AsyncMock(return_value="tok")
    fetch_mock = AsyncMock(return_value=_FAKE_TRAFFIC_STATS)
    maker = await _patch_session(session)

    with patch.object(postmaster_ingest, "SessionLocal", maker), \
         patch("app.services.postmaster_client.refresh_access_token", refresh_mock), \
         patch("app.services.postmaster_client.fetch_traffic_stats", fetch_mock):
        summary = await postmaster_ingest._impl(
            now=dt.datetime(2026, 5, 15, 3, 0, tzinfo=dt.UTC)
        )

    assert summary["processed"] == 0
    assert refresh_mock.await_count == 0
    assert fetch_mock.await_count == 0


async def test_ingest_is_idempotent_on_repeat(session: AsyncSession):
    """Running the same day twice must not insert duplicate snapshots."""
    from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
    from app.tasks import postmaster_ingest

    ws = uuid.uuid4()
    cred = _make_credential(workspace_id=ws, domain="acme.com")
    session.add(cred)
    await session.commit()

    maker = await _patch_session(session)

    with patch.object(postmaster_ingest, "SessionLocal", maker), \
         patch(
             "app.services.postmaster_client.refresh_access_token",
             AsyncMock(return_value="tok"),
         ), \
         patch(
             "app.services.postmaster_client.fetch_traffic_stats",
             AsyncMock(return_value=_FAKE_TRAFFIC_STATS),
         ):
        await postmaster_ingest._impl(
            now=dt.datetime(2026, 5, 15, 3, 0, tzinfo=dt.UTC)
        )
        await postmaster_ingest._impl(
            now=dt.datetime(2026, 5, 15, 3, 0, tzinfo=dt.UTC)
        )

    rows = (
        await session.execute(
            select(DomainReputationSnapshot).where(
                DomainReputationSnapshot.workspace_id == ws,
            )
        )
    ).scalars().all()
    assert len(rows) == 1
