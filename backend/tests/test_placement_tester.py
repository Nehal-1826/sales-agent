"""Tests for the Placement Tester (Pro Plus) feature."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _dedupe_metadata_indexes(base: object) -> None:
    seen: set[str] = set()
    for table in base.metadata.tables.values():
        to_remove = []
        for idx in list(table.indexes):
            if idx.name in seen:
                to_remove.append(idx)
            else:
                seen.add(idx.name)
        for idx in to_remove:
            table.indexes.discard(idx)


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.placement_test_seeds import PlacementTestSeed
    from app.db.models.placement_tests import PlacementTest
    from app.db.models.plans import Plan
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (
            User,
            Plan,
            Mailbox,
            PeerInbox,
            PlacementTest,
            PlacementTestSeed,
            AuditLog,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> (
    AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]
):
    maker, engine = await _setup_db()
    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker, engine
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


async def _make_pro_plus_client(
    maker: async_sessionmaker[AsyncSession],
) -> tuple[object, uuid.UUID]:
    from app.db.models.plans import Plan
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        plan = Plan(name="pro_plus", price_cents=10000, max_mailboxes=5, capabilities={})
        session.add(plan)
        await session.flush()
        user = User(
            email="client@example.com",
            hashed_password=None,
            plan_id=plan.id,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user, user.workspace_id


async def _make_mailbox(
    maker: async_sessionmaker[AsyncSession], *, workspace_id: uuid.UUID, user_id: uuid.UUID
) -> uuid.UUID:
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus

    async with maker() as session:
        mb = Mailbox(
            user_id=user_id,
            workspace_id=workspace_id,
            email_address="sender@example.com",
            provider=MailboxProvider.smtp,
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_username="sender@example.com",
            smtp_password_encrypted=b"placeholder",
            warmup_status=WarmupStatus.active,
            daily_target=5,
            current_day=1,
        )
        session.add(mb)
        await session.commit()
        await session.refresh(mb)
        return mb.id


async def _make_peer(
    maker: async_sessionmaker[AsyncSession],
    *,
    provider: str,
    email: str,
    reputation: float = 1.0,
    is_seed: bool = True,
) -> uuid.UUID:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    prov_map = {
        "gmail": PeerProvider.google_ws,
        "outlook": PeerProvider.office365,
        "yahoo": PeerProvider.yahoo,
    }
    async with maker() as session:
        peer = PeerInbox(
            email_address=email,
            provider=prov_map[provider],
            reputation_score=reputation,
            daily_capacity=50,
            is_active=True,
            is_seed=is_seed,
        )
        session.add(peer)
        await session.commit()
        await session.refresh(peer)
        return peer.id


def _auth_for(user) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Tests                                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_start_test_picks_seeds_across_providers(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, ws = await _make_pro_plus_client(maker)
    mailbox_id = await _make_mailbox(maker, workspace_id=ws, user_id=user.id)
    for i in range(5):
        await _make_peer(maker, provider="gmail", email=f"g{i}@example.com")
        await _make_peer(maker, provider="outlook", email=f"o{i}@example.com")
        await _make_peer(maker, provider="yahoo", email=f"y{i}@example.com")

    # Suppress real Celery enqueue.
    with patch(
        "app.tasks.placement_send.send_probe.apply_async"
    ), patch("app.tasks.placement_poll.poll.apply_async"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                "/api/workspace/placement-tests",
                json={"mailbox_id": str(mailbox_id)},
                headers=_auth_for(user),
            )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["seed_count"] == 15
    assert body["status"] in ("running", "completed")

    # Verify provider mix in seed_set.
    from app.db.models.placement_tests import PlacementTest

    async with maker() as session:
        test = (await session.execute(select(PlacementTest))).scalar_one()
        providers = test.seed_set["providers"]
        # All three providers represented with 5 each.
        assert providers.get("google_ws") == 5
        assert providers.get("office365") == 5
        assert providers.get("yahoo") == 5


@pytest.mark.asyncio
async def test_send_probe_writes_message_id_and_seed_row(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, ws = await _make_pro_plus_client(maker)
    mailbox_id = await _make_mailbox(maker, workspace_id=ws, user_id=user.id)
    peer_id = await _make_peer(maker, provider="gmail", email="seed@example.com")

    # Manually create a test + seed row (bypass enqueue).
    from app.db.models.placement_test_seeds import PlacementTestSeed
    from app.db.models.placement_tests import PlacementTest

    async with maker() as session:
        t = PlacementTest(
            mailbox_id=mailbox_id,
            workspace_id=ws,
            seed_set={"seed_count": 1, "providers": {"google_ws": 1}},
            status="running",
            sent_at=datetime.now(UTC),
        )
        session.add(t)
        await session.flush()
        seed = PlacementTestSeed(test_id=t.id, seed_peer_id=peer_id, status="pending")
        session.add(seed)
        await session.commit()
        test_id = t.id

    # Patch SessionLocal used inside the task to our test maker.
    import app.tasks.placement_send as ps

    mock_send = AsyncMock(return_value={"message_id": "x", "sent_at": datetime.now(UTC)})
    with patch.object(ps, "SessionLocal", maker), patch.object(
        ps, "send_email", mock_send
    ), patch.object(ps, "get_fernet_service", lambda: None):
        result = await ps._impl(str(test_id), str(peer_id))

    assert result["status"] == "sent"
    expected_mid = f"<placement-{test_id}-{peer_id}@warmpulse.io>"
    assert result["message_id"] == expected_mid

    async with maker() as session:
        row = (
            await session.execute(
                select(PlacementTestSeed).where(PlacementTestSeed.test_id == test_id)
            )
        ).scalar_one()
        assert row.status == "sent"
        assert row.message_id == expected_mid

    # Verify send_email called with custom_message_id.
    assert mock_send.await_count == 1
    kwargs = mock_send.await_args.kwargs
    assert kwargs["custom_message_id"] == expected_mid


@pytest.mark.asyncio
async def test_poll_marks_inbox_when_imap_returns_inbox_folder(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, ws = await _make_pro_plus_client(maker)
    mailbox_id = await _make_mailbox(maker, workspace_id=ws, user_id=user.id)
    peer_id = await _make_peer(maker, provider="gmail", email="seed@example.com")

    from app.db.models.placement_test_seeds import PlacementTestSeed
    from app.db.models.placement_tests import PlacementTest

    async with maker() as session:
        t = PlacementTest(
            mailbox_id=mailbox_id,
            workspace_id=ws,
            seed_set={"seed_count": 1},
            status="running",
            sent_at=datetime.now(UTC),
        )
        session.add(t)
        await session.flush()
        seed = PlacementTestSeed(
            test_id=t.id,
            seed_peer_id=peer_id,
            status="sent",
            message_id=f"<placement-{t.id}-{peer_id}@warmpulse.io>",
        )
        session.add(seed)
        await session.commit()
        test_id = t.id

    import app.services.placement_service as svc
    import app.tasks.placement_poll as pp

    with patch.object(pp, "SessionLocal", maker), patch.object(
        svc, "SessionLocal", maker
    ), patch.object(
        pp, "find_message_in_any_folder", AsyncMock(return_value=("INBOX", 1))
    ), patch.object(pp, "get_fernet_service", lambda: None), patch.object(
        svc.notifications_dispatch, "fire", AsyncMock()
    ):
        result = await pp._impl(str(test_id))

    assert result["status"] == "finalized"
    async with maker() as session:
        row = (
            await session.execute(
                select(PlacementTestSeed).where(PlacementTestSeed.test_id == test_id)
            )
        ).scalar_one()
        assert row.status == "inbox"
        assert row.landed_folder == "INBOX"
        assert row.landed_at is not None


@pytest.mark.asyncio
async def test_finalize_aggregates_counts_and_fires_webhook(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, ws = await _make_pro_plus_client(maker)
    mailbox_id = await _make_mailbox(maker, workspace_id=ws, user_id=user.id)
    peer_ids = []
    for i in range(5):
        peer_ids.append(
            await _make_peer(maker, provider="gmail", email=f"p{i}@example.com")
        )

    from app.db.models.placement_test_seeds import PlacementTestSeed
    from app.db.models.placement_tests import PlacementTest

    async with maker() as session:
        t = PlacementTest(
            mailbox_id=mailbox_id,
            workspace_id=ws,
            seed_set={"seed_count": 5},
            status="running",
            sent_at=datetime.now(UTC),
        )
        session.add(t)
        await session.flush()
        # 3 inbox + 2 spam.
        statuses = ["inbox", "inbox", "inbox", "spam", "spam"]
        for pid, st in zip(peer_ids, statuses):
            session.add(
                PlacementTestSeed(
                    test_id=t.id, seed_peer_id=pid, status=st,
                    landed_folder="INBOX" if st == "inbox" else "Spam",
                )
            )
        await session.commit()
        test_id = t.id

    import app.services.placement_service as svc

    fire_mock = AsyncMock()
    with patch.object(svc, "SessionLocal", maker), patch.object(
        svc.notifications_dispatch, "fire", fire_mock
    ):
        results = await svc.finalize_test(test_id)

    assert results["inbox"] == 3
    assert results["spam"] == 2
    assert results["promotions"] == 0
    assert results["total_seeds"] == 5

    # Webhook event fired.
    assert fire_mock.await_count == 1
    event, payload = fire_mock.await_args.args
    assert event == "placement_test_completed"
    assert payload["test_id"] == str(test_id)
    assert payload["results"]["inbox"] == 3

    async with maker() as session:
        refreshed = await session.get(PlacementTest, test_id)
        assert refreshed.status == "completed"
        assert refreshed.results["inbox"] == 3


@pytest.mark.asyncio
async def test_start_test_enforces_monthly_cap_with_402(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user, ws = await _make_pro_plus_client(maker)
    mailbox_id = await _make_mailbox(maker, workspace_id=ws, user_id=user.id)
    await _make_peer(maker, provider="gmail", email="g@example.com")

    # Backfill 50 completed tests this month for this workspace.
    from app.db.models.placement_tests import PlacementTest

    async with maker() as session:
        for i in range(50):
            session.add(
                PlacementTest(
                    mailbox_id=mailbox_id,
                    workspace_id=ws,
                    seed_set={},
                    status="completed",
                    sent_at=datetime.now(UTC),
                )
            )
        await session.commit()

    with patch(
        "app.tasks.placement_send.send_probe.apply_async"
    ), patch("app.tasks.placement_poll.poll.apply_async"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                "/api/workspace/placement-tests",
                json={"mailbox_id": str(mailbox_id)},
                headers=_auth_for(user),
            )

    assert resp.status_code == 402
    assert "quota" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_history_emits_rich_shape_with_public_providers(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """GET /placement-tests returns the enriched shape the frontend needs.

    Locks the contract: items[].{seed_count, seeds_resolved, mailbox_email,
    results.by_provider keyed by public provider} + limit/offset echo.
    """
    app, maker, _ = app_and_maker
    user, ws = await _make_pro_plus_client(maker)
    mailbox_id = await _make_mailbox(maker, workspace_id=ws, user_id=user.id)
    g_peer = await _make_peer(maker, provider="gmail", email="g@example.com")
    o_peer = await _make_peer(maker, provider="outlook", email="o@example.com")

    from app.db.models.placement_test_seeds import PlacementTestSeed
    from app.db.models.placement_tests import PlacementTest

    async with maker() as session:
        t = PlacementTest(
            mailbox_id=mailbox_id,
            workspace_id=ws,
            seed_set={"seed_count": 2},
            status="completed",
            sent_at=datetime.now(UTC),
            # Stored by internal provider vocabulary — endpoint must re-key.
            results={
                "inbox": 1,
                "promotions": 0,
                "spam": 1,
                "other": 0,
                "timeout": 0,
                "total_seeds": 2,
                "by_provider": {
                    "google_ws": {"inbox": 1},
                    "office365": {"spam": 1},
                },
            },
        )
        session.add(t)
        await session.flush()
        session.add(
            PlacementTestSeed(
                test_id=t.id, seed_peer_id=g_peer, status="inbox",
                landed_folder="INBOX", landed_at=datetime.now(UTC),
            )
        )
        session.add(
            PlacementTestSeed(
                test_id=t.id, seed_peer_id=o_peer, status="spam",
                landed_folder="Junk", landed_at=datetime.now(UTC),
            )
        )
        await session.commit()
        test_id = t.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        resp = await c.get(
            "/api/workspace/placement-tests",
            params={"limit": 10, "offset": 0},
            headers=_auth_for(user),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert body["total"] == 1
    item = body["items"][0]
    assert item["seed_count"] == 2
    assert item["seeds_resolved"] == 2
    assert item["mailbox_email"] == "sender@example.com"
    assert item["completed_at"] is not None
    # Provider keys must be the public vocabulary, not google_ws/office365.
    bp = item["results"]["by_provider"]
    assert set(bp.keys()) == {"gmail", "outlook"}
    assert bp["gmail"]["inbox"] == 1
    assert bp["gmail"]["spam"] == 0  # full breakdown padded
    assert bp["outlook"]["spam"] == 1

    # Detail endpoint mirrors the same enriched shape.
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        d = await c.get(
            f"/api/workspace/placement-tests/{test_id}",
            headers=_auth_for(user),
        )
    assert d.status_code == 200, d.text
    detail = d.json()
    assert detail["seed_count"] == 2
    assert detail["seeds_resolved"] == 2
    assert detail["mailbox_email"] == "sender@example.com"
    assert detail["status"] == "completed"
    assert len(detail["seeds"]) == 2
    assert set(detail["results"]["by_provider"].keys()) == {"gmail", "outlook"}
