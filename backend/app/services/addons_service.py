"""Add-on catalogue queries + ownership helpers.

Catalogue CRUD is admin-only (mirrors plans_service). Purchase/charge logic
lives in payments_service.purchase_addon — this module is read + admin-edit.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.addons import Addon, WorkspaceAddon
from app.schemas.addons import AddonCreate, AddonUpdate


async def list_active_addons(session: AsyncSession) -> list[Addon]:
    result = await session.execute(
        select(Addon).where(Addon.is_active.is_(True)).order_by(Addon.sort_order.asc())
    )
    return list(result.scalars().all())


async def list_all_addons(session: AsyncSession) -> list[Addon]:
    result = await session.execute(select(Addon).order_by(Addon.sort_order.asc()))
    return list(result.scalars().all())


async def get_addon_by_key(session: AsyncSession, key: str) -> Addon | None:
    return (
        await session.execute(select(Addon).where(Addon.key == key))
    ).scalar_one_or_none()


async def owned_addon_ids(session: AsyncSession, workspace_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await session.execute(
        select(WorkspaceAddon.addon_id).where(WorkspaceAddon.workspace_id == workspace_id)
    )
    return {r for (r,) in rows.all()}


async def create_addon(session: AsyncSession, payload: AddonCreate) -> Addon:
    addon = Addon(
        key=payload.key,
        name=payload.name,
        description=payload.description,
        price_cents=payload.price_cents,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    session.add(addon)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Add-on with key '{payload.key}' already exists",
        ) from exc
    await session.commit()
    await session.refresh(addon)
    return addon


async def update_addon(
    session: AsyncSession, addon_id: uuid.UUID, payload: AddonUpdate
) -> Addon:
    addon = await session.get(Addon, addon_id)
    if addon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Add-on not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(addon, field, value)
    await session.flush()
    await session.commit()
    await session.refresh(addon)
    return addon
