"""Plans — public read endpoint + admin CRUD.

GET is unauthenticated so the marketing site can render pricing. POST /
PATCH / DELETE require super_admin. Delete is soft (flips is_active) —
payments reference plan_id with RESTRICT.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.plans import PlanCreate, PlanOut, PlanUpdate
from app.services import plans_service

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("", response_model=list[PlanOut])
async def list_plans(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[PlanOut]:
    plans = await plans_service.list_active_plans(session)
    return [PlanOut.model_validate(p) for p in plans]


@router.get("/all", response_model=list[PlanOut])
async def list_all_plans_admin(
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
) -> list[PlanOut]:
    """Admin-only listing — includes hidden (``is_public=False``) and inactive
    plans so the Plans page can surface a visibility toggle for each tier."""
    plans = await plans_service.list_all_plans(session)
    return [PlanOut.model_validate(p) for p in plans]


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: PlanCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
) -> PlanOut:
    plan = await plans_service.create_plan(session, payload)
    return PlanOut.model_validate(plan)


@router.patch("/{plan_id}", response_model=PlanOut)
async def update_plan(
    plan_id: uuid.UUID,
    payload: PlanUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
) -> PlanOut:
    plan = await plans_service.update_plan(session, plan_id, payload)
    return PlanOut.model_validate(plan)


@router.delete("/{plan_id}", response_model=PlanOut)
async def delete_plan(
    plan_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(require_super_admin)],
) -> PlanOut:
    """Soft-delete: never hard-delete because payments reference this row."""
    plan = await plans_service.soft_delete_plan(session, plan_id)
    return PlanOut.model_validate(plan)
