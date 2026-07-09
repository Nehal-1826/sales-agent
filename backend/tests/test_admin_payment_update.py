"""Tests for the admin edit-payment backend.

SQLite in-memory pattern (matches test_admin_crm.py).
Tables: Plan, User, Payment, AuditLog.
pytest-asyncio in auto mode — no @pytest.mark.asyncio needed.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


# --------------------------------------------------------------------------- #
# In-memory DB setup                                                          #
# --------------------------------------------------------------------------- #


async def _make_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401 — ensure all models are imported
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.payments import Payment
    from app.db.models.plans import Plan
    from app.db.models.users import User

    # De-dupe index names (SQLite requirement across the full model graph).
    seen: set[str] = set()
    for table in Base.metadata.tables.values():
        for idx in list(table.indexes):
            if idx.name in seen:
                table.indexes.discard(idx)
            else:
                seen.add(idx.name)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [t.__table__ for t in (Plan, User, AuditLog, Payment)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    return maker, engine


# --------------------------------------------------------------------------- #
# Seed helpers                                                                 #
# --------------------------------------------------------------------------- #


async def _seed_plan(maker: async_sessionmaker, *, name: str = "Pro", price_cents: int = 99900) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as db:
        plan = Plan(name=name, price_cents=price_cents, max_mailboxes=5, daily_email_cap=50, token_cap_per_month=10_000)
        db.add(plan)
        await db.commit()
        return plan.id


async def _seed_user(maker: async_sessionmaker, *, email: str, plan_id: uuid.UUID) -> uuid.UUID:
    from app.db.models.users import User, UserRole

    async with maker() as db:
        user = User(email=email, workspace_id=uuid.uuid4(), plan_id=plan_id, role=UserRole.super_admin)
        db.add(user)
        await db.commit()
        return user.id


async def _seed_payment(
    maker: async_sessionmaker,
    *,
    user_id: uuid.UUID,
    plan_id: uuid.UUID,
    amount_cents: int = 99900,
    status: str = "succeeded",
) -> uuid.UUID:
    from app.db.models.payments import Payment, PaymentStatus

    async with maker() as db:
        payment = Payment(
            user_id=user_id,
            plan_id=plan_id,
            amount_cents=amount_cents,
            status=PaymentStatus(status),
            payment_method="card_dummy",
            dummy_card_last4="4242",
        )
        db.add(payment)
        await db.commit()
        return payment.id


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


async def test_update_status_changes_payment_and_writes_audit() -> None:
    """Updating status persists the new status and writes one audit row."""
    from app.db.models.audit_logs import AuditLog
    from app.db.models.payments import Payment, PaymentStatus
    from app.db.models.users import User
    from app.services.payments_service import update_payment

    maker, engine = await _make_db()
    try:
        plan_id = await _seed_plan(maker)
        user_id = await _seed_user(maker, email="admin@test.example", plan_id=plan_id)
        payment_id = await _seed_payment(maker, user_id=user_id, plan_id=plan_id, status="succeeded")

        async with maker() as db:
            actor = await db.get(User, user_id)
            assert actor is not None
            result = await update_payment(db, payment_id=payment_id, new_status="refunded", actor=actor)

        assert result.status == PaymentStatus.refunded

        # Verify persisted value
        async with maker() as db:
            p = await db.get(Payment, payment_id)
            assert p is not None
            status_val = p.status.value if hasattr(p.status, "value") else str(p.status)
            assert status_val == "refunded"

        # Verify audit row
        async with maker() as db:
            count = await db.scalar(
                select(func.count(AuditLog.id)).where(AuditLog.action == "payment.update")
            )
        assert count == 1

        # Verify audit payload captures before/after
        async with maker() as db:
            row = (await db.execute(select(AuditLog).where(AuditLog.action == "payment.update"))).scalar_one()
        assert row.target_id == payment_id
        assert row.payload is not None
        assert row.payload["before"]["status"] == "succeeded"
        assert row.payload["after"]["status"] == "refunded"
    finally:
        await engine.dispose()


async def test_update_amount_cents_changes_payment() -> None:
    """Updating amount_cents persists the new value."""
    from app.db.models.payments import Payment
    from app.db.models.users import User
    from app.services.payments_service import update_payment

    maker, engine = await _make_db()
    try:
        plan_id = await _seed_plan(maker)
        user_id = await _seed_user(maker, email="admin2@test.example", plan_id=plan_id)
        payment_id = await _seed_payment(maker, user_id=user_id, plan_id=plan_id, amount_cents=99900)

        async with maker() as db:
            actor = await db.get(User, user_id)
            assert actor is not None
            result = await update_payment(db, payment_id=payment_id, amount_cents=50000, actor=actor)

        assert result.amount_cents == 50000

        async with maker() as db:
            p = await db.get(Payment, payment_id)
            assert p is not None
            assert p.amount_cents == 50000
    finally:
        await engine.dispose()


async def test_update_both_fields_at_once() -> None:
    """Status and amount_cents can be updated in the same call."""
    from app.db.models.payments import Payment, PaymentStatus
    from app.db.models.users import User
    from app.services.payments_service import update_payment

    maker, engine = await _make_db()
    try:
        plan_id = await _seed_plan(maker)
        user_id = await _seed_user(maker, email="admin3@test.example", plan_id=plan_id)
        payment_id = await _seed_payment(maker, user_id=user_id, plan_id=plan_id, status="pending", amount_cents=10000)

        async with maker() as db:
            actor = await db.get(User, user_id)
            assert actor is not None
            result = await update_payment(
                db, payment_id=payment_id, new_status="failed", amount_cents=0, actor=actor
            )

        assert result.status == PaymentStatus.failed
        assert result.amount_cents == 0

        async with maker() as db:
            p = await db.get(Payment, payment_id)
            assert p is not None
            assert p.amount_cents == 0
    finally:
        await engine.dispose()


async def test_update_missing_payment_raises_404() -> None:
    """update_payment raises HTTP 404 when the payment id is unknown."""
    from fastapi import HTTPException
    from app.db.models.users import User
    from app.services.payments_service import update_payment

    maker, engine = await _make_db()
    try:
        plan_id = await _seed_plan(maker)
        user_id = await _seed_user(maker, email="admin4@test.example", plan_id=plan_id)

        async with maker() as db:
            actor = await db.get(User, user_id)
            assert actor is not None
            with pytest.raises(HTTPException) as exc_info:
                await update_payment(db, payment_id=uuid.uuid4(), new_status="refunded", actor=actor)

        assert exc_info.value.status_code == 404
    finally:
        await engine.dispose()


async def test_update_invalid_status_raises_400() -> None:
    """update_payment raises HTTP 400 when given an unrecognized status string."""
    from fastapi import HTTPException
    from app.db.models.users import User
    from app.services.payments_service import update_payment

    maker, engine = await _make_db()
    try:
        plan_id = await _seed_plan(maker)
        user_id = await _seed_user(maker, email="admin5@test.example", plan_id=plan_id)
        payment_id = await _seed_payment(maker, user_id=user_id, plan_id=plan_id)

        async with maker() as db:
            actor = await db.get(User, user_id)
            assert actor is not None
            with pytest.raises(HTTPException) as exc_info:
                await update_payment(db, payment_id=payment_id, new_status="BOGUS_STATUS", actor=actor)

        assert exc_info.value.status_code == 400
    finally:
        await engine.dispose()


async def test_update_payload_has_no_field_raises_validation_via_schema() -> None:
    """PaymentUpdate.has_any() returns False when neither field is set."""
    from app.schemas.payments import PaymentUpdate

    body = PaymentUpdate()
    assert body.has_any() is False


async def test_update_payload_has_status_only() -> None:
    """PaymentUpdate.has_any() returns True when only status is set."""
    from app.schemas.payments import PaymentUpdate

    body = PaymentUpdate(status="refunded")
    assert body.has_any() is True


async def test_update_payload_has_amount_only() -> None:
    """PaymentUpdate.has_any() returns True when only amount_cents is set."""
    from app.schemas.payments import PaymentUpdate

    body = PaymentUpdate(amount_cents=5000)
    assert body.has_any() is True
