"""Admin client → pool routing (spec §5.2 item 4, §7).

Every active client workspace should be assigned to exactly one pool.
Removing an assignment reverts the workspace to the default pool —
nothing is ever orphan-assigned.
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.peer_pools import (
    MailboxPinRequest,
    PoolAssignmentListResponse,
    PoolAssignmentOut,
    PoolAssignmentRequest,
    RoutingMailbox,
    RoutingMailboxListResponse,
    SankeyData,
    UnassignedClientsResponse,
)
from app.services import peer_pool_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pool-routing", tags=["admin-pool-routing"])


# --------------------------------------------------------------------------- #
# Unassigned clients — mounted before `/` path-matcher boundaries              #
# --------------------------------------------------------------------------- #


@router.get(
    "/clients/unassigned",
    response_model=UnassignedClientsResponse,
    dependencies=[Depends(require_super_admin)],
)
async def list_unassigned_clients(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UnassignedClientsResponse:
    items = await peer_pool_service.list_unassigned_clients(session)
    return UnassignedClientsResponse(items=items)


# --------------------------------------------------------------------------- #
# Per-mailbox pool pin                                                         #
# --------------------------------------------------------------------------- #


@router.get(
    "/mailboxes",
    response_model=RoutingMailboxListResponse,
    dependencies=[Depends(require_super_admin)],
)
async def list_routing_mailboxes(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RoutingMailboxListResponse:
    items = await peer_pool_service.list_routing_mailboxes(session)
    return RoutingMailboxListResponse(
        items=[RoutingMailbox(**row) for row in items]
    )


@router.post("/mailboxes/{mailbox_id}", response_model=RoutingMailbox)
async def pin_mailbox(
    mailbox_id: uuid.UUID,
    payload: MailboxPinRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> RoutingMailbox:
    await peer_pool_service.assign_mailbox_to_pool(
        session, actor=admin, mailbox_id=mailbox_id, pool_id=payload.pool_id
    )
    rows = await peer_pool_service.list_routing_mailboxes(session)
    for row in rows:
        if row["id"] == mailbox_id:
            return RoutingMailbox(**row)
    from fastapi import HTTPException

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Mailbox pinned but projection failed",
    )


# --------------------------------------------------------------------------- #
# Sankey data                                                                 #
# --------------------------------------------------------------------------- #


@router.get(
    "/sankey-data",
    response_model=SankeyData,
    dependencies=[Depends(require_super_admin)],
)
async def get_sankey(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SankeyData:
    return await peer_pool_service.sankey_data(session)


# --------------------------------------------------------------------------- #
# List assignments                                                            #
# --------------------------------------------------------------------------- #


@router.get(
    "",
    response_model=PoolAssignmentListResponse,
    dependencies=[Depends(require_super_admin)],
)
async def list_assignments(
    session: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    pool_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None, max_length=255),
) -> PoolAssignmentListResponse:
    items, total = await peer_pool_service.list_assignments(
        session, page=page, page_size=page_size, pool_id=pool_id, search=search
    )
    return PoolAssignmentListResponse(
        items=items, page=page, page_size=page_size, total=total
    )


# --------------------------------------------------------------------------- #
# Upsert assignment                                                           #
# --------------------------------------------------------------------------- #


@router.post("", response_model=PoolAssignmentOut)
async def upsert_assignment(
    payload: PoolAssignmentRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> PoolAssignmentOut:
    await peer_pool_service.upsert_assignment(
        session,
        actor=admin,
        workspace_id=payload.workspace_id,
        pool_id=payload.pool_id,
    )
    # Read-back projection (small — single row).
    items, _ = await peer_pool_service.list_assignments(
        session, page=1, page_size=1, pool_id=payload.pool_id
    )
    for it in items:
        if it.workspace_id == payload.workspace_id:
            return it
    # Fallback — should not be reachable given the upsert above.
    from fastapi import HTTPException

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Assignment upserted but projection failed",
    )


# --------------------------------------------------------------------------- #
# Revert assignment → default pool                                            #
# --------------------------------------------------------------------------- #


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def revert_assignment(
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
    workspace_id: uuid.UUID = Query(...),
) -> Response:
    await peer_pool_service.revert_assignment_to_default(
        session, actor=admin, workspace_id=workspace_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
