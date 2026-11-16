"""Add-ons — public read endpoint.

GET is unauthenticated so the marketing pricing page can render the add-on
strip (mirrors the unauth ``GET /api/plans``). Admin CRUD lives in
admin_addons.py; purchase/charge logic lives in payments_service.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.addons import PublicAddonOut
from app.services import addons_service

router = APIRouter(prefix="/api/addons", tags=["addons-public"])


@router.get("", response_model=list[PublicAddonOut])
async def list_public_addons(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[PublicAddonOut]:
    return await addons_service.list_public_addons(session)
