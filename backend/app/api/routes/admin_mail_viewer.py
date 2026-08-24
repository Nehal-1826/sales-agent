"""Admin Mail Viewer routes — IMAP look-into for super_admins.

Thin handlers only: account/message lookup, credential handling and audit
writes all live in ``services/admin_mail_viewer``. Errors map as:

* ``ValueError`` (bad source, OAuth provider, missing creds/folder) → 400
* timeout / connection / aioimaplib failures → 502 "IMAP unreachable"
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Literal

import aioimaplib
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_super_admin
from app.db.models.users import User
from app.services import admin_mail_viewer

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mail-viewer",
    tags=["admin-mail-viewer"],
    dependencies=[Depends(require_super_admin)],
)


@router.get("/accounts")
async def list_accounts(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """All inspectable accounts (client mailboxes + peer inboxes)."""
    return await admin_mail_viewer.list_viewable_accounts(session)


@router.get("/{source}/{account_id}/messages")
async def list_messages(
    source: Literal["mailbox", "peer", "platform"],
    account_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    folder: str = Query("INBOX"),
    limit: int = Query(50, ge=1, le=100),
) -> dict[str, Any]:
    """Newest-first message summaries for one folder of one account."""
    try:
        return await admin_mail_viewer.list_messages(
            session,
            actor=actor,
            source=source,
            account_id=account_id,
            folder=folder,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:  # TimeoutError ⊂ OSError
        logger.warning("mail-viewer IMAP unreachable: %s", exc)
        raise HTTPException(status_code=502, detail=f"IMAP unreachable — {exc}") from exc


@router.get("/{source}/{account_id}/message/{uid}")
async def get_message(
    source: Literal["mailbox", "peer", "platform"],
    account_id: str,
    uid: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    folder: str = Query("INBOX"),
) -> dict[str, Any]:
    """Fetch one full message by UID from the given folder."""
    try:
        return await admin_mail_viewer.get_message(
            session,
            actor=actor,
            source=source,
            account_id=account_id,
            folder=folder,
            uid=uid,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:  # TimeoutError ⊂ OSError
        logger.warning("mail-viewer IMAP unreachable: %s", exc)
        raise HTTPException(status_code=502, detail=f"IMAP unreachable — {exc}") from exc
