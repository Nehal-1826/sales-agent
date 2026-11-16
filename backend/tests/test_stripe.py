"""Stripe checkout + webhook tests (Round 5).

Covers:
* ``verify_webhook`` accepts a valid HMAC, rejects bad signatures, replays,
  malformed headers, and out-of-tolerance timestamps.
* ``handle_event`` is idempotent: a duplicate event id short-circuits.
* ``checkout.session.completed`` flips ``users.plan_id`` and writes a
  succeeded ``payments`` row carrying the Stripe correlation ids.
* ``customer.subscription.updated`` with ``status=canceled`` suspends the
  user; with ``status=active`` un-suspends.
* ``POST /api/payments/checkout`` returns 503 when Stripe is off.
* ``POST /api/payments/webhook`` returns 400 on a bad signature.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.payments import Payment, PaymentStatus
from app.db.models.stripe_events import StripeEvent
from app.services import stripe_service

# --------------------------------------------------------------------------- #
# Harness                                                                     #
# --------------------------------------------------------------------------- #


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
    from app.db.models.payments import Payment as P
    from app.db.models.plans import Plan
    from app.db.models.stripe_events import StripeEvent as S
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (User, Plan, P, S, AuditLog)]
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


async def _make_user_and_plan(
    maker: async_sessionmaker[AsyncSession],
) -> tuple[uuid.UUID, uuid.UUID]:
    from app.db.models.plans import Plan
    from app.db.models.users import OnboardingStatus, User, UserRole

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

        user = User(
            email="stripe-payer@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user.id, plan.id


def _sign(secret: str, ts: int, body: bytes) -> str:
    payload = f"{ts}.".encode() + body
    sig = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


# --------------------------------------------------------------------------- #
# verify_webhook                                                              #
# --------------------------------------------------------------------------- #


def test_verify_webhook_accepts_valid_signature() -> None:
    body = b'{"id":"evt_1","type":"checkout.session.completed"}'
    secret = "whsec_test_secret"
    ts = int(time.time())
    header = _sign(secret, ts, body)
    parsed = stripe_service.verify_webhook(
        body=body, signature_header=header, secret=secret, now_ts=ts
    )
    assert parsed["id"] == "evt_1"


def test_verify_webhook_rejects_bad_signature() -> None:
    body = b'{"id":"evt_2"}'
    ts = int(time.time())
    bad = f"t={ts},v1=deadbeef"
    with pytest.raises(stripe_service.StripeWebhookError):
        stripe_service.verify_webhook(
            body=body, signature_header=bad, secret="whsec_x", now_ts=ts
        )


def test_verify_webhook_rejects_old_timestamp() -> None:
    body = b'{"id":"evt_old"}'
    secret = "whsec_x"
    ts = int(time.time()) - 7200  # 2h old
    header = _sign(secret, ts, body)
    with pytest.raises(stripe_service.StripeWebhookError):
        stripe_service.verify_webhook(
            body=body, signature_header=header, secret=secret
        )


def test_verify_webhook_rejects_missing_header() -> None:
    with pytest.raises(stripe_service.StripeWebhookError):
        stripe_service.verify_webhook(
            body=b"{}", signature_header=None, secret="whsec_x"
        )


# --------------------------------------------------------------------------- #
# handle_event                                                                #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_checkout_completed_sets_plan_and_writes_payment(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.users import User

    _, maker, _ = app_and_maker
    user_id, plan_id = await _make_user_and_plan(maker)

    event = {
        "id": "evt_co_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_abc",
                "subscription": "sub_test_xyz",
                "amount_total": 3900,
                "metadata": {
                    "user_id": str(user_id),
                    "plan_id": str(plan_id),
                    "plan_slug": "pro",
                },
            }
        },
    }

    async with maker() as db:
        result = await stripe_service.handle_event(db, event)
        assert result["handled"] is True
        assert result["kind"] == "applied"

        # User now on the plan.
        u = await db.get(User, user_id)
        assert u is not None
        assert u.plan_id == plan_id

        # Payment row exists with Stripe correlation ids.
        rows = (await db.execute(select(Payment))).scalars().all()
        assert len(rows) == 1
        p = rows[0]
        assert p.status == PaymentStatus.succeeded
        assert p.amount_cents == 3900
        assert p.stripe_session_id == "cs_test_abc"
        assert p.stripe_subscription_id == "sub_test_xyz"


@pytest.mark.asyncio
async def test_handle_event_is_idempotent(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Replaying the same event id must not duplicate side effects."""
    _, maker, _ = app_and_maker
    user_id, plan_id = await _make_user_and_plan(maker)

    event = {
        "id": "evt_dupe",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_dupe",
                "subscription": "sub_dupe",
                "amount_total": 3900,
                "metadata": {"user_id": str(user_id), "plan_id": str(plan_id)},
            }
        },
    }

    async with maker() as db:
        first = await stripe_service.handle_event(db, event)
        second = await stripe_service.handle_event(db, event)
        assert first["handled"] is True
        assert second["handled"] is False
        assert second["kind"] == "duplicate"

        payments = (await db.execute(select(Payment))).scalars().all()
        events = (await db.execute(select(StripeEvent))).scalars().all()
        assert len(payments) == 1
        assert len(events) == 1


@pytest.mark.asyncio
async def test_subscription_canceled_suspends_user(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.users import User

    _, maker, _ = app_and_maker
    user_id, plan_id = await _make_user_and_plan(maker)

    event = {
        "id": "evt_sub_cancel",
        "type": "customer.subscription.updated",
        "data": {
            "object": {
                "status": "canceled",
                "metadata": {"user_id": str(user_id), "plan_id": str(plan_id)},
            }
        },
    }

    async with maker() as db:
        await stripe_service.handle_event(db, event)
        u = await db.get(User, user_id)
        assert u is not None
        assert u.is_suspended is True

    # Now reactivation flips it back.
    event2 = dict(event)
    event2["id"] = "evt_sub_active"
    event2["data"] = {
        "object": {
            "status": "active",
            "metadata": {"user_id": str(user_id), "plan_id": str(plan_id)},
        }
    }
    async with maker() as db:
        await stripe_service.handle_event(db, event2)
        u = await db.get(User, user_id)
        assert u is not None
        assert u.is_suspended is False


# --------------------------------------------------------------------------- #
# Routes                                                                      #
# --------------------------------------------------------------------------- #


def _auth(user_id: uuid.UUID, workspace_id: uuid.UUID) -> dict[str, str]:
    from app.services.security import create_access_token

    token = create_access_token(
        subject=str(user_id), role="client", workspace_id=str(workspace_id)
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_checkout_returns_503_when_stripe_off(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user_id, plan_id = await _make_user_and_plan(maker)

    # Look up the user's workspace_id for the JWT.
    from app.db.models.users import User

    async with maker() as db:
        u = await db.get(User, user_id)
        assert u is not None
        ws = u.workspace_id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/checkout",
            headers=_auth(user_id, ws),
            json={"plan_id": str(plan_id)},
        )
    assert resp.status_code == 503
    assert "STRIPE_SECRET_KEY" in resp.text


@pytest.mark.asyncio
async def test_webhook_route_rejects_bad_signature(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With Stripe configured but a bad signature, the route returns 400."""
    app, _maker, _ = app_and_maker

    from app.config import get_settings

    monkeypatch.setattr(get_settings.__wrapped__, "__defaults__", None, raising=False)
    settings = get_settings()
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_fake")

    body = b'{"id":"evt_route","type":"ping"}'
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/webhook",
            content=body,
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": "t=0,v1=abc",
            },
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_webhook_route_accepts_valid_event(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, maker, _ = app_and_maker
    user_id, plan_id = await _make_user_and_plan(maker)

    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_fake")

    body = json.dumps(
        {
            "id": "evt_route_ok",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_route",
                    "subscription": "sub_route",
                    "amount_total": 3900,
                    "metadata": {"user_id": str(user_id), "plan_id": str(plan_id)},
                }
            },
        }
    ).encode()
    ts = int(time.time())
    sig = _sign("whsec_fake", ts, body)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/payments/webhook",
            content=body,
            headers={"Content-Type": "application/json", "Stripe-Signature": sig},
        )
    assert resp.status_code == 200, resp.text
    body_json = resp.json()
    assert body_json["handled"] is True
    assert body_json["type"] == "checkout.session.completed"
