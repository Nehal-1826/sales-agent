"""Workspace custom-domain routes (Agency tier).

* GET    /api/workspace/custom-domain          — current registration + instructions
* POST   /api/workspace/custom-domain          — register/replace a domain
* POST   /api/workspace/custom-domain/verify   — run DNS check, flip status
* DELETE /api/workspace/custom-domain          — drop registration (204)
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.users import User
from app.db.models.workspace_custom_domains import WorkspaceCustomDomain
from app.db.session import get_db
from app.services import custom_domain_service
from app.services.custom_domain_service import (
    CNAME_TARGET,
    CustomDomainNotAllowedError,
    CustomDomainNotFoundError,
    DomainAlreadyTakenError,
    InvalidDomainError,
    TXT_PREFIX,
    TXT_VALUE_PREFIX,
)

router = APIRouter(
    prefix="/api/workspace/custom-domain", tags=["workspace-custom-domain"]
)


class CustomDomainCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str = Field(..., min_length=3, max_length=253)


def _serialize(row: WorkspaceCustomDomain) -> dict[str, Any]:
    txt_name = f"{TXT_PREFIX}{row.domain}"
    txt_value = f"{TXT_VALUE_PREFIX}{row.verification_code}"
    return {
        "domain": row.domain,
        "status": row.status,
        "verification_code": row.verification_code,
        "verification_method": row.verification_method,
        "verified_at": row.verified_at.isoformat() if row.verified_at else None,
        "last_check_at": row.last_check_at.isoformat() if row.last_check_at else None,
        "last_check_error": row.last_check_error,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "instructions": {
            "txt": {
                "name": txt_name,
                "value": txt_value,
            },
            "cname": {
                "name": row.domain,
                "value": CNAME_TARGET.rstrip("."),
            },
        },
    }


@router.get("")
async def get_custom_domain(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    row = await custom_domain_service.get_status(session, user.workspace_id)
    if row is None:
        raise HTTPException(status_code=404, detail="No custom domain configured")
    return _serialize(row)


@router.post("")
async def post_custom_domain(
    payload: CustomDomainCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    try:
        row = await custom_domain_service.start(
            session, user.workspace_id, payload.domain
        )
    except CustomDomainNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Upgrade to Agency for custom domain",
        ) from exc
    except InvalidDomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DomainAlreadyTakenError as exc:
        raise HTTPException(
            status_code=409, detail="Domain already registered"
        ) from exc
    return _serialize(row)


@router.post("/verify")
async def post_verify(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    try:
        result = await custom_domain_service.verify(session, user.workspace_id)
    except CustomDomainNotFoundError as exc:
        raise HTTPException(status_code=404, detail="No custom domain configured") from exc
    row = await custom_domain_service.get_status(session, user.workspace_id)
    payload: dict[str, Any] = {**result}
    if row is not None:
        payload.update(_serialize(row))
    return payload


@router.delete("", status_code=204)
async def delete_custom_domain(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await custom_domain_service.remove(session, user.workspace_id)
    return Response(status_code=204)
