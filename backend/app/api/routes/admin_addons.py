"""Admin add-on catalogue management — super_admin only.

GET lists all add-ons (incl. inactive); POST/PATCH manage the catalogue.
Mirrors the plans admin CRUD. Purchase/charge logic is client-side
(``/payments/addons``), never here.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.addons import AddonCreate, AddonOut, AddonUpdate
from app.services import addons_service

router = APIRouter(
    prefix="/api/admin/addons",
    tags=["admin-addons"],
    dependencies=[Depends(require_super_admin)],
)


@router.get("", response_model=list[AddonOut])
async def list_all(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[AddonOut]:
    addons = await addons_service.list_all_addons(session)
    return [AddonOut.model_validate(a) for a in addons]


@router.post("", response_model=AddonOut, status_code=201)
async def create(
    payload: AddonCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
) -> AddonOut:
    addon = await addons_service.create_addon(session, payload)
    return AddonOut.model_validate(addon)


@router.patch("/{addon_id}", response_model=AddonOut)
async def update(
    addon_id: uuid.UUID,
    payload: AddonUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
) -> AddonOut:
    addon = await addons_service.update_addon(session, addon_id, payload)
    return AddonOut.model_validate(addon)
