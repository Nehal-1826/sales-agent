"""Admin peer-inbox management (spec §5.2 item 3, §7).

All endpoints are ``super_admin``-only. Handlers stay thin — real work is in
:mod:`app.services.peer_inbox_service`. We never log request bodies on
create / bulk-import since they carry SMTP + IMAP passwords.
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.peer_inboxes import (
    BulkImportResult,
    PeerInboxCreate,
    PeerInboxListResponse,
    PeerInboxOut,
    PeerInboxStats,
    PeerInboxUpdate,
    TestConnectionResponse,
)
from app.services import peer_inbox_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/peer-inboxes", tags=["admin-peer-inboxes"])


# --------------------------------------------------------------------------- #
# Stats (mounted before /{peer_id} so the path router doesn't eat it)         #
# --------------------------------------------------------------------------- #


@router.get(
    "/stats",
    response_model=PeerInboxStats,
    dependencies=[Depends(require_super_admin)],
)
async def get_peer_stats(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PeerInboxStats:
    return await peer_inbox_service.peer_stats(session)


# --------------------------------------------------------------------------- #
# List                                                                        #
# --------------------------------------------------------------------------- #


@router.get(
    "",
    response_model=PeerInboxListResponse,
    dependencies=[Depends(require_super_admin)],
)
async def list_peer_inboxes(
    session: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    provider: str | None = Query(None),
    is_active: bool | None = Query(None),
    pool_id: uuid.UUID | None = Query(None),
    min_reputation: float | None = Query(None, ge=0.0, le=1.0),
) -> PeerInboxListResponse:
    rows, total = await peer_inbox_service.list_peers(
        session,
        page=page,
        page_size=page_size,
        provider=provider,
        is_active=is_active,
        pool_id=pool_id,
        min_reputation=min_reputation,
    )
    items = await peer_inbox_service.project_peers(session, rows)
    return PeerInboxListResponse(items=items, page=page, page_size=page_size, total=total)


# --------------------------------------------------------------------------- #
# Create                                                                      #
# --------------------------------------------------------------------------- #


@router.post(
    "",
    response_model=PeerInboxOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_peer_inbox(
    payload: PeerInboxCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> PeerInboxOut:
    logger.info("create_peer_inbox actor=%s", admin.id)  # never log body
    peer = await peer_inbox_service.create_peer(session, actor=admin, payload=payload)
    return await peer_inbox_service.project_peer(session, peer)


# --------------------------------------------------------------------------- #
# Bulk CSV import                                                             #
# --------------------------------------------------------------------------- #


_BULK_MAX_BYTES = 10 * 1024 * 1024


@router.post(
    "/bulk",
    response_model=BulkImportResult,
)
async def bulk_import_peer_inboxes(
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
    file: Annotated[UploadFile, File(...)],
    content_length: Annotated[int | None, Header(alias="content-length")] = None,
) -> BulkImportResult:
    if content_length is not None and content_length > _BULK_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV too large (10 MiB max)",
        )
    raw = await file.read(_BULK_MAX_BYTES + 1)
    if len(raw) > _BULK_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="CSV too large (10 MiB max)",
        )
    logger.info("bulk_import_peer_inboxes actor=%s bytes=%d", admin.id, len(raw))
    return await peer_inbox_service.bulk_import_peers(
        session, actor=admin, csv_bytes=raw
    )


# --------------------------------------------------------------------------- #
# Detail / Patch / Delete                                                     #
# --------------------------------------------------------------------------- #


@router.get(
    "/{peer_id}",
    response_model=PeerInboxOut,
    dependencies=[Depends(require_super_admin)],
)
async def get_peer_inbox(
    peer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PeerInboxOut:
    peer = await peer_inbox_service.get_peer_or_404(session, peer_id)
    return await peer_inbox_service.project_peer(session, peer)


@router.patch(
    "/{peer_id}",
    response_model=PeerInboxOut,
)
async def patch_peer_inbox(
    peer_id: uuid.UUID,
    payload: PeerInboxUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> PeerInboxOut:
    peer = await peer_inbox_service.update_peer(
        session, actor=admin, peer_id=peer_id, payload=payload
    )
    return await peer_inbox_service.project_peer(session, peer)


@router.delete("/{peer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_peer_inbox(
    peer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> Response:
    await peer_inbox_service.delete_peer(session, actor=admin, peer_id=peer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Capacity reset — zero used_today on demand                                   #
# --------------------------------------------------------------------------- #


@router.post("/reset-capacity")
async def reset_all_peer_capacity(
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> dict[str, int]:
    """Zero ``used_today`` across every peer so the whole network can send
    again immediately, without waiting for the daily 00:01 UTC reset."""
    count = await peer_inbox_service.reset_all_capacity(session, actor=admin)
    return {"peers_reset": count}


@router.post(
    "/{peer_id}/reset-capacity",
    response_model=PeerInboxOut,
)
async def reset_peer_capacity(
    peer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> PeerInboxOut:
    peer = await peer_inbox_service.reset_peer_capacity(
        session, actor=admin, peer_id=peer_id
    )
    return await peer_inbox_service.project_peer(session, peer)


# --------------------------------------------------------------------------- #
# Test connection                                                             #
# --------------------------------------------------------------------------- #


@router.post(
    "/{peer_id}/test-connection",
    response_model=TestConnectionResponse,
    dependencies=[Depends(require_super_admin)],
)
async def test_peer_connection(
    peer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    smtp_host: Annotated[str | None, Body(embed=True)] = None,
    smtp_port: Annotated[int | None, Body(embed=True)] = None,
    imap_host: Annotated[str | None, Body(embed=True)] = None,
    imap_port: Annotated[int | None, Body(embed=True)] = None,
) -> TestConnectionResponse:
    return await peer_inbox_service.test_peer_connection(
        session,
        peer_id=peer_id,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        imap_host=imap_host,
        imap_port=imap_port,
    )
