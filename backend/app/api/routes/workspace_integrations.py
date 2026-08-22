"""Workspace integrations — Julex store link (verify, status, disconnect).

Merchants on julex.shop paste their Julex Public API key
(``pk_live_...``) here; WarmPulse verifies it against Julex's public
settings endpoint and persists the link on ``workspace_settings``. Julex
then polls the public status endpoint (``api/routes/integrations_julex.py``).
"""

from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.services import julex_service
from app.services.julex_service import verify_store_key

router = APIRouter(prefix="/api/workspace/integrations", tags=["workspace-integrations"])

# Julex public keys look like ``pk_live_<urlsafe-token>``. Merchants often
# paste surrounding text from the Julex settings page, so we regex-extract
# the key out of whatever they submit.
_JULEX_KEY_RE = re.compile(r"pk_live_[A-Za-z0-9_-]+")


class JulexVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_key: str = Field(min_length=8)


def _extract_julex_key(raw: str) -> str:
    match = _JULEX_KEY_RE.search(raw)
    if match is None:
        raise HTTPException(status_code=422, detail="no valid Julex key found")
    return match.group(0)


@router.post("/julex/verify")
async def verify_julex_key(
    payload: JulexVerifyRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    store_key = _extract_julex_key(payload.store_key)
    result = await verify_store_key(store_key)
    if not result.ok:
        raise HTTPException(status_code=404, detail="Julex did not accept this key")
    try:
        await julex_service.connect_workspace(
            session,
            workspace_id=user.workspace_id,
            store_key=store_key,
            store_name=result.store_name,
            default_sender=user.email,
        )
    except ValueError as exc:
        if str(exc) == "already_linked":
            raise HTTPException(
                status_code=409,
                detail="This Julex store is already linked to another workspace",
            ) from exc
        raise
    return {"connected": True, "store_name": result.store_name}


@router.get("/julex")
async def get_julex_link(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Local view of the link — no network call to Julex."""
    row = await julex_service.get_workspace_settings(session, workspace_id=user.workspace_id)
    connected = bool(row and row.julex_store_key)
    return {
        "connected": connected,
        "store_key_masked": row.julex_store_key[:8] + "…" if connected else None,
        "store_name": row.julex_store_name if connected else None,
        "connected_at": row.julex_connected_at if connected else None,
    }


@router.delete("/julex", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_julex(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await julex_service.disconnect_workspace(session, workspace_id=user.workspace_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
