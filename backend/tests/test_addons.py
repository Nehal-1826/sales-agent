"""Add-on purchase + auto-pay + dummy renewal service tests (self-contained)."""
from __future__ import annotations

import uuid
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def maker() -> async_sessionmaker[AsyncSession]:
    from app.db import models  # noqa: F401 — register mappers
    from app.db.base import Base
    from app.db.models.addons import Addon, WorkspaceAddon
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.payments import Payment
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.workspace_settings import WorkspaceSetting

    # Dedupe duplicate index defs SQLite rejects (same trick as test_plans).
    seen = set()
    for t in list(Base.metadata.tables.values()):
        for idx in list(t.indexes):
            if idx.name in seen:
                t.indexes.discard(idx)
            else:
                seen.add(idx.name)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    tables = [t.__table__ for t in (User, Plan, Payment, AuditLog, WorkspaceSetting, Addon, WorkspaceAddon)]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _seed(maker):
    from app.db.models.addons import Addon
    from app.db.models.plans import Plan
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as s:
        plan = Plan(name="Pro", price_cents=499900, max_mailboxes=5, daily_email_cap=100,
                    token_cap_per_month=150000, capabilities={})
        crm = Addon(key="crm", name="CRM Automation", description="", price_cents=49900, sort_order=10)
        pack = Addon(key="mailbox_pack", name="Extra Mailbox Pack", description="", price_cents=29900, sort_order=20)
        user = User(email="a@example.com", hashed_password=None, workspace_id=uuid.uuid4(),
                    role=UserRole.client, onboarding_status=OnboardingStatus.signed_up)
        s.add_all([plan, crm, pack, user])
        await s.commit()
        return user.id, plan.id


@pytest.mark.asyncio
async def test_purchase_addon_records_payment_sets_crm_flag_and_owns(maker):
    from app.db.models.users import User
    from app.db.models.workspace_settings import WorkspaceSetting
    from app.services import addons_service, payments_service

    uid, _ = await _seed(maker)
    async with maker() as s:
        user = await s.get(User, uid)
        await payments_service.purchase_addon(s, user=user, addon_key="crm")
    async with maker() as s:
        user = await s.get(User, uid)
        ws = await s.get(WorkspaceSetting, user.workspace_id)
        owned = await addons_service.owned_addon_ids(s, user.workspace_id)
        assert ws is not None and ws.crm_addon_enabled is True
        assert len(owned) == 1
    # Idempotent: second buy is a no-op (no second charge).
    async with maker() as s:
        user = await s.get(User, uid)
        await payments_service.purchase_addon(s, user=user, addon_key="crm")
    from sqlalchemy import func, select
    from app.db.models.payments import Payment
    async with maker() as s:
        n = (await s.execute(select(func.count()).select_from(Payment).where(Payment.payment_method == "addon_dummy"))).scalar()
        assert n == 1


@pytest.mark.asyncio
async def test_purchase_unknown_addon_404(maker):
    from fastapi import HTTPException
    from app.db.models.users import User
    from app.services import payments_service

    uid, _ = await _seed(maker)
    async with maker() as s:
        user = await s.get(User, uid)
        with pytest.raises(HTTPException) as exc:
            await payments_service.purchase_addon(s, user=user, addon_key="nope")
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_set_auto_pay_seeds_next_billing(maker):
    from app.db.models.users import User
    from app.services import payments_service

    uid, plan_id = await _seed(maker)
    async with maker() as s:
        user = await s.get(User, uid)
        user.plan_id = plan_id
        await s.commit()
    async with maker() as s:
        user = await s.get(User, uid)
        await payments_service.set_auto_pay(s, user=user, enabled=True)
    async with maker() as s:
        user = await s.get(User, uid)
        assert user.auto_pay_enabled is True
        assert user.next_billing_date is not None


@pytest.mark.asyncio
async def test_renew_subscription_advances_date_and_charges(maker):
    from sqlalchemy import func, select
    from app.db.models.payments import Payment
    from app.db.models.users import User
    from app.services import payments_service

    uid, plan_id = await _seed(maker)
    async with maker() as s:
        user = await s.get(User, uid)
        user.plan_id = plan_id
        user.next_billing_date = date(2026, 1, 31)
        await s.commit()
    async with maker() as s:
        user = await s.get(User, uid)
        payment = await payments_service.renew_subscription_dummy(s, user=user)
        assert payment is not None
    async with maker() as s:
        user = await s.get(User, uid)
        assert user.next_billing_date == date(2026, 2, 28)  # clamped Feb
        n = (await s.execute(select(func.count()).select_from(Payment).where(Payment.payment_method == "auto_renew_dummy"))).scalar()
        assert n == 1
