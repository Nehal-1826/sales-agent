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
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.mailboxes import Mailbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.workspace_settings import WorkspaceSetting
from app.db.session import get_db

router = APIRouter(prefix="/api/integrations/julex", tags=["integrations-julex"])


@router.get("/status")
async def julex_store_status(
    store_key: Annotated[str, Query(min_length=8)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    row = (
        await session.execute(
            select(WorkspaceSetting).where(WorkspaceSetting.julex_store_key == store_key)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="not connected")

    mailboxes = (
        await session.execute(
            select(func.count())
            .select_from(Mailbox)
            .where(Mailbox.workspace_id == row.workspace_id)
        )
    ).scalar_one()

    plan_name = (
        await session.execute(
            select(Plan.name)
            .join(User, User.plan_id == Plan.id)
            .where(User.workspace_id == row.workspace_id)
            .limit(1)
        )
    ).scalar_one_or_none()

    return {
        "connected": True,
        "store_name": row.julex_store_name,
        "mailboxes": int(mailboxes),
        "plan": plan_name,
        "connected_at": row.julex_connected_at,
    }


__all__ = ["router"]
