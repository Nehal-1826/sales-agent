"""Workspace white-label branding routes (Agency tier).

* GET    /api/workspace/branding         — resolved effective dict (auth-only)
* PATCH  /api/workspace/branding         — update fields  (Agency only, 402 otherwise)
* POST   /api/workspace/branding/logo    — multipart upload (Agency only)
* GET    /api/workspace/branding/logo    — serve raw logo bytes
* DELETE /api/workspace/branding/logo    — clear logo (Agency only)
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.services import branding_service
from app.services.branding_service import (
    BrandingNotAllowedError,
    BrandingValidationError,
)

router = APIRouter(prefix="/api/workspace/branding", tags=["workspace-branding"])


class BrandingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: str | None = Field(default=None, max_length=120)
    accent_color: str | None = Field(default=None, max_length=7)
    footer_text: str | None = Field(default=None, max_length=500)
    email_footer_text: str | None = Field(default=None, max_length=500)


@router.get("")
async def get_branding(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    return await branding_service.get_effective(session, user.workspace_id)


@router.patch("")
async def patch_branding(
    payload: BrandingUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    fields = payload.model_dump(exclude_unset=True)
    try:
        await branding_service.update(session, user.workspace_id, **fields)
    except BrandingNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Upgrade to Agency for white-label branding",
        ) from exc
    except BrandingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await branding_service.get_effective(session, user.workspace_id)


@router.post("/logo")
async def upload_logo(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    logo: UploadFile = File(...),
) -> dict[str, bool]:
    mime = logo.content_type or ""
    blob = await logo.read()
    try:
        await branding_service.upload_logo(session, user.workspace_id, blob, mime)
    except BrandingNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Upgrade to Agency for white-label branding",
        ) from exc
    except BrandingValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True}


@router.get("/logo")
async def serve_logo(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    result = await branding_service.get_logo(session, user.workspace_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No logo configured")
    blob, mime = result
    return Response(content=blob, media_type=mime)


@router.delete("/logo")
async def delete_logo(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    try:
        await branding_service.delete_logo(session, user.workspace_id)
    except BrandingNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Upgrade to Agency for white-label branding",
        ) from exc
    return {"success": True}
