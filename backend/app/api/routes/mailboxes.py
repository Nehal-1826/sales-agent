"""Workspace-scoped mailbox CRUD + schedule window editor.

Every endpoint is mounted under ``/api/workspace/mailboxes`` and is scoped
by the JWT's ``workspace_id`` — clients can never see or touch another
workspace's mailboxes. Handlers are deliberately thin; all DB, crypto, and
audit work happens in :mod:`app.services.mailbox_service`.

Logging note (spec §12): we NEVER log the request body on the
create/update routes because doing so would leak SMTP passwords and
OAuth refresh tokens straight into systemd journals. Only ``user.id`` is
emitted.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_or_api_key
from app.db.models.schedule_windows import ScheduleWindow
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupLog
from app.db.session import get_db
from app.schemas.mailboxes import (
    MailboxCreateRequest,
    MailboxListResponse,
    MailboxOut,
    MailboxProbeRequest,
    MailboxUpdate,
    RunWarmupNowResponse,
    TestConnectionResponse,
)
from app.services import mailbox_service
from app.services.notifications_dispatch import fire_and_forget_webhooks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/mailboxes", tags=["workspace-mailboxes"])


# --------------------------------------------------------------------------- #
# CREATE                                                                      #
# --------------------------------------------------------------------------- #


@router.post("", response_model=MailboxOut, status_code=status.HTTP_201_CREATED)
async def create_mailbox(
    payload: MailboxCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MailboxOut:
    logger.info("create_mailbox user=%s", user.id)  # never log body — creds leak
    mbx = await mailbox_service.create_mailbox(session, user=user, payload=payload)
    window = await mailbox_service.load_schedule_window(session, mbx)
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="Mailbox connected",
            summary=(
                f"You connected {mbx.email_address} to WarmPulse. "
                "Warmup will start sending automatically — first sends within 15 minutes."
            ),
            details={
                "Provider": mbx.provider.value if hasattr(mbx.provider, "value") else str(mbx.provider),
                "Daily target": str(mbx.daily_target),
            },
        )
    except Exception:
        pass

    # Auto-import CRM leads from Sent folder for Pro Plus / Agency.
    # Fire-and-forget via Celery — never blocks the response.
    try:
        from app.tasks.crm_mailbox_import import import_leads
        import_leads.delay(str(mbx.id))
    except Exception:
        pass

    # Fan out a "mailbox_connected" webhook (e.g. Julex listens for this to
    # confirm a linked store's workspace is warming). Sync fire-and-forget —
    # a webhook failure must NEVER break mailbox creation.
    try:
        provider = (
            mbx.provider.value if hasattr(mbx.provider, "value") else str(mbx.provider)
        )
        fire_and_forget_webhooks(
            user.workspace_id,
            "mailbox_connected",
            {
                "mailbox_id": str(mbx.id),
                "email_address": mbx.email_address,
                "provider": provider,
            },
        )
    except Exception:
        logger.warning("mailbox_connected webhook fanout failed", exc_info=True)

    return mailbox_service.mailbox_to_out(mbx, window=window)


# --------------------------------------------------------------------------- #
# PROBE (no-persist credential check, used by onboarding Step 3)              #
# --------------------------------------------------------------------------- #


@router.post("/probe", response_model=TestConnectionResponse)
async def probe_mailbox_credentials(
    payload: MailboxProbeRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> TestConnectionResponse:
    """Probe SMTP (+IMAP if both fields provided) credentials without saving.

    Used by the onboarding wizard to verify the user typed working credentials
    before letting them advance past the "Connect your mailbox" step. Returns
    200 on success; 400 with the underlying SMTP/IMAP error detail on failure.
    """
    logger.info("probe_mailbox user=%s", user.id)  # never log body — creds leak
    return await mailbox_service.probe_credentials(payload)


@router.get("/detect-provider")
async def detect_provider(
    email: Annotated[str, Query(description="Full email address — only the domain is used.")],
    user: Annotated[User, Depends(get_current_user)],
):
    """Auto-detect mailbox provider + SMTP/IMAP defaults from the domain's MX.

    Used by the onboarding wizard to pre-fill the Zoho/Google/Microsoft hosts
    + Zoho data-center region so the user doesn't have to know "my mailbox is
    on Zoho's India data centre, so SMTP is smtp.zoho.in, not smtp.zoho.com".
    Returns ``{provider: "unknown"}`` on any DNS failure rather than 4xx.
    """
    from app.services.provider_detector import detect_from_email
    logger.info("detect_provider user=%s", user.id)
    return (await detect_from_email(email)).model_dump()


# --------------------------------------------------------------------------- #
# LIST                                                                        #
# --------------------------------------------------------------------------- #


@router.get("", response_model=MailboxListResponse)
async def list_mailboxes(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user_or_api_key)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    provider: str | None = Query(None),
) -> MailboxListResponse:
    items, total = await mailbox_service.list_mailboxes(
        session,
        workspace_id=user.workspace_id,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        provider_filter=provider,
    )
    # Single grouped query for "sends today" per mailbox in this page so the
    # list table can render `sent_today` without N+1 round trips. Uses UTC
    # midnight for the day boundary — matches the dashboard summary.
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    sends_today_map: dict[uuid.UUID, int] = {}
    opens_today_map: dict[uuid.UUID, int] = {}
    replies_today_map: dict[uuid.UUID, int] = {}
    if items:
        # One grouped query covers sends (outbound) + peer-side opens/replies
        # (inbound) per mailbox for today, so the console KPI cards render
        # real engagement without N+1 round trips.
        rows = await session.execute(
            select(WarmupLog.mailbox_id, WarmupLog.action, func.count(WarmupLog.id))
            .where(
                WarmupLog.mailbox_id.in_([m.id for m in items]),
                WarmupLog.action.in_(
                    [WarmupAction.sent, WarmupAction.opened, WarmupAction.replied]
                ),
                WarmupLog.created_at >= today_start,
            )
            .group_by(WarmupLog.mailbox_id, WarmupLog.action)
        )
        for mb_id, action, cnt in rows.all():
            if action == WarmupAction.sent:
                sends_today_map[mb_id] = int(cnt)
            elif action == WarmupAction.opened:
                opens_today_map[mb_id] = int(cnt)
            elif action == WarmupAction.replied:
                replies_today_map[mb_id] = int(cnt)
    return MailboxListResponse(
        items=[
            mailbox_service.mailbox_to_out(
                m,
                sent_today=sends_today_map.get(m.id, 0),
                opens_today=opens_today_map.get(m.id, 0),
                replies_today=replies_today_map.get(m.id, 0),
            )
            for m in items
        ],
        page=page,
        page_size=page_size,
        total=total,
    )


# --------------------------------------------------------------------------- #
# DETAIL                                                                      #
# --------------------------------------------------------------------------- #


@router.get("/{mailbox_id}", response_model=MailboxOut)
async def get_mailbox(
    mailbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user_or_api_key)],
) -> MailboxOut:
    mbx = await mailbox_service.get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    window = await mailbox_service.load_schedule_window(session, mbx)
    return mailbox_service.mailbox_to_out(mbx, window=window)


# --------------------------------------------------------------------------- #
# UPDATE                                                                      #
# --------------------------------------------------------------------------- #


@router.patch("/{mailbox_id}", response_model=MailboxOut)
async def update_mailbox(
    mailbox_id: uuid.UUID,
    payload: MailboxUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MailboxOut:
    logger.info("update_mailbox user=%s mailbox=%s", user.id, mailbox_id)
    mbx = await mailbox_service.update_mailbox(
        session, user=user, mailbox_id=mailbox_id, payload=payload
    )
    window = await mailbox_service.load_schedule_window(session, mbx)
    return mailbox_service.mailbox_to_out(mbx, window=window)


# --------------------------------------------------------------------------- #
# PAUSE / RESUME                                                              #
# --------------------------------------------------------------------------- #


@router.post("/{mailbox_id}/pause", response_model=MailboxOut)
async def pause_mailbox(
    mailbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MailboxOut:
    mbx = await mailbox_service.pause_mailbox(
        session, user=user, mailbox_id=mailbox_id
    )
    window = await mailbox_service.load_schedule_window(session, mbx)
    return mailbox_service.mailbox_to_out(mbx, window=window)


@router.post("/{mailbox_id}/resume", response_model=MailboxOut)
async def resume_mailbox(
    mailbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MailboxOut:
    mbx = await mailbox_service.resume_mailbox(
        session, user=user, mailbox_id=mailbox_id
    )
    window = await mailbox_service.load_schedule_window(session, mbx)
    return mailbox_service.mailbox_to_out(mbx, window=window)


# --------------------------------------------------------------------------- #
# DELETE                                                                      #
# --------------------------------------------------------------------------- #


@router.delete("/{mailbox_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mailbox(
    mailbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await mailbox_service.delete_mailbox(
        session, user=user, mailbox_id=mailbox_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# TEST CONNECTION                                                             #
# --------------------------------------------------------------------------- #


@router.post("/{mailbox_id}/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    mailbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TestConnectionResponse:
    return await mailbox_service.test_connection(
        session, user=user, mailbox_id=mailbox_id
    )


# --------------------------------------------------------------------------- #
# RUN WARMUP NOW                                                              #
# --------------------------------------------------------------------------- #


@router.post("/{mailbox_id}/run-now", response_model=RunWarmupNowResponse)
async def run_warmup_now(
    mailbox_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> RunWarmupNowResponse:
    """Trigger one warmup send now instead of waiting for the 15-min cycle."""
    return await mailbox_service.run_warmup_now(
        session, user=user, mailbox_id=mailbox_id
    )


# --------------------------------------------------------------------------- #
# SCHEDULE WINDOW                                                             #
# --------------------------------------------------------------------------- #


class SchedulePayload(BaseModel):
    """Override the mailbox's send-window. weekday_mask: bit0=Mon, bit6=Sun.

    Default ``31`` (0b0011111) is Mon-Fri. Set ``127`` for every day.
    """

    model_config = ConfigDict(extra="forbid")

    tz: str = Field(default="UTC", min_length=1, max_length=64)
    weekday_mask: int = Field(default=31, ge=0, le=127)
    start_hour: int = Field(default=9, ge=0, le=23)
    end_hour: int = Field(default=17, ge=1, le=24)


@router.patch("/{mailbox_id}/schedule", response_model=MailboxOut)
async def update_mailbox_schedule(
    mailbox_id: uuid.UUID,
    payload: SchedulePayload,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MailboxOut:
    """Create or update the ScheduleWindow attached to the mailbox.

    Reuses the existing ``schedule_window_id`` if one is already attached;
    otherwise creates a fresh row and links it. The window is workspace-owned
    so it can be reassigned to other mailboxes later.
    """
    if payload.start_hour >= payload.end_hour:
        raise HTTPException(
            status_code=400, detail="start_hour must be before end_hour"
        )
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(payload.tz)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid timezone: {payload.tz}"
        ) from exc

    mbx = await mailbox_service.get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )

    window: ScheduleWindow | None = None
    if mbx.schedule_window_id:
        window = (
            await session.execute(
                select(ScheduleWindow).where(ScheduleWindow.id == mbx.schedule_window_id)
            )
        ).scalar_one_or_none()
    if window is None:
        window = ScheduleWindow(
            workspace_id=user.workspace_id,
            name=f"Window for {mbx.email_address}",
            tz=payload.tz,
            weekday_mask=payload.weekday_mask,
            start_hour=payload.start_hour,
            end_hour=payload.end_hour,
        )
        session.add(window)
        await session.flush()
        mbx.schedule_window_id = window.id
    else:
        window.tz = payload.tz
        window.weekday_mask = payload.weekday_mask
        window.start_hour = payload.start_hour
        window.end_hour = payload.end_hour

    await session.commit()
    await session.refresh(mbx)
    return mailbox_service.mailbox_to_out(mbx, window=window)
