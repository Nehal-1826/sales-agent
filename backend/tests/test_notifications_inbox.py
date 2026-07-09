"""Notifications inbox — service + routes + dispatch hooks.

Covers:
* ``notify_user`` writes a row, ``list_for_user`` returns it, ``mark_read``
  flips ``read_at``, ``mark_all_read`` flips every unread row in one UPDATE.
* GET /workspace/notifications-inbox returns ``{items, unread}``.
* POST /workspace/notifications-inbox/{id}/read flips read state, returns
  the updated row; another user's id is 404 (no existence leak).
* Stripe ``invoice.payment_failed`` writes both a Payment row and a
  notification row.
* ``mailbox_service.delete_mailbox`` writes a notification row.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.notifications import Notification
from app.services import notification_inbox_service


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
    from app.db.models.notifications import Notification as N
    from app.db.models.payments import Payment as P
    from app.db.models.plans import Plan
    from app.db.models.stripe_events import StripeEvent
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (User, Plan, Mailbox, P, StripeEvent, WarmupLog, AuditLog, N)
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> AsyncIterator[
    tuple[object, async_sessionmaker[AsyncSession], object]
]:
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


async def _make_user(maker: async_sessionmaker[AsyncSession], email: str = "u@example.com") -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as db:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        db.add(u)
        await db.commit()
        await db.refresh(u)
        return u


def _auth(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return {
        "Authorization": "Bearer "
        + create_access_token(
            subject=str(user.id), role=role, workspace_id=str(user.workspace_id)
        )
    }


# --------------------------------------------------------------------------- #
# Service                                                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_notify_user_then_list_then_mark_read(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    _, maker, _ = app_and_maker
    user = await _make_user(maker)

    async with maker() as db:
        await notification_inbox_service.notify_user(
            db, user_id=user.id, kind="welcome", title="Welcome", body="Hi"
        )
        # ~10ms gap so the two created_at timestamps don't tie under
        # SQLite's millisecond resolution and the DESC sort is stable.
        await asyncio.sleep(0.02)
        await notification_inbox_service.notify_user(
            db, user_id=user.id, kind="warmth_drop", title="Warmth dropped"
        )

        items = await notification_inbox_service.list_for_user(db, user_id=user.id)
        assert len(items) == 2
        # Most-recent first.
        assert items[0].kind == "warmth_drop"
        assert items[1].kind == "welcome"

        unread = await notification_inbox_service.unread_count(db, user_id=user.id)
        assert unread == 2

        # Mark one read.
        flipped = await notification_inbox_service.mark_read(
            db, user_id=user.id, notification_id=items[0].id
        )
        assert flipped is not None
        assert flipped.read_at is not None
        assert (
            await notification_inbox_service.unread_count(db, user_id=user.id) == 1
        )

        # Mark-all-read flips the remaining one.
        n = await notification_inbox_service.mark_all_read(db, user_id=user.id)
        assert n == 1
        assert (
            await notification_inbox_service.unread_count(db, user_id=user.id) == 0
        )


@pytest.mark.asyncio
async def test_mark_read_404_for_other_users_notification(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    _, maker, _ = app_and_maker
    alice = await _make_user(maker, "alice@example.com")
    bob = await _make_user(maker, "bob@example.com")
    async with maker() as db:
        n = await notification_inbox_service.notify_user(
            db, user_id=alice.id, kind="welcome", title="Hi Alice"
        )

        # Bob trying to mark Alice's notification — must return None.
        out = await notification_inbox_service.mark_read(
            db, user_id=bob.id, notification_id=n.id
        )
        assert out is None


# --------------------------------------------------------------------------- #
# Routes                                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_inbox_list_and_read_flow_through_routes(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user = await _make_user(maker)
    async with maker() as db:
        n = await notification_inbox_service.notify_user(
            db,
            user_id=user.id,
            kind="welcome",
            title="Welcome",
            payload={"url": "/app/onboarding"},
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # List.
        resp = await c.get(
            "/api/workspace/notifications-inbox", headers=_auth(user)
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["unread"] == 1
        assert len(body["items"]) == 1
        assert body["items"][0]["kind"] == "welcome"
        assert body["items"][0]["payload"]["url"] == "/app/onboarding"

        # Mark one read.
        resp = await c.post(
            f"/api/workspace/notifications-inbox/{n.id}/read",
            headers=_auth(user),
        )
        assert resp.status_code == 200
        assert resp.json()["read_at"] is not None

        # Subsequent list shows unread=0.
        resp = await c.get(
            "/api/workspace/notifications-inbox", headers=_auth(user)
        )
        assert resp.json()["unread"] == 0


@pytest.mark.asyncio
async def test_mark_read_returns_404_for_other_user(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    alice = await _make_user(maker, "alice@example.com")
    bob = await _make_user(maker, "bob@example.com")
    async with maker() as db:
        n = await notification_inbox_service.notify_user(
            db, user_id=alice.id, kind="welcome", title="Hi Alice"
        )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            f"/api/workspace/notifications-inbox/{n.id}/read",
            headers=_auth(bob),
        )
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# Dispatch hooks                                                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_stripe_payment_failed_writes_notification(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """The invoice.payment_failed handler must drop a row in the inbox so
    the user sees the issue when they next open the app."""
    from app.db.models.payments import Payment, PaymentStatus
    from app.db.models.plans import Plan
    from app.services import stripe_service

    _, maker, _ = app_and_maker
    user = await _make_user(maker)

    async with maker() as db:
        plan = Plan(
            name="Pro",
            price_cents=3900,
            max_mailboxes=5,
            daily_email_cap=100,
            token_cap_per_month=150_000,
            capabilities={},
            is_active=True,
        )
        db.add(plan)
        await db.commit()
        await db.refresh(plan)
        # Seed a prior succeeded payment so the failed-handler can resolve
        # the (user, plan) pair via subscription id.
        db.add(
            Payment(
                user_id=user.id,
                plan_id=plan.id,
                amount_cents=3900,
                status=PaymentStatus.succeeded,
                stripe_session_id="cs_prior",
                stripe_subscription_id="sub_xyz",
            )
        )
        await db.commit()

        event = {
            "id": "evt_invoice_failed_1",
            "type": "invoice.payment_failed",
            "data": {
                "object": {
                    "subscription": "sub_xyz",
                    "amount_due": 3900,
                    "hosted_invoice_url": "https://invoice.stripe.com/test",
                }
            },
        }
        result = await stripe_service.handle_event(db, event)
        assert result["handled"] is True

        # Notification row exists.
        rows = (
            await db.execute(
                select(Notification).where(Notification.user_id == user.id)
            )
        ).scalars().all()
        kinds = [r.kind for r in rows]
        assert "payment_failed" in kinds
        failed = next(r for r in rows if r.kind == "payment_failed")
        assert failed.payload.get("url") == "https://invoice.stripe.com/test"
        assert failed.payload.get("amount_cents") == 3900


@pytest.mark.asyncio
async def test_mailbox_delete_writes_disconnect_notification(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Deleting a mailbox should leave a breadcrumb in the inbox so a user
    who didn't trigger the deletion themselves (e.g. OAuth-revoke) finds out."""
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
    from app.services import mailbox_service

    _, maker, _ = app_and_maker
    user = await _make_user(maker)

    async with maker() as db:
        mbx = Mailbox(
            user_id=user.id,
            workspace_id=user.workspace_id,
            email_address="m1@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.active,
            daily_target=50,
        )
        db.add(mbx)
        await db.commit()
        await db.refresh(mbx)
        mailbox_id = mbx.id

    async with maker() as db:
        # Reload the user inside this session before passing in.
        from app.db.models.users import User as _U
        u_in_session = await db.get(_U, user.id)
        await mailbox_service.delete_mailbox(
            db, user=u_in_session, mailbox_id=mailbox_id
        )

    async with maker() as db:
        rows = (
            await db.execute(
                select(Notification).where(Notification.user_id == user.id)
            )
        ).scalars().all()
    kinds = [r.kind for r in rows]
    assert "mailbox_disconnected" in kinds
    msg = next(r for r in rows if r.kind == "mailbox_disconnected")
    assert "m1@example.com" in msg.body
    assert msg.payload.get("email_address") == "m1@example.com"
