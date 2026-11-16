"""Tests for the Cashfree payments flow.

Covers the bits we can exercise without a live Cashfree account:
  * the 503 guard when Cashfree isn't configured;
  * the webhook HMAC primitive (base64 HMAC-SHA256 over timestamp+body);
  * ``handle_event`` idempotency + the PAYMENT_SUCCESS_WEBHOOK handler
    (records one succeeded Payment and sets the user's plan).

Note: ``subscription`` / ``payment.failed`` handlers are still stubs in
``cashfree_service`` (the Razorpay→Cashfree migration is mid-flight), so
they are intentionally not asserted here — see those handlers' bodies.

Uses the same in-memory SQLite fixture pattern as ``test_payments.py``,
with ``cashfree_events`` added to the per-file table list.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# ---------- fixtures ----------


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
    from app.db.models.cashfree_events import CashfreeEvent
    from app.db.models.mailboxes import Mailbox
    from app.db.models.notifications import Notification
    from app.db.models.payments import Payment
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
        for t in (User, Plan, Payment, AuditLog, Mailbox, CashfreeEvent, Notification)
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


# ---------- factories ----------


async def _seed_plan(
    maker: async_sessionmaker[AsyncSession],
    *,
    name: str = "Starter",
    price_cents: int = 1500,
    public: bool = True,
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=price_cents,
            max_mailboxes=1,
            daily_email_cap=50,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=True,
            is_public=public,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return plan.id


async def _make_client_user(
    maker: async_sessionmaker[AsyncSession],
    email: str = "client@example.com",
    plan_id: uuid.UUID | None = None,
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
            plan_id=plan_id,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


def _auth_header_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# ---------- route guard: not configured → 503 ----------


@pytest.mark.asyncio
async def test_cashfree_order_503_when_not_configured(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """With Cashfree keys unset, /payments/cashfree/order returns 503."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_client_user(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/cashfree/order",
            json={"plan_id": str(plan_id)},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 503, resp.text


@pytest.mark.asyncio
async def test_cashfree_subscription_503_when_not_configured(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_client_user(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/cashfree/subscription",
            json={"plan_id": str(plan_id)},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 503, resp.text


# ---------- webhook signature ----------


def test_verify_webhook() -> None:
    """Webhook HMAC is base64(HMAC-SHA256(secret, timestamp+body))."""
    from app.services import cashfree_service

    secret = "wh_secret"
    timestamp = "1700000000"
    body = b'{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{}}'
    good = base64.b64encode(
        hmac.new(secret.encode(), timestamp.encode() + body, hashlib.sha256).digest()
    ).decode()

    assert cashfree_service.verify_webhook(body, good, secret, timestamp)
    assert not cashfree_service.verify_webhook(body, "bad", secret, timestamp)
    assert not cashfree_service.verify_webhook(body, "", secret, timestamp)


# ---------- handle_event idempotency ----------


def _payment_success_event(
    *, event_id: str, user_id: uuid.UUID, plan_id: uuid.UUID, amount_rupees: float
) -> dict[str, object]:
    """A minimal PAYMENT_SUCCESS_WEBHOOK payload with order_tags set."""
    return {
        "id": event_id,
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {
                "order_id": "wp_order_ABC123",
                "order_amount": amount_rupees,
                "order_tags": {
                    "user_id": str(user_id),
                    "plan_id": str(plan_id),
                },
            },
            "payment": {"cf_payment_id": "cfpay_789"},
        },
    }


@pytest.mark.asyncio
async def test_handle_event_idempotent_single_payment(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """The same event id processed twice records exactly one Payment."""
    from app.db.models.payments import Payment, PaymentStatus
    from app.db.models.users import User as DBUser
    from app.services import cashfree_service

    _, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, price_cents=2500)
    user = await _make_client_user(maker)

    event = _payment_success_event(
        event_id="evt_dup_1", user_id=user.id, plan_id=plan_id, amount_rupees=25.0
    )

    async with maker() as session:
        await cashfree_service.handle_event(session, event)
    # Re-deliver the identical event.
    async with maker() as session:
        await cashfree_service.handle_event(session, event)

    async with maker() as session:
        rows = (
            await session.execute(select(Payment).where(Payment.user_id == user.id))
        ).scalars().all()
        assert len(rows) == 1, "duplicate event must not create a second Payment"
        assert rows[0].status == PaymentStatus.succeeded
        assert rows[0].amount_cents == 2500
        assert rows[0].payment_method == "cashfree"
        assert rows[0].cashfree_order_id == "wp_order_ABC123"
        assert rows[0].cashfree_payment_id == "cfpay_789"

        refreshed = await session.get(DBUser, user.id)
        assert refreshed is not None
        assert refreshed.plan_id == plan_id


@pytest.mark.asyncio
async def test_handle_event_ignores_unknown_type(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """An unhandled event type is journaled but creates no Payment."""
    from app.db.models.payments import Payment
    from app.services import cashfree_service

    _, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker)
    user = await _make_client_user(maker)

    event = {
        "id": "evt_unknown_1",
        "type": "ORDER_CREATED",  # not in _HANDLED_EVENTS
        "data": {
            "order": {
                "order_tags": {"user_id": str(user.id), "plan_id": str(plan_id)}
            }
        },
    }
    async with maker() as session:
        await cashfree_service.handle_event(session, event)

    async with maker() as session:
        rows = (
            await session.execute(select(Payment).where(Payment.user_id == user.id))
        ).scalars().all()
        assert rows == []
