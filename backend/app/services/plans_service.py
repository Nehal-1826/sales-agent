"""Plan CRUD — all the DB-touching logic the plans router calls.

Soft-deletes only: payments reference plan_id with ``ondelete=RESTRICT``,
so hard-deleting a plan would break historical invoices. Flipping
``is_active=False`` hides the plan from the public pricing page while
preserving the FK.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.plans import Plan
from app.schemas.plans import PlanCreate, PlanUpdate

logger = logging.getLogger(__name__)


async def list_active_plans(session: AsyncSession) -> list[Plan]:
    """Public pricing page query — active AND public, cheapest first.

    ``is_public=False`` plans stay live for their existing subscribers but are
    hidden from the public pricing page / sign-up / onboarding picker. The
    admin list (``list_all_plans``) still surfaces them so they can be toggled.
    """
    result = await session.execute(
        select(Plan)
        .where(Plan.is_active.is_(True), Plan.is_public.is_(True))
        .order_by(Plan.sort_order.asc(), Plan.price_cents.asc())
    )
    return list(result.scalars().all())


async def list_all_plans(session: AsyncSession) -> list[Plan]:
    """Admin view — includes inactive AND hidden (non-public) plans."""
    result = await session.execute(
        select(Plan).order_by(Plan.sort_order.asc(), Plan.price_cents.asc())
    )
    return list(result.scalars().all())


async def get_plan_or_404(session: AsyncSession, plan_id: uuid.UUID) -> Plan:
    plan = await session.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
        )
    return plan


async def create_plan(session: AsyncSession, payload: PlanCreate) -> Plan:
    plan = Plan(
        name=payload.name,
        price_cents=payload.price_cents,
        max_mailboxes=payload.max_mailboxes,
        daily_email_cap=payload.daily_email_cap,
        token_cap_per_month=payload.token_cap_per_month,
        capabilities=payload.capabilities,
        is_active=payload.is_active,
        is_public=payload.is_public,
        sort_order=payload.sort_order,
    )
    session.add(plan)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Plan with name '{payload.name}' already exists",
        ) from exc
    await session.commit()
    await session.refresh(plan)
    return plan


async def update_plan(
    session: AsyncSession, plan_id: uuid.UUID, payload: PlanUpdate
) -> Plan:
    plan = await get_plan_or_404(session, plan_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(plan, field, value)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Plan name collision",
        ) from exc
    await session.commit()
    await session.refresh(plan)
    return plan


async def soft_delete_plan(session: AsyncSession, plan_id: uuid.UUID) -> Plan:
    """Flip is_active=False. Never hard-delete — payments reference this row."""
    plan = await get_plan_or_404(session, plan_id)
    plan.is_active = False
    await session.flush()
    await session.commit()
    await session.refresh(plan)
    return plan
