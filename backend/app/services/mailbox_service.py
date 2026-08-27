"""Mailbox business logic — plan caps, credential encryption, ramp ladder.

Route handlers in :mod:`app.api.routes.mailboxes` stay thin; every DB touch,
credential encrypt/wipe, audit write, and onboarding state transition lives
here so we can unit-test it without FastAPI in the loop.

Security invariants enforced here (spec §12):
* Plaintext credentials never leave this module (callers hand the payload in,
  we encrypt, we wipe, we persist bytes).
* ``smtp_password_encrypted`` / ``oauth_token_encrypted`` are ``BYTEA``
  columns — the response projection never reads them.
* Audit writes are savepointed so a logging failure can't poison the main
  transaction (mirrors :mod:`app.services.auth_service`).
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import ssl

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import (
    Mailbox,
    MailboxProvider,
    WarmupStatus,
)
from app.db.models.mailboxes import (
    ContentMode as DbContentMode,
)
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.plans import Plan
from app.db.models.schedule_windows import ScheduleWindow
from app.db.models.users import OnboardingStatus, User, UserRole
from app.schemas.mailboxes import (
    MailboxCreateOauth,
    MailboxCreateSmtp,
    MailboxOut,
    MailboxProbeRequest,
    MailboxUpdate,
    RunWarmupNowResponse,
    ScheduleWindowOut,
    TestConnectionResponse,
)
from app.schemas.mailboxes import (
    ContentMode as SchemaContentMode,
)
from app.services import notification_inbox_service
from app.services.crypto import get_fernet_service
from app.services.mailbox_preflight import PreflightRequest, run_preflight

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Ramp ladder (spec §2)                                                        #
# --------------------------------------------------------------------------- #


def ramp_target(current_day: int, daily_target: int) -> int:
    """Per-day target on the WarmPulse ramp ladder. Cap at mailbox's ``daily_target``.

    D1–3:   5/day
    D4–7:   10/day
    D8–14:  20/day
    D15–21: 35/day
    D22–28: 50/day
    D29+:   ``daily_target``
    """
    if current_day <= 0:
        return 0
    if current_day <= 3:
        return min(5, daily_target)
    if current_day <= 7:
        return min(10, daily_target)
    if current_day <= 14:
        return min(20, daily_target)
    if current_day <= 21:
        return min(35, daily_target)
    if current_day <= 28:
        return min(50, daily_target)
    return daily_target


def _days_remaining(current_day: int) -> int:
    return max(0, 28 - current_day)


# --------------------------------------------------------------------------- #
# Projection helpers                                                           #
# --------------------------------------------------------------------------- #


def mailbox_to_out(
    mbx: Mailbox,
    *,
    window: ScheduleWindow | None = None,
    sent_today: int = 0,
    opens_today: int = 0,
    replies_today: int = 0,
) -> MailboxOut:
    """Project a Mailbox ORM row → MailboxOut. Never reads encrypted columns.

    ``window`` is optional because the list-page projection skips it (the
    list table doesn't render schedule). Detail and update routes pass it
    explicitly so the SchedulePanel can render without a follow-up fetch.

    ``sent_today`` defaults to 0 so test fixtures still validate; the list
    route passes the real per-mailbox count from a single grouped query.
    """
    schedule_window = (
        ScheduleWindowOut(
            tz=window.tz,
            weekday_mask=window.weekday_mask,
            start_hour=window.start_hour,
            end_hour=window.end_hour,
        )
        if window is not None
        else None
    )
    return MailboxOut(
        id=mbx.id,
        email_address=mbx.email_address,
        provider=mbx.provider.value if hasattr(mbx.provider, "value") else str(mbx.provider),
        warmup_status=(
            mbx.warmup_status.value
            if hasattr(mbx.warmup_status, "value")
            else str(mbx.warmup_status)
        ),
        daily_target=mbx.daily_target,
        current_day=mbx.current_day,
        warmth_score=mbx.warmth_score,
        content_mode=(
            mbx.content_mode.value
            if hasattr(mbx.content_mode, "value")
            else str(mbx.content_mode)
        ),
        is_paused=mbx.is_paused,
        is_oauth=bool(mbx.oauth_token_encrypted),
        spf_valid=mbx.spf_valid,
        dkim_valid=mbx.dkim_valid,
        dmarc_valid=mbx.dmarc_valid,
        schedule_window_id=mbx.schedule_window_id,
        schedule_window=schedule_window,
        created_at=mbx.created_at,
        ramp_target_today=ramp_target(mbx.current_day, mbx.daily_target),
        days_remaining_in_ramp=_days_remaining(mbx.current_day),
        sent_today=sent_today,
        opens_today=opens_today,
        replies_today=replies_today,
    )


async def load_schedule_window(
    session: AsyncSession, mailbox: Mailbox
) -> ScheduleWindow | None:
    """Eager-load the ScheduleWindow attached to ``mailbox``, or None."""
    if mailbox.schedule_window_id is None:
        return None
    return await session.get(ScheduleWindow, mailbox.schedule_window_id)


# --------------------------------------------------------------------------- #
# Audit helper (savepointed best-effort)                                       #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor_user_id: uuid.UUID | None,
    actor_role: str | None,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        target_type="mailbox",
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover — audit failures never 500
        logger.warning("audit write failed action=%s: %s", action, exc)


# --------------------------------------------------------------------------- #
# Queries                                                                      #
# --------------------------------------------------------------------------- #


async def get_mailbox_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, mailbox_id: uuid.UUID
) -> Mailbox:
    stmt = select(Mailbox).where(
        Mailbox.id == mailbox_id, Mailbox.workspace_id == workspace_id
    )
    mbx = (await session.execute(stmt)).scalar_one_or_none()
    if mbx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found"
        )
    return mbx


async def list_mailboxes(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    page: int,
    page_size: int,
    status_filter: str | None = None,
    provider_filter: str | None = None,
) -> tuple[list[Mailbox], int]:
    base = select(Mailbox).where(Mailbox.workspace_id == workspace_id)
    count_stmt = select(func.count(Mailbox.id)).where(Mailbox.workspace_id == workspace_id)

    if status_filter:
        try:
            st = WarmupStatus(status_filter)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status filter: {status_filter}",
            ) from exc
        base = base.where(Mailbox.warmup_status == st)
        count_stmt = count_stmt.where(Mailbox.warmup_status == st)

    if provider_filter:
        try:
            pv = MailboxProvider(provider_filter)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid provider filter: {provider_filter}",
            ) from exc
        base = base.where(Mailbox.provider == pv)
        count_stmt = count_stmt.where(Mailbox.provider == pv)

    total = int((await session.execute(count_stmt)).scalar_one())
    stmt = (
        base.order_by(Mailbox.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return rows, total


# --------------------------------------------------------------------------- #
# Create                                                                       #
# --------------------------------------------------------------------------- #


async def _enforce_plan_cap(session: AsyncSession, user: User) -> Plan | None:
    """Load the user's plan and enforce the ``max_mailboxes`` cap.

    Trial allowance: when ``user.plan_id`` is None (user is mid-onboarding
    and hasn't paid yet) we permit up to ``TRIAL_MAILBOX_LIMIT`` mailboxes
    so the onboarding flow can connect + DNS-verify a mailbox *before*
    checkout. Once they pay, the real plan cap kicks in for any subsequent
    mailbox-create. The trial allowance is intentionally tiny — it's only
    here to defer the paywall until the user has seen the mailbox work.
    """
    TRIAL_MAILBOX_LIMIT = 1

    count = int(
        (
            await session.execute(
                select(func.count(Mailbox.id)).where(
                    Mailbox.workspace_id == user.workspace_id
                )
            )
        ).scalar_one()
    )

    if user.plan_id is None:
        if count >= TRIAL_MAILBOX_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Trial allows {TRIAL_MAILBOX_LIMIT} mailbox during onboarding. "
                    "Complete checkout to add more."
                ),
            )
        # Trial path — no plan row to return, callers must handle None.
        return None

    plan = await session.get(Plan, user.plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Select a plan first."
        )
    if count >= plan.max_mailboxes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Plan '{plan.name}' allows {plan.max_mailboxes} mailbox(es). "
                "Upgrade to add more."
            ),
        )
    return plan


def _content_mode_db(val: SchemaContentMode | str) -> DbContentMode:
    raw = val.value if hasattr(val, "value") else str(val)
    return DbContentMode(raw)


async def _ensure_not_peer_email(session: AsyncSession, email: str) -> None:
    """Reverse contamination guard: an email registered as a system peer
    inbox can never be connected as a client mailbox — that would make the
    warmup engine route a client's own warmup sends through a system helper
    identity (and expose the peer network's creds to a tenant)."""
    needle = email.strip().lower()
    hit = await session.scalar(
        select(PeerInbox.id)
        .where(func.lower(PeerInbox.email_address) == needle)
        .limit(1)
    )
    if hit is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{email}' is registered as a system peer inbox "
                "and cannot be connected as a client mailbox"
            ),
        )


async def probe_credentials(
    payload: "MailboxCreateSmtp | MailboxProbeRequest",
) -> "TestConnectionResponse":
    """Run the same SMTP / IMAP probes as :func:`create_mailbox` without
    touching the database. Raises HTTPException(400) on failure so the
    response body carries the exact provider error.
    """
    from app.schemas.mailboxes import TestConnectionResponse

    smtp_ok, smtp_err = await _probe_smtp(
        payload.smtp_host,
        payload.smtp_port,
        payload.smtp_username,
        payload.smtp_password,
    )
    if not smtp_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"SMTP login failed: {smtp_err or 'unknown'}. "
                "Verify host/port (usually 587 or 465), that the password "
                "is correct, and — for Gmail/Yahoo/Zoho — that it's an App "
                "Password generated with 2FA enabled (not your normal account password)."
            ),
        )
    imap_ok: bool | None = None
    if payload.imap_host and payload.imap_port:
        imap_result, imap_err = await _probe_imap(
            payload.imap_host,
            payload.imap_port,
            payload.smtp_username,
            payload.smtp_password,
        )
        if not imap_result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"IMAP login failed: {imap_err or 'unknown'}. "
                    "Fix the IMAP host/port (usually 993) or leave both "
                    "IMAP fields blank to skip inbound warmup."
                ),
            )
        imap_ok = True

    return TestConnectionResponse(
        smtp_ok=True,
        imap_ok=imap_ok,
        note=None,
    )


async def create_mailbox(
    session: AsyncSession,
    *,
    user: User,
    payload: MailboxCreateSmtp | MailboxCreateOauth,
    skip_probe: bool = False,
) -> Mailbox:
    """Create + encrypt + audit + onboarding transition. Returns the persisted row.

    For SMTP-flavoured payloads this performs a live SMTP AUTH probe BEFORE any
    DB write — if the server rejects the credentials we 400 with a clean hint
    so the user fixes the form instead of getting a mailbox that silently
    fails on every send. IMAP is probed only when both host+port were provided
    (IMAP is optional per spec).

    Tests that want to bypass the live probe pass ``skip_probe=True``.
    """
    await _enforce_plan_cap(session, user)

    # Reverse contamination guard — applies to BOTH the SMTP and OAuth
    # create paths (they converge in this function): a system peer inbox
    # email can never become a client mailbox.
    await _ensure_not_peer_email(session, payload.email_address)

    # --- Live credential probe (SMTP-flavoured only) ---------------------
    # Runs BEFORE any secret is touched / encrypted / persisted. OAuth tokens
    # are not probe-able synchronously here (we'd need to exchange the
    # refresh_token first), so we skip the probe in that branch.
    if not skip_probe and isinstance(payload, MailboxCreateSmtp):
        smtp_ok, smtp_err = await _probe_smtp(
            payload.smtp_host,
            payload.smtp_port,
            payload.smtp_username,
            payload.smtp_password,
        )
        if not smtp_ok:
            from fastapi import HTTPException
            from fastapi import status as http_status

            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"SMTP login failed: {smtp_err or 'unknown'}. "
                    "Verify host/port (usually 587 or 465), that the password "
                    "is correct, and — for Gmail — that it's an App Password "
                    "with 2FA enabled (not your regular account password)."
                ),
            )
        # Optional IMAP probe — only if caller supplied both fields.
        if payload.imap_host and payload.imap_port:
            imap_ok, imap_err = await _probe_imap(
                payload.imap_host,
                payload.imap_port,
                payload.smtp_username,
                payload.smtp_password,
            )
            if not imap_ok:
                from fastapi import HTTPException
                from fastapi import status as http_status

                raise HTTPException(
                    status_code=http_status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"IMAP login failed: {imap_err or 'unknown'}. "
                        "Fix the IMAP host/port (usually 993) or leave both "
                        "IMAP fields blank to skip inbound warmup."
                    ),
                )

    # Is this the user's first mailbox? (Checked before insert for the
    # onboarding-status transition below.)
    first_mailbox = (
        int(
            (
                await session.execute(
                    select(func.count(Mailbox.id)).where(
                        Mailbox.workspace_id == user.workspace_id
                    )
                )
            ).scalar_one()
        )
        == 0
    )

    fernet = get_fernet_service()
    mbx = Mailbox(
        user_id=user.id,
        workspace_id=user.workspace_id,
        email_address=payload.email_address.lower(),
        provider=MailboxProvider(payload.provider),
        # New mailboxes start warming immediately: the workspace auto-routes to
        # the peer pool matching its plan (see auto_route_workspace_by_plan,
        # called after persist), so there's no admin-gated pending wait.
        warmup_status=WarmupStatus.active,
        daily_target=payload.daily_target,
        # Day 1 of the ramp ladder (D1–3 owes 5/day).
        current_day=1,
        warmth_score=0.0,
        content_mode=_content_mode_db(payload.content_mode),
        is_paused=False,
        spf_valid=None,
        dkim_valid=None,
        dmarc_valid=None,
    )

    if isinstance(payload, MailboxCreateSmtp):
        # Encrypt then IMMEDIATELY wipe plaintext. Don't keep the attribute
        # on ``payload`` alive a moment longer than necessary.
        plaintext = payload.smtp_password
        encrypted = fernet.encrypt(plaintext.encode("utf-8"))
        plaintext = ""
        with contextlib.suppress(Exception):
            object.__setattr__(payload, "smtp_password", "")
        del plaintext

        mbx.smtp_host = payload.smtp_host
        mbx.smtp_port = payload.smtp_port
        mbx.smtp_username = payload.smtp_username
        mbx.smtp_password_encrypted = encrypted
        mbx.imap_host = payload.imap_host
        mbx.imap_port = payload.imap_port
    else:
        plaintext = payload.oauth_refresh_token
        encrypted = fernet.encrypt(plaintext.encode("utf-8"))
        plaintext = ""
        with contextlib.suppress(Exception):
            object.__setattr__(payload, "oauth_refresh_token", "")
        del plaintext

        mbx.oauth_token_encrypted = encrypted

    session.add(mbx)
    await session.flush()  # materialize mbx.id / mbx.created_at

    # Onboarding transition (spec §4): any successful mailbox-create from
    # `plan_selected` flips the user to `active`. We used to require
    # `first_mailbox` here, but that broke the upgrade flow — a user who
    # already had a Starter mailbox and then upgraded to Pro/Pro Plus would
    # land on `plan_selected` again after checkout, but their next mailbox
    # create couldn't transition them because `first_mailbox` was False.
    # Result: the frontend onboarding wizard stalled on the credentials
    # step because it never saw `onboarding_status` flip. Treat every
    # mailbox-create from `plan_selected` as the trigger to mark onboarding
    # complete; `first_mailbox` is still tracked so the audit log records
    # whether this was the very first mailbox or a subsequent one.
    current_status = (
        user.onboarding_status.value
        if hasattr(user.onboarding_status, "value")
        else str(user.onboarding_status)
    )
    if current_status == OnboardingStatus.plan_selected.value:
        user.onboarding_status = OnboardingStatus.active
        await session.flush()
        await _write_audit(
            session,
            action="user.onboarding_completed",
            actor_user_id=user.id,
            actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
            target_id=user.id,
            payload={"mailbox_id": str(mbx.id), "first_mailbox": first_mailbox},
        )

    await _write_audit(
        session,
        action="mailbox.created",
        actor_user_id=user.id,
        actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
        target_id=mbx.id,
        payload={
            "mailbox_id": str(mbx.id),
            "provider": payload.provider,
            "email_address": mbx.email_address,
        },
    )

    await session.commit()
    await session.refresh(mbx)

    # Notify user that mailbox is connected and warmup has started
    try:
        await notification_inbox_service.notify_user(
            session,
            user_id=user.id,
            kind="mailbox_connected",
            title="Mailbox connected",
            body=f"{mbx.email_address} is now connected. Warmup has started — your first warm-up email is being sent now.",
            payload={"mailbox_id": str(mbx.id), "email_address": mbx.email_address},
            commit=False,  # already committed above
        )
    except Exception:
        logger.warning("Failed to send mailbox_connected notification", exc_info=True)

    # Auto-route the workspace to the peer pool matching the owner's plan so
    # warmup begins immediately. Best-effort: a routing failure must never
    # break mailbox creation (the mailbox is already persisted + active).
    try:
        plan_name: str | None = None
        if user.plan_id is not None:
            plan = await session.get(Plan, user.plan_id)
            if plan is not None:
                plan_name = plan.name
        # Always call: with no plan (or no pool named after it) this now routes
        # the workspace to the default pool rather than leaving it unassigned.
        from app.services import peer_pool_service

        await peer_pool_service.auto_route_workspace_by_plan(
            session,
            workspace_id=user.workspace_id,
            plan_name=plan_name,
            actor=user,
        )
    except Exception:  # pragma: no cover - defensive
        logger.warning(
            "auto-route by plan failed for workspace=%s",
            user.workspace_id,
            exc_info=True,
        )

    # Start warming immediately instead of waiting up to 15 minutes for the
    # next beat cycle. A brand-new mailbox otherwise sits visibly idle right
    # after connecting, which reads as "nothing is happening".
    #
    # Best-effort: the beat scheduler will pick this mailbox up regardless, so
    # a broker hiccup here only costs the head start, never the mailbox. The
    # send task re-checks the daily ramp quota, so this cannot exceed the
    # day-1 allowance.
    try:
        from app.tasks.warmup_send import send_single_warmup_email

        send_single_warmup_email.delay(str(mbx.id))
        if mbx.provider == MailboxProvider.gmail and mbx.oauth_token_encrypted:
            from app.tasks.client_engagement import engage_client_gmail_mailbox

            engage_client_gmail_mailbox.delay(str(mbx.id))
    except Exception:  # pragma: no cover - defensive
        logger.warning(
            "immediate warmup kickoff failed for mailbox=%s", mbx.id, exc_info=True
        )

    return mbx


# --------------------------------------------------------------------------- #
# Update                                                                       #
# --------------------------------------------------------------------------- #


_ALLOWED_PATCH_FIELDS = {"daily_target", "content_mode", "schedule_window_id", "is_paused"}


async def update_mailbox(
    session: AsyncSession,
    *,
    user: User,
    mailbox_id: uuid.UUID,
    payload: MailboxUpdate,
) -> Mailbox:
    mbx = await get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )

    # Pydantic ``extra='forbid'`` rejects unknown fields at parse time; we
    # additionally defend in depth here.
    data = payload.model_dump(exclude_unset=True)
    changes: dict[str, Any] = {}

    for field, value in data.items():
        if field not in _ALLOWED_PATCH_FIELDS:
            continue
        changes[field] = value

    if "daily_target" in changes and changes["daily_target"] is not None:
        mbx.daily_target = int(changes["daily_target"])
    if "content_mode" in changes and changes["content_mode"] is not None:
        mbx.content_mode = _content_mode_db(changes["content_mode"])
    if "schedule_window_id" in changes:
        mbx.schedule_window_id = changes["schedule_window_id"]

    if "is_paused" in changes and changes["is_paused"] is not None:
        new_paused = bool(changes["is_paused"])
        mbx.is_paused = new_paused
        current = (
            mbx.warmup_status.value
            if hasattr(mbx.warmup_status, "value")
            else str(mbx.warmup_status)
        )
        # Only toggle status for running mailboxes — never demote pending/completed.
        if current not in {WarmupStatus.pending.value, WarmupStatus.completed.value}:
            mbx.warmup_status = (
                WarmupStatus.paused if new_paused else WarmupStatus.active
            )

    await session.flush()
    await _write_audit(
        session,
        action="mailbox.updated",
        actor_user_id=user.id,
        actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
        target_id=mbx.id,
        payload={"mailbox_id": str(mbx.id), "fields": sorted(changes.keys())},
    )
    await session.commit()
    await session.refresh(mbx)
    return mbx


# --------------------------------------------------------------------------- #
# Pause / Resume                                                               #
# --------------------------------------------------------------------------- #


async def pause_mailbox(
    session: AsyncSession, *, user: User, mailbox_id: uuid.UUID
) -> Mailbox:
    mbx = await get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    mbx.is_paused = True
    mbx.warmup_status = WarmupStatus.paused
    await session.flush()
    await _write_audit(
        session,
        action="mailbox.paused",
        actor_user_id=user.id,
        actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
        target_id=mbx.id,
        payload={"mailbox_id": str(mbx.id)},
    )
    await session.commit()
    await session.refresh(mbx)
    return mbx


async def resume_mailbox(
    session: AsyncSession, *, user: User, mailbox_id: uuid.UUID
) -> Mailbox:
    mbx = await get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    mbx.is_paused = False
    mbx.warmup_status = WarmupStatus.active
    await session.flush()
    await _write_audit(
        session,
        action="mailbox.resumed",
        actor_user_id=user.id,
        actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
        target_id=mbx.id,
        payload={"mailbox_id": str(mbx.id)},
    )
    await session.commit()
    await session.refresh(mbx)
    return mbx


async def bulk_pause_mailboxes(
    session: AsyncSession,
    *,
    actor: User,
    user_ids: list[uuid.UUID],
    action: str,
) -> dict[str, Any]:
    """Admin bulk pause/resume of every mailbox in the target users' workspaces.

    ``user_ids == []`` means ALL users with ``role == client``. Explicit ids
    are filtered to clients only — super_admin ids are silently skipped (and
    counted). Pause mirrors :func:`pause_mailbox` but is scoped like the
    resume branch: only rows currently ``warmup_status IN (active, paused)``
    flip, so pending/completed mailboxes keep their lifecycle status; resume
    only rows currently ``warmup_status == paused`` (and ``is_paused``) go
    back to active.
    """
    if user_ids:
        unique_ids = set(user_ids)
        result = await session.execute(
            select(User).where(
                User.id.in_(unique_ids), User.role == UserRole.client
            )
        )
        targets = list(result.scalars().all())
        skipped = len(unique_ids) - len(targets)
    else:
        result = await session.execute(
            select(User).where(User.role == UserRole.client)
        )
        targets = list(result.scalars().all())
        skipped = 0

    workspace_ids = [u.workspace_id for u in targets]
    mailboxes_updated = 0
    if workspace_ids:
        if action == "pause":
            # Only rows currently active/paused flip — pending/completed
            # mailboxes keep their lifecycle status (mirrors the resume
            # branch's "never warmup-(de)activate out of lifecycle" scoping).
            stmt = (
                update(Mailbox)
                .where(
                    Mailbox.workspace_id.in_(workspace_ids),
                    Mailbox.warmup_status.in_(
                        [WarmupStatus.active, WarmupStatus.paused]
                    ),
                )
                .values(is_paused=True, warmup_status=WarmupStatus.paused)
            )
        else:
            # Resume — only rows currently paused flip back to active, so
            # pending/completed mailboxes are never warmup-activated.
            stmt = (
                update(Mailbox)
                .where(
                    Mailbox.workspace_id.in_(workspace_ids),
                    Mailbox.warmup_status == WarmupStatus.paused,
                    Mailbox.is_paused.is_(True),
                )
                .values(is_paused=False, warmup_status=WarmupStatus.active)
            )
        result = await session.execute(stmt)
        mailboxes_updated = int(result.rowcount or 0)

    await _write_audit(
        session,
        action=f"admin_bulk_mailbox_{action}",
        actor_user_id=actor.id,
        actor_role=(
            actor.role.value if hasattr(actor.role, "value") else str(actor.role)
        ),
        payload={
            "action": action,
            "requested_user_ids": [str(i) for i in user_ids],
            "users_affected": len(targets),
            "mailboxes_updated": mailboxes_updated,
            "skipped_super_admin": skipped,
        },
    )
    await session.commit()
    return {
        "users_affected": len(targets),
        "mailboxes_updated": mailboxes_updated,
        "skipped_super_admin": skipped,
    }


# --------------------------------------------------------------------------- #
# Delete — wipe creds first, then remove row                                   #
# --------------------------------------------------------------------------- #


_GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"


async def _revoke_google_grant(oauth_token_encrypted: bytes) -> bool:
    """Ask Google to revoke the stored refresh token. Never raises.

    Returns True when Google confirmed the revocation. Revoking a refresh
    token invalidates the whole grant, so the user's Google Account stops
    listing WarmPulse immediately.

    The plaintext token lives only inside this function and is re-bound and
    deleted before returning, matching the credential-handling pattern in
    ``smtp_sender.send_email``.
    """
    import httpx  # local — keeps the module import graph light

    token = ""
    try:
        token = get_fernet_service().decrypt(oauth_token_encrypted).decode("utf-8")
    except Exception as exc:  # noqa: BLE001 — corrupt/rotated key, nothing to revoke
        logger.warning(
            "mailbox.revoke.decrypt_failed err=%s", _sanitize_exception(exc)
        )
        return False

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                _GOOGLE_REVOKE_URL,
                data={"token": token},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        # Google answers 200 on success. A 400 usually means the token was
        # already expired or revoked — the end state we wanted either way.
        if resp.status_code == 200:
            logger.info("mailbox.revoke.ok")
            return True
        logger.info("mailbox.revoke.non_200 status=%s", resp.status_code)
        return False
    except Exception as exc:  # noqa: BLE001 — network/DNS/timeout
        logger.warning("mailbox.revoke.failed err=%s", _sanitize_exception(exc))
        return False
    finally:
        token = "REDACTED"
        del token


async def delete_mailbox(
    session: AsyncSession, *, user: User, mailbox_id: uuid.UUID
) -> None:
    mbx = await get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    mailbox_id_copy = mbx.id
    email_copy = mbx.email_address

    # Hand the OAuth grant back to Google before we drop the token.
    #
    # Deleting our copy of the refresh token stops US using it, but the grant
    # stays live on the user's Google Account — WarmPulse would keep showing
    # up under "Third-party apps with account access" with gmail.modify
    # still granted until the user revoked it by hand. gmail.modify is a
    # RESTRICTED scope, so releasing it the moment the user disconnects is
    # the behaviour Google's restricted-scope review expects.
    #
    # Best-effort by design: a revoke failure must never strand the user with
    # a mailbox they cannot remove, so we log and continue with the delete.
    if mbx.provider == MailboxProvider.gmail and mbx.oauth_token_encrypted:
        # The helper already swallows its own failures, but the guarantee that
        # a disconnect always completes should not depend on that staying
        # true — belt and braces so a future refactor can't strand the user.
        with contextlib.suppress(Exception):
            await _revoke_google_grant(mbx.oauth_token_encrypted)

    # Wipe encrypted columns before the DELETE so transient WAL / rollback
    # scenarios can never resurrect the ciphertext.
    mbx.smtp_password_encrypted = b""
    mbx.oauth_token_encrypted = b""
    await session.flush()

    await session.delete(mbx)
    await session.flush()

    await _write_audit(
        session,
        action="mailbox.deleted",
        actor_user_id=user.id,
        actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
        target_id=mailbox_id_copy,
        payload={"mailbox_id": str(mailbox_id_copy), "email_address": email_copy},
    )
    # In-app inbox row so the user has a clear record of the disconnect
    # — useful when a deletion was triggered by an OAuth-revoke or a
    # bounce-cap rather than an explicit user click.
    from app.services import notification_inbox_service

    await notification_inbox_service.notify_user(
        session,
        user_id=user.id,
        kind="mailbox_disconnected",
        title="Mailbox disconnected",
        body=(
            f"{email_copy} was removed from your workspace. Reconnect from "
            "the Mailboxes page to resume warmup."
        ),
        payload={"url": "/app/mailboxes", "email_address": email_copy},
        commit=False,
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Test connection — SMTP + IMAP AUTH probe                                     #
# --------------------------------------------------------------------------- #


_TIMEOUT_SECONDS = 10.0


def _sanitize_exception(exc: BaseException) -> str:
    """Return ``<ClassName>: <hint>`` with no raw message (may echo creds)."""
    name = type(exc).__name__
    lname = name.lower()
    text = str(exc).lower()

    if "timeout" in lname or "timeout" in text:
        hint = "timeout"
    elif "refused" in text or "refused" in lname:
        hint = "connection_refused"
    elif "auth" in lname or "auth" in text or "login" in text:
        hint = "authentication_failed"
    elif "ssl" in lname or "ssl" in text or "tls" in text:
        hint = "tls_error"
    elif "resolv" in text or "name or service not known" in text or "getaddrinfo" in text:
        hint = "dns_error"
    else:
        hint = "connection_failed"
    return f"{name}: {hint}"


def _permissive_tls_context() -> ssl.SSLContext:
    """TLS context that encrypts the wire but skips chain/hostname verification.

    Why we tolerate self-signed certs here: shared mail hosts (Hostinger, many
    cPanel setups, self-hosted iRedMail before Let's Encrypt is wired) routinely
    present a wildcard cert for ``*.hostinger.com`` while users connect via
    ``mail.theirdomain.com`` — strict chain verification rejects this with
    ``SSLCertVerificationError`` *before* auth even runs. This is the same
    "I trust this server" posture Thunderbird/Outlook expose as a checkbox.
    The credential probe still genuinely tests AUTH; we simply don't refuse
    to talk to a server whose cert chain is messy.
    """
    import ssl

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def _probe_smtp(
    host: str, port: int, username: str, password: str
) -> tuple[bool, str | None]:
    """Open an SMTP session and try AUTH. Never leak raw exception messages.

    TEMPORARY: when ``settings.mailbox_probes_dummy`` is True the probe is
    skipped and we return success unconditionally. This lets the user
    iterate on the onboarding flow without burning real mailboxes. Flip
    MAILBOX_PROBES_DUMMY=false in .env (or remove the setting entirely)
    to restore live probes — required before shipping as real SaaS.
    """
    from app.config import get_settings

    if get_settings().mailbox_probes_dummy:
        logger.info("[probe-dummy] skipping SMTP probe for %s@%s:%s", username, host, port)
        return True, None

    import aiosmtplib

    try:
        tls = _permissive_tls_context()
        # Port 465 = implicit TLS; 587 = STARTTLS upgrade; anything else = plain
        # then opportunistic STARTTLS.
        if port == 465:
            client = aiosmtplib.SMTP(
                hostname=host, port=port, timeout=_TIMEOUT_SECONDS,
                use_tls=True, tls_context=tls, validate_certs=False,
            )
        else:
            client = aiosmtplib.SMTP(
                hostname=host, port=port, timeout=_TIMEOUT_SECONDS,
                start_tls=True, tls_context=tls, validate_certs=False,
            )

        async def _go() -> None:
            await client.connect()
            try:
                await client.login(username, password)
            finally:
                with contextlib.suppress(Exception):
                    await client.quit()

        await asyncio.wait_for(_go(), timeout=_TIMEOUT_SECONDS)
        return True, None
    except Exception as exc:  # noqa: BLE001 — class name only, never the message
        return False, f"probe_unknown: {type(exc).__name__}"


async def _probe_imap(
    host: str, port: int, username: str, password: str
) -> tuple[bool, str | None]:
    """Open an IMAP session and try AUTH.

    TEMPORARY: same dummy bypass as _probe_smtp. Restore by flipping
    MAILBOX_PROBES_DUMMY=false in .env.
    """
    from app.config import get_settings

    if get_settings().mailbox_probes_dummy:
        logger.info("[probe-dummy] skipping IMAP probe for %s@%s:%s", username, host, port)
        return True, None

    import aioimaplib

    try:
        # Same permissive TLS posture as _probe_smtp — see docstring there.
        client = aioimaplib.IMAP4_SSL(
            host=host, port=port, timeout=_TIMEOUT_SECONDS,
            ssl_context=_permissive_tls_context(),
        )

        async def _go() -> None:
            await client.wait_hello_from_server()
            resp = await client.login(username, password)
            ok = getattr(resp, "result", None)
            if ok is not None and str(ok).upper() != "OK":
                raise RuntimeError("imap login rejected")
            with contextlib.suppress(Exception):
                await client.logout()

        await asyncio.wait_for(_go(), timeout=_TIMEOUT_SECONDS)
        return True, None
    except Exception as exc:  # noqa: BLE001 — class name only, never the message
        return False, f"probe_unknown: {type(exc).__name__}"


async def test_connection(
    session: AsyncSession, *, user: User, mailbox_id: uuid.UUID
) -> TestConnectionResponse:
    """Run SMTP AUTH + IMAP AUTH probes; never leak raw creds in errors."""
    mbx = await get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )

    provider = (
        mbx.provider.value if hasattr(mbx.provider, "value") else str(mbx.provider)
    )
    if provider in {"gmail", "outlook"}:
        # OAuth providers need XOAUTH2 flows — that's a later wave.
        return TestConnectionResponse(
            smtp_ok=True,
            imap_ok=True,
            note="OAuth providers use XOAUTH2 — a proper test is scheduled for a later wave.",
        )

    if not (mbx.smtp_host and mbx.smtp_port and mbx.smtp_username and mbx.smtp_password_encrypted):
        return TestConnectionResponse(
            smtp_ok=False,
            imap_ok=False,
            smtp_error="ConfigError: missing_smtp_config",
            imap_error="ConfigError: missing_smtp_config",
        )

    fernet = get_fernet_service()
    # Plaintext lifetime: decrypt → hand to the ladder → wipe.
    password = fernet.decrypt(mbx.smtp_password_encrypted).decode("utf-8")
    try:
        result = await run_preflight(
            PreflightRequest(
                smtp_host=mbx.smtp_host,
                smtp_port=mbx.smtp_port,
                username=mbx.smtp_username,
                password=password,
                imap_host=mbx.imap_host,
                imap_port=mbx.imap_port,
            )
        )
    finally:
        password = ""

    blocking = result.blocking
    smtp_failed = blocking is not None and not blocking.id.startswith("imap_")
    imap_failed = blocking is not None and blocking.id.startswith("imap_")
    return TestConnectionResponse(
        smtp_ok=not smtp_failed,
        imap_ok=None if not (mbx.imap_host and mbx.imap_port) else not imap_failed,
        smtp_error=f"{blocking.id}: {blocking.detail}" if smtp_failed else None,
        imap_error=f"{blocking.id}: {blocking.detail}" if imap_failed else None,
        note=blocking.remedy if blocking else None,
    )


# --------------------------------------------------------------------------- #
# ON-DEMAND WARMUP TRIGGER                                                    #
# --------------------------------------------------------------------------- #


async def run_warmup_now(
    session: AsyncSession, *, user: User, mailbox_id: uuid.UUID
) -> RunWarmupNowResponse:
    """Enqueue one warmup send (and, for Gmail, one engagement pass) now.

    The beat schedule already drives warmup every 15 minutes; this is the
    manual escape hatch so a user can watch the engine work immediately after
    connecting a mailbox instead of waiting out the cycle.

    Guards mirror ``tasks.warmup_send._schedule_impl`` so a manual trigger can
    never exceed what the scheduler itself would have sent:

    * mailbox must belong to the caller's workspace (404 otherwise)
    * mailbox must be active and unpaused (409)
    * the workspace must not be sabotaged (409)
    * today's ramp quota must not already be spent (409)

    The schedule *window* is deliberately NOT enforced — a manual trigger is
    an explicit user action, so "outside your send window" shouldn't block it.
    """
    # Imported lazily: app.tasks imports app.services, so a module-level
    # import here would close a circular import loop at startup.
    from app.services.warmup.ramp import ramp_target
    from app.services.warmup.sabotage import sabotaged_workspace_ids
    from app.services.warmup.timing import today_count_utc
    from app.tasks.client_engagement import engage_client_gmail_mailbox
    from app.tasks.warmup_send import send_single_warmup_email

    mbx = await get_mailbox_or_404(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )

    if mbx.is_paused or mbx.warmup_status != WarmupStatus.active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Warmup is not active for this mailbox — resume it first.",
        )

    if mbx.workspace_id in await sabotaged_workspace_ids(session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Warmup is suspended for this workspace.",
        )

    sent_today = await today_count_utc(mbx.id, session)
    quota_today = ramp_target(mbx.current_day, mbx.daily_target)
    if sent_today >= quota_today:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Today's warmup quota is already used ({sent_today}/{quota_today}). "
                "Sending more would break the ramp — try again tomorrow."
            ),
        )

    send_single_warmup_email.delay(str(mbx.id))

    # The engagement pass (spam-rescue / mark-read / star / label) runs
    # through the Gmail API, so it only applies to OAuth-connected Gmail
    # mailboxes. Everything else warms up send-only from this trigger.
    engage_queued = (
        mbx.provider == MailboxProvider.gmail and mbx.oauth_token_encrypted is not None
    )
    if engage_queued:
        engage_client_gmail_mailbox.delay(str(mbx.id))

    return RunWarmupNowResponse(
        send_queued=True,
        engage_queued=engage_queued,
        sent_today=sent_today,
        quota_today=quota_today,
        note=(
            "Warmup send queued. A peer inbox will receive it within a minute; "
            "engagement (open / reply / star / spam-rescue) follows on the next "
            "inbound cycle."
        ),
    )
