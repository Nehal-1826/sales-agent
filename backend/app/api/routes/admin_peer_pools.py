"""Admin peer-pool CRUD + membership mgmt (spec §7).

Pools are groups of peer inboxes. Routing clients to a pool is handled
by the sibling :mod:`app.api.routes.admin_pool_routing` router.
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
    AddMembersRequest,
    AddMembersResponse,
    PoolCreate,
    PoolDetail,
    PoolOut,
    PoolUpdate,
)
from app.services import peer_inbox_service, peer_pool_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/peer-pools", tags=["admin-peer-pools"])


# --------------------------------------------------------------------------- #
# List                                                                        #
# --------------------------------------------------------------------------- #


@router.get(
    "",
    response_model=list[PoolOut],
    dependencies=[Depends(require_super_admin)],
)
async def list_pools(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[PoolOut]:
    return await peer_pool_service.list_pools(session)


# --------------------------------------------------------------------------- #
# Create                                                                      #
# --------------------------------------------------------------------------- #


@router.post("", response_model=PoolOut, status_code=status.HTTP_201_CREATED)
async def create_pool(
    payload: PoolCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> PoolOut:
    pool = await peer_pool_service.create_pool(session, actor=admin, payload=payload)
    return await peer_pool_service.pool_to_out(session, pool)


# --------------------------------------------------------------------------- #
# Detail (pool + paginated members)                                           #
# --------------------------------------------------------------------------- #


@router.get(
    "/{pool_id}",
    response_model=PoolDetail,
    dependencies=[Depends(require_super_admin)],
)
async def get_pool(
    pool_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> PoolDetail:
    pool = await peer_pool_service.get_pool_or_404(session, pool_id)
    members, total = await peer_pool_service.list_pool_members(
        session, pool_id=pool_id, page=page, page_size=page_size
    )
    member_outs = await peer_inbox_service.project_peers(session, members)
    base = await peer_pool_service.pool_to_out(session, pool)
    return PoolDetail(
        id=base.id,
        name=base.name,
        description=base.description,
        is_default=base.is_default,
        member_count=base.member_count,
        created_at=base.created_at,
        members=member_outs,
        page=page,
        page_size=page_size,
        total=total,
    )


# --------------------------------------------------------------------------- #
# Patch                                                                       #
# --------------------------------------------------------------------------- #


@router.patch("/{pool_id}", response_model=PoolOut)
async def patch_pool(
    pool_id: uuid.UUID,
    payload: PoolUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> PoolOut:
    pool = await peer_pool_service.update_pool(
        session, actor=admin, pool_id=pool_id, payload=payload
    )
    return await peer_pool_service.pool_to_out(session, pool)


# --------------------------------------------------------------------------- #
# Delete                                                                      #
# --------------------------------------------------------------------------- #


@router.delete("/{pool_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pool(
    pool_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> Response:
    await peer_pool_service.delete_pool(session, actor=admin, pool_id=pool_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Members                                                                     #
# --------------------------------------------------------------------------- #


@router.post("/{pool_id}/members", response_model=AddMembersResponse)
async def add_pool_members(
    pool_id: uuid.UUID,
    payload: AddMembersRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> AddMembersResponse:
    return await peer_pool_service.add_members(
        session, actor=admin, pool_id=pool_id, peer_ids=payload.peer_inbox_ids
    )


@router.delete(
    "/{pool_id}/members/{peer_inbox_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_pool_member(
    pool_id: uuid.UUID,
    peer_inbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> Response:
    await peer_pool_service.remove_member(
        session, actor=admin, pool_id=pool_id, peer_inbox_id=peer_inbox_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
