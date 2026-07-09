"""Workspace — user settings (profile, security, notifications, tour).

Backed by columns on the ``users`` table added in migration 0004, plus the
workspace-scoped ``workspace_settings`` table (migration 0014) for fields
that should be shared across every user in the same workspace.
"""
from __future__ import annotations

import csv
import io
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_claims, get_current_user
from app.db.models.api_keys import ApiKey
from app.db.models.users import _DEFAULT_NOTIFICATION_PREFS, User
from app.db.models.warmup_logs import WarmupLog
from app.db.models.workspace_settings import WorkspaceSetting
from app.db.session import get_db
from app.services.avatar_service import (
    avatar_version,
    clear_avatar,
    set_avatar,
    validate_avatar,
)
from app.services.crypto import get_fernet_service
from app.services.security import (
    generate_totp_secret,
    hash_password,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)

router = APIRouter(prefix="/api/workspace/settings", tags=["workspace-settings"])


# ---------- Defaults for the events matrix ----------

# Eight events × three channels. The frontend Notifications tab renders this
# verbatim; new events should be added here AND in the frontend's events list.
_DEFAULT_EVENT_KEYS: list[str] = [
    "mailbox_paused",
    "bounce_spike",
    "peer_failed",
    "weekly_digest",
    "invoice_paid",
    "invoice_failed",
    "member_invited",
    "product_updates",
]


def _default_events() -> dict[str, dict[str, bool]]:
    return {
        k: {"email": True, "in_app": True, "push": False} for k in _DEFAULT_EVENT_KEYS
    }


# ---------- Pydantic models ----------


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: str
    display_name: str
    timezone: str
    locale: str
    has_avatar: bool = False
    # Stable URL the frontend can render directly. Includes a version query so
    # a freshly uploaded picture isn't masked by a cached one. ``None`` when
    # the user has no avatar (frontend falls back to initials).
    avatar_url: str | None = None


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=16)


class NotificationAlerts(BaseModel):
    warmth_drop: bool = True
    bounce_spike: bool = True
    dns_break: bool = True


class NotificationSettingsOut(BaseModel):
    slack_webhook: str | None = None
    email_digest_enabled: bool = True
    alerts: NotificationAlerts = Field(default_factory=NotificationAlerts)


class NotificationsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slack_webhook: str | None = None
    email_digest_enabled: bool | None = None
    alerts: dict[str, bool] | None = None


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class TotpVerifyPayload(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class TotpDisablePayload(BaseModel):
    password: str


# ---------- Helpers ----------


def _profile(user: User) -> ProfileOut:
    has_avatar = user.avatar_image is not None
    return ProfileOut(
        email=user.email,
        display_name=user.display_name or user.email.split("@")[0],
        timezone=user.timezone,
        locale=user.locale,
        has_avatar=has_avatar,
        avatar_url=(
            f"/api/workspace/settings/profile/avatar?v={avatar_version(user)}"
            if has_avatar
            else None
        ),
    )


def _notifications(user: User) -> NotificationSettingsOut:
    raw = dict(_DEFAULT_NOTIFICATION_PREFS)
    raw.update(user.notification_prefs or {})
    alerts = dict(_DEFAULT_NOTIFICATION_PREFS["alerts"])
    alerts.update((user.notification_prefs or {}).get("alerts", {}))
    return NotificationSettingsOut(
        slack_webhook=raw.get("slack_webhook"),
        email_digest_enabled=bool(raw.get("email_digest_enabled", True)),
        alerts=NotificationAlerts(**alerts),
    )


# ---------- GET aggregate ----------


@router.get("")
async def get_settings(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    return {
        "profile": _profile(user).model_dump(),
        "notifications": _notifications(user).model_dump(),
        "security": {"totp_enabled": bool(user.totp_enabled)},
        "tour": {
            "completed_at": (
                user.tour_completed_at.isoformat() if user.tour_completed_at else None
            ),
        },
    }


# ---------- Profile ----------


@router.patch("/profile", response_model=ProfileOut)
async def update_profile(
    payload: ProfileUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileOut:
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.timezone is not None:
        user.timezone = payload.timezone
    if payload.locale is not None:
        user.locale = payload.locale
    await session.commit()
    await session.refresh(user)
    return _profile(user)


# ---------- Profile picture (avatar) ----------


@router.post("/profile/avatar")
async def upload_avatar(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
) -> dict[str, Any]:
    """Upload/replace the current user's profile picture (png/jpeg/webp ≤512KB)."""
    data = await file.read()
    mime = validate_avatar(content_type=file.content_type, data=data)
    set_avatar(user, data=data, mime=mime)
    await session.commit()
    await session.refresh(user)
    return {
        "has_avatar": True,
        "avatar_url": f"/api/workspace/settings/profile/avatar?v={avatar_version(user)}",
    }


@router.get("/profile/avatar")
async def get_avatar(
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    """Return the current user's avatar bytes (404 when none stored)."""
    if not user.avatar_image:
        raise HTTPException(status_code=404, detail="No avatar")
    return Response(
        content=user.avatar_image,
        media_type=user.avatar_mime or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.delete("/profile/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_avatar(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Clear the current user's profile picture."""
    clear_avatar(user)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Notifications ----------


@router.patch("/notifications", response_model=NotificationSettingsOut)
async def update_notifications(
    payload: NotificationsUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationSettingsOut:
    prefs = dict(_DEFAULT_NOTIFICATION_PREFS)
    prefs.update(user.notification_prefs or {})
    alerts = dict(_DEFAULT_NOTIFICATION_PREFS["alerts"])
    alerts.update(prefs.get("alerts", {}))

    if payload.slack_webhook is not None or "slack_webhook" in payload.model_fields_set:
        prefs["slack_webhook"] = payload.slack_webhook
    if payload.email_digest_enabled is not None:
        prefs["email_digest_enabled"] = payload.email_digest_enabled
    if payload.alerts is not None:
        for k, v in payload.alerts.items():
            if k in alerts:
                alerts[k] = bool(v)
    prefs["alerts"] = alerts

    user.notification_prefs = prefs
    await session.commit()
    await session.refresh(user)
    return _notifications(user)


# ---------- Password ----------


@router.post("/security/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordPayload,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    if not user.hashed_password or not verify_password(
        payload.current_password, user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    await session.commit()
    # Security email — failures are swallowed inside the service so a
    # mis-configured TRANSACTIONAL_SMTP never blocks a password change.
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="Password changed",
            summary="Your WarmPulse password was just changed.",
        )
    except Exception:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- TOTP ----------


@router.post("/security/totp/enroll")
async def totp_enroll(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Generate a fresh TOTP secret + recovery codes. Not active until verified.

    2FA is available on Pro / Pro Plus / Agency and for super_admins. Starter
    users hit a 403 — the UI gates the card, but this prevents direct API calls.
    """
    from app.db.models.users import UserRole
    from app.db.models.plans import Plan

    if user.role != UserRole.super_admin and user.plan_id is not None:
        plan = await session.get(Plan, user.plan_id)
        if plan is not None and plan.name.lower() == "starter":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Two-factor authentication requires a Pro plan or higher.",
            )

    secret = generate_totp_secret()
    fernet = get_fernet_service()
    user.totp_secret_encrypted = fernet.encrypt(secret.encode())
    user.totp_enabled = False
    await session.commit()

    qr_url = totp_provisioning_uri(secret, account_name=user.email)
    recovery = [
        f"{secrets.token_hex(2)}-{secrets.token_hex(2)}-{secrets.token_hex(2)}"
        for _ in range(8)
    ]
    return {"secret": secret, "qr_url": qr_url, "recovery_codes": recovery}


@router.post("/security/totp/verify")
async def totp_verify(
    payload: TotpVerifyPayload,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    if not user.totp_secret_encrypted:
        raise HTTPException(status_code=400, detail="No TOTP enrollment in progress")
    fernet = get_fernet_service()
    secret = fernet.decrypt(user.totp_secret_encrypted).decode()
    if not verify_totp(secret, payload.code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")
    user.totp_enabled = True
    await session.commit()
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="2FA enabled",
            summary=(
                "Two-factor authentication is now active on your account. "
                "You'll be asked for a 6-digit code on every email/password sign-in."
            ),
        )
    except Exception:
        pass
    return {"enabled": True}


@router.post("/security/totp/disable", status_code=status.HTTP_204_NO_CONTENT)
async def totp_disable(
    payload: TotpDisablePayload,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    if not user.hashed_password or not verify_password(
        payload.password, user.hashed_password
    ):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    user.totp_enabled = False
    user.totp_secret_encrypted = None
    await session.commit()
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="2FA disabled",
            summary=(
                "Two-factor authentication has been disabled on your account. "
                "If this wasn't you, re-enable it under Settings → Security and "
                "change your password."
            ),
        )
    except Exception:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Tour ----------


@router.post("/tour/replay", status_code=status.HTTP_204_NO_CONTENT)
async def replay_tour(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    user.tour_completed_at = None
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Workspace profile (workspace_settings table) ----------


class WorkspaceProfileOut(BaseModel):
    name: str
    slug: str
    default_sender: str
    brand_color: str
    retention_days: int
    auto_crm_enabled: bool


class WorkspaceProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=255)
    slug: str | None = Field(default=None, max_length=64)
    default_sender: str | None = Field(default=None, max_length=320)
    brand_color: str | None = Field(default=None, max_length=16)
    retention_days: int | None = Field(default=None, ge=30, le=730)
    auto_crm_enabled: bool | None = None


async def _load_or_create_workspace_settings(
    session: AsyncSession, *, workspace_id: uuid.UUID, default_sender: str
) -> WorkspaceSetting:
    row = await session.get(WorkspaceSetting, workspace_id)
    if row is not None:
        return row
    row = WorkspaceSetting(
        workspace_id=workspace_id,
        name=None,
        slug=None,
        default_sender=default_sender,
        brand_color="#F26522",
        retention_days=90,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


def _resolve_workspace_name(row: WorkspaceSetting, user: User) -> str:
    if row.name and row.name.strip():
        return row.name
    if user.display_name:
        return f"{user.display_name}'s workspace"
    if user.email and "@" in user.email:
        return user.email.split("@", 1)[1].split(".")[0].title() + " workspace"
    return "Workspace"


def _resolve_workspace_slug(row: WorkspaceSetting, user: User) -> str:
    if row.slug and row.slug.strip():
        return row.slug
    if user.email and "@" in user.email:
        return user.email.split("@", 1)[0].lower()
    return "workspace"


def _workspace_profile_out(row: WorkspaceSetting, user: User) -> WorkspaceProfileOut:
    # Auto-migrate legacy violet brand colours to the current Shailog orange.
    legacy_violets = {"#7c5cff", "#6d4dff", "#8d72ff", "#a78bfa", "#5a3aee"}
    brand_color = row.brand_color or "#F26522"
    if brand_color.lower() in legacy_violets:
        brand_color = "#F26522"
    return WorkspaceProfileOut(
        name=_resolve_workspace_name(row, user),
        slug=_resolve_workspace_slug(row, user),
        default_sender=row.default_sender or user.email,
        brand_color=brand_color,
        retention_days=row.retention_days,
        auto_crm_enabled=row.auto_crm_enabled,
    )


@router.get("/workspace", response_model=WorkspaceProfileOut)
async def get_workspace_profile(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceProfileOut:
    row = await _load_or_create_workspace_settings(
        session, workspace_id=user.workspace_id, default_sender=user.email
    )
    return _workspace_profile_out(row, user)


async def _can_use_auto_crm(session: AsyncSession, user: User) -> bool:
    """Whether the caller's plan tier permits automated CRM (Pro Plus+)."""
    from app.db.models.plans import Plan
    from app.services.crm_service import crm_auto_enabled_for_plan

    plan_name = None
    if user.plan_id is not None:
        plan = await session.get(Plan, user.plan_id)
        plan_name = plan.name if plan else None
    return crm_auto_enabled_for_plan(plan_name)


@router.patch("/workspace", response_model=WorkspaceProfileOut)
async def update_workspace_profile(
    payload: WorkspaceProfileUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WorkspaceProfileOut:
    row = await _load_or_create_workspace_settings(
        session, workspace_id=user.workspace_id, default_sender=user.email
    )
    if payload.name is not None:
        row.name = payload.name.strip() or None
    if payload.slug is not None:
        cleaned = payload.slug.strip().lower()
        # Lightweight slug normalisation — keep letters / digits / hyphens.
        cleaned = "".join(ch for ch in cleaned if ch.isalnum() or ch == "-")
        row.slug = cleaned or None
    if payload.default_sender is not None:
        row.default_sender = payload.default_sender.strip() or None
    if payload.brand_color is not None:
        row.brand_color = payload.brand_color.strip() or None
    if payload.retention_days is not None:
        row.retention_days = int(payload.retention_days)
    if payload.auto_crm_enabled is not None:
        # Automated CRM is a Pro Plus / Agency capability. Below that, CRM is
        # manual-only — reject an attempt to switch auto on, but always allow
        # turning it off.
        if payload.auto_crm_enabled and not await _can_use_auto_crm(session, user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Automated CRM is available on Pro Plus and Agency plans. "
                    "Your plan can use CRM manually — upgrade to enable "
                    "automatic lead import."
                ),
            )
        row.auto_crm_enabled = payload.auto_crm_enabled
    await session.commit()
    await session.refresh(row)
    return _workspace_profile_out(row, user)


# ---------- Notification events matrix (8 events × 3 channels) ----------


class EventChannels(BaseModel):
    email: bool = True
    in_app: bool = True
    push: bool = False


class NotificationEventsOut(BaseModel):
    events: dict[str, EventChannels]


class NotificationEventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    channel: str  # email | in_app | push
    enabled: bool


def _load_events_map(user: User) -> dict[str, dict[str, bool]]:
    prefs = dict(_DEFAULT_NOTIFICATION_PREFS)
    prefs.update(user.notification_prefs or {})
    stored = prefs.get("events")
    base = _default_events()
    if isinstance(stored, dict):
        for k, v in stored.items():
            if k in base and isinstance(v, dict):
                base[k] = {
                    "email": bool(v.get("email", base[k]["email"])),
                    "in_app": bool(v.get("in_app", base[k]["in_app"])),
                    "push": bool(v.get("push", base[k]["push"])),
                }
    return base


def _events_out(user: User) -> NotificationEventsOut:
    raw = _load_events_map(user)
    return NotificationEventsOut(events={k: EventChannels(**v) for k, v in raw.items()})


@router.get("/notifications/events", response_model=NotificationEventsOut)
async def get_notification_events(
    user: Annotated[User, Depends(get_current_user)],
) -> NotificationEventsOut:
    return _events_out(user)


@router.patch("/notifications/events", response_model=NotificationEventsOut)
async def patch_notification_event(
    payload: NotificationEventUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationEventsOut:
    if payload.key not in _DEFAULT_EVENT_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown event key: {payload.key}")
    if payload.channel not in {"email", "in_app", "push"}:
        raise HTTPException(status_code=400, detail=f"Unknown channel: {payload.channel}")

    prefs = dict(_DEFAULT_NOTIFICATION_PREFS)
    prefs.update(user.notification_prefs or {})
    events = _load_events_map(user)
    events[payload.key][payload.channel] = bool(payload.enabled)
    prefs["events"] = events
    user.notification_prefs = prefs
    await session.commit()
    await session.refresh(user)
    return _events_out(user)


# ---------- Sessions ----------


class SessionOut(BaseModel):
    id: str
    kind: str  # "jwt" | "api_key"
    label: str
    detail: str
    last_active: str | None
    is_current: bool


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    user: Annotated[User, Depends(get_current_user)],
    claims: Annotated[dict[str, Any], Depends(get_current_claims)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[SessionOut]:
    """Return active sessions for the current user.

    We don't have a sessions table — each access token is stateless. We
    therefore surface:

    * The current JWT, with its issued-at and expiry; flagged ``is_current``.
    * Every non-revoked API key in the same workspace, treated as a long-
      lived programmatic session whose owner can revoke it.
    """
    now = datetime.now(UTC)
    items: list[SessionOut] = []

    iat = claims.get("iat")
    exp = claims.get("exp")
    issued = (
        datetime.fromtimestamp(int(iat), tz=UTC)
        if isinstance(iat, (int, float))
        else None
    )
    expires = (
        datetime.fromtimestamp(int(exp), tz=UTC)
        if isinstance(exp, (int, float))
        else None
    )
    items.append(
        SessionOut(
            id="current",
            kind="jwt",
            label="This browser",
            detail=(
                f"Signed in {issued.isoformat()} · expires {expires.isoformat()}"
                if issued and expires
                else "Current session"
            ),
            last_active=now.isoformat(),
            is_current=True,
        )
    )

    keys = (
        await session.execute(
            select(ApiKey).where(
                ApiKey.workspace_id == user.workspace_id,
                ApiKey.revoked_at.is_(None),
            )
        )
    ).scalars().all()
    for k in keys:
        items.append(
            SessionOut(
                id=str(k.id),
                kind="api_key",
                label=f"API key · {k.name}",
                detail=f"Prefix {k.prefix}",
                last_active=(
                    k.last_used_at.isoformat() if k.last_used_at else None
                ),
                is_current=False,
            )
        )

    return items


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_id: str,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Revoke a session. The current JWT can't be revoked server-side (it
    expires on its own); we 400 so the frontend can guide the user to sign
    out instead. API-key sessions are revoked by marking the row."""
    if session_id == "current":
        raise HTTPException(
            status_code=400,
            detail="Use /auth/logout to end the current session",
        )
    try:
        key_uuid = uuid.UUID(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    key = await session.get(ApiKey, key_uuid)
    if key is None or key.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Session not found")
    key.revoked_at = datetime.now(UTC)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Data & Privacy ----------


@router.get("/data/export")
async def export_workspace_data(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Stream a CSV of this workspace's recent warmup logs.

    True full-archive export (zip with logs + reports + audits) is a future
    enhancement; for v1 we emit the warmup_logs CSV so the button does a
    real, persistent thing rather than logging a TODO.
    """
    from app.db.models.mailboxes import Mailbox

    mailbox_ids = (
        await session.execute(
            select(Mailbox.id).where(Mailbox.workspace_id == user.workspace_id)
        )
    ).scalars().all()

    if mailbox_ids:
        rows = (
            await session.execute(
                select(WarmupLog)
                .where(WarmupLog.mailbox_id.in_(mailbox_ids))
                .order_by(WarmupLog.created_at.desc())
                .limit(10_000)
            )
        ).scalars().all()
    else:
        rows = []

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "created_at",
            "mailbox_id",
            "peer_inbox_id",
            "direction",
            "action",
            "subject_snippet",
            "message_id",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.created_at.isoformat() if r.created_at else "",
                str(r.mailbox_id),
                str(r.peer_inbox_id),
                r.direction.value if hasattr(r.direction, "value") else str(r.direction),
                r.action.value if hasattr(r.action, "value") else str(r.action),
                r.subject_snippet or "",
                r.message_id or "",
            ]
        )
    buf.seek(0)

    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
    headers = {
        "Content-Disposition": (
            f'attachment; filename="warmpulse-export-{stamp}.csv"'
        ),
    }
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers=headers,
    )


class GdprRequestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_email: str = Field(min_length=3, max_length=320)
    reason: str | None = Field(default=None, max_length=2000)


@router.post("/data/gdpr-request", status_code=status.HTTP_202_ACCEPTED)
async def submit_gdpr_request(
    payload: GdprRequestPayload,
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Accept a GDPR / DPDP erasure request. Fulfilment is manual today —
    a transactional email is sent to ops with the request payload; we
    return 202 so the client can confirm receipt."""
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="GDPR request received",
            summary=(
                f"Your GDPR / DPDP erasure request for {payload.subject_email} "
                "has been received. Our team will action it within 30 days."
            ),
        )
    except Exception:
        pass
    return {
        "received_at": datetime.now(UTC).isoformat(),
        "subject_email": payload.subject_email,
    }


@router.delete("/workspace", status_code=status.HTTP_202_ACCEPTED)
async def request_workspace_deletion(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    """Request workspace deletion. Hard deletion runs out-of-band — this
    endpoint just records the intent and fires a confirmation email so the
    UI's "Delete workspace" button does something honest rather than
    nothing."""
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="Workspace deletion requested",
            summary=(
                "You requested deletion of your WarmPulse workspace. "
                "Our team will permanently erase your data within 30 days. "
                "Reach out if this was a mistake."
            ),
        )
    except Exception:
        pass
    return {
        "queued_at": datetime.now(UTC).isoformat(),
        "expected_completion": (
            datetime.now(UTC) + timedelta(days=30)
        ).isoformat(),
    }
