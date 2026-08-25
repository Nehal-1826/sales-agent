"""Platform Mail routes — full mail system for WarmPulse's own account.

Thin handlers only: IMAP/SMTP work, credential handling and audit writes all
live in ``services/platform_mail``. Error mapping mirrors the admin Mail
Viewer:

* ``ValueError`` (unconfigured server, unknown folder/message) → 400
* timeout / connection / SMTP / aioimaplib failures → 502
  ("send failed" on /send, "IMAP unreachable" everywhere else)

Unlike the viewer these routes MUTATE the account — opening a message marks
it seen, flags can be toggled, messages deleted, mail composed and sent.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

import aioimaplib
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_super_admin
from app.db.models.users import User
from app.services import platform_mail

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/platform-mail",
    tags=["admin-platform-mail"],
    dependencies=[Depends(require_super_admin)],
)


class PlatformMailSend(BaseModel):
    """Compose/send body — strict: unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")

    to: EmailStr
    cc: EmailStr | None = None
    subject: str = Field(min_length=1, max_length=998)
    body_text: str = Field(min_length=1, max_length=100_000)
    body_html: str | None = Field(default=None, max_length=200_000)
    in_reply_to: str | None = None
    references: str | None = None


def _imap_error(exc: Exception) -> HTTPException:
    logger.warning("platform-mail IMAP unreachable: %s", exc)
    return HTTPException(status_code=502, detail=f"IMAP unreachable — {exc}")


@router.get("/folders")
async def list_folders(
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> dict[str, Any]:
    """All folders + unread counts (INBOX/Sent/Junk/Trash when present)."""
    try:
        return await platform_mail.list_folders(session, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:  # TimeoutError ⊂ OSError
        raise _imap_error(exc) from exc


@router.get("/messages")
async def list_messages(
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    folder: str = Query("INBOX"),
    limit: int = Query(50, ge=1, le=100),
) -> dict[str, Any]:
    """Newest-first message summaries (with seen state) for one folder."""
    try:
        return await platform_mail.list_messages(session, actor=actor, folder=folder, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:
        raise _imap_error(exc) from exc


@router.get("/message/{uid}")
async def get_message(
    uid: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    folder: str = Query("INBOX"),
) -> dict[str, Any]:
    """Fetch one full message — and mark it seen (our own account)."""
    try:
        return await platform_mail.get_message(session, actor=actor, folder=folder, uid=uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:
        raise _imap_error(exc) from exc


@router.post("/send")
async def send_mail(
    payload: PlatformMailSend,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> dict[str, Any]:
    """Compose + send from the platform account (APPENDs into Sent)."""
    try:
        return await platform_mail.send_mail(
            session,
            actor=actor,
            to=str(payload.to),
            subject=payload.subject,
            body_text=payload.body_text,
            body_html=payload.body_html,
            cc=str(payload.cc) if payload.cc else None,
            in_reply_to=payload.in_reply_to,
            references=payload.references,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:
        logger.warning("platform-mail send failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"send failed — {exc}") from exc


@router.post("/{uid}/seen", status_code=204)
async def set_seen(
    uid: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    folder: str = Query("INBOX"),
    seen: bool = Query(True),
) -> None:
    """Set (or clear) the \\Seen flag on one message."""
    try:
        await platform_mail.set_seen(session, actor=actor, folder=folder, uid=uid, seen=seen)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:
        raise _imap_error(exc) from exc


@router.delete("/{uid}", status_code=204)
async def delete_message(
    uid: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
    folder: str = Query("INBOX"),
) -> None:
    """Delete one message (COPY to Trash when it exists, then EXPUNGE)."""
    try:
        await platform_mail.delete_message(session, actor=actor, folder=folder, uid=uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, aioimaplib.Abort) as exc:
        raise _imap_error(exc) from exc
