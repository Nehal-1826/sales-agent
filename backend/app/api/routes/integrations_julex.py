"""Public Julex integration status — unauthenticated, polled by Julex.

Julex's storefront-builder backend/frontend polls ``GET /api/integrations/
julex/status?store_key=pk_live_...`` after a merchant links their store, to
discover whether the WarmPulse workspace is live and how many mailboxes it
is warming. Deliberately **no auth dependency** — same precedent as
``GET /api/plans``: the store key itself is the shared secret (it is only
ever presented by the merchant to Julex and to WarmPulse). The response is
restricted to data Julex already needs: store name, mailbox count, plan
name, and the connection timestamp.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import julex_service

router = APIRouter(prefix="/api/integrations/julex", tags=["integrations-julex"])


@router.get("/status")
async def julex_store_status(
    store_key: Annotated[str, Query(min_length=8)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    status = await julex_service.get_public_status(session, store_key=store_key)
    if status is None:
        raise HTTPException(status_code=404, detail="not connected")
    return status


__all__ = ["router"]
