"""Admin platform settings — singleton config under ``/api/admin/settings``.

Backed by ``app_settings`` (key/value JSON). Secrets (LLM API key,
Google OAuth client secret) are Fernet-encrypted before being persisted
and never returned in plaintext — only a masked tail is exposed to the UI.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_super_admin
from app.db.models.app_settings import AppSetting
from app.db.models.users import User
from app.db.models.llm_usage import LlmUsage
from app.db.models.peer_inboxes import PeerInbox
from app.services.crypto import get_fernet_service

router = APIRouter(prefix="/settings", tags=["admin-settings"])


# ---------- Pydantic ----------


class UpdateDefaultsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ramp_day1: int | None = Field(default=None, ge=1, le=200)
    ramp_day7_target: int | None = Field(default=None, ge=1, le=500)
    human_delay_min_s: int | None = Field(default=None, ge=0, le=86_400)
    human_delay_max_s: int | None = Field(default=None, ge=0, le=86_400)
    email_from_display_name: str | None = Field(default=None, max_length=255)
    reply_to: str | None = Field(default=None, max_length=320)
    warmup_log_retention_days: int | None = Field(default=None, ge=1, le=3650)


class UpdateLlmPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str | None = Field(default=None, max_length=512)
    default_cap_tokens: int | None = Field(default=None, ge=0)


class UpdateOauthPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str | None = Field(default=None, max_length=512)
    client_secret: str | None = Field(default=None, max_length=1024)


class UpdateSmtpPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65_535)
    username: str | None = Field(default=None, max_length=320)
    password: str | None = Field(default=None, max_length=512)
    from_addr: str | None = Field(default=None, max_length=320)
    starttls: bool | None = None


class MaintenancePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


# ---------- Defaults ----------

_DEFAULTS: dict[str, dict[str, Any]] = {
    "defaults": {
        "ramp_day1": 5,
        "ramp_day7_target": 10,
        "human_delay_min_s": 30,
        "human_delay_max_s": 300,
        "email_from_display_name": "",
        "reply_to": "",
        "warmup_log_retention_days": 7,
    },
    "llm": {
        "api_key_encrypted": None,
        "api_key_tail": "",
        "default_cap_tokens": 150_000,
    },
    "google_oauth": {
        "client_id": "",
        "client_secret_encrypted": None,
        "client_secret_tail": "",
    },
    "transactional_smtp": {
        "host": "",
        "port": 587,
        "username": "",
        "password_encrypted": None,
        "password_tail": "",
        "from_addr": "",
        "starttls": True,
    },
    "danger": {"maintenance_mode": False},
}


def _mask(tail: str) -> str:
    if not tail:
        return ""
    return f"••••••••{tail[-4:]}"


# ---------- Persistence helpers ----------


async def _load(session: AsyncSession, key: str) -> dict[str, Any]:
    row = (
        await session.execute(select(AppSetting).where(AppSetting.key == key))
    ).scalar_one_or_none()
    if row is None:
        return dict(_DEFAULTS.get(key, {}))
    merged = dict(_DEFAULTS.get(key, {}))
    merged.update(row.value or {})
    return merged


async def _save(session: AsyncSession, key: str, value: dict[str, Any]) -> None:
    row = (
        await session.execute(select(AppSetting).where(AppSetting.key == key))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if row is None:
        session.add(AppSetting(key=key, value=value, updated_at=now))
    else:
        row.value = value
        row.updated_at = now
    await session.commit()


def _month_start_utc() -> date:
    now = datetime.now(UTC)
    return date(now.year, now.month, 1)


async def _llm_spend_summary(
    session: AsyncSession,
) -> tuple[float, list[dict[str, Any]]]:
    """Return (spend_mtd_usd, daily_spend_series last 30d)."""
    month_start = _month_start_utc()
    mtd_cents = (
        await session.execute(
            select(func.coalesce(func.sum(LlmUsage.cost_cents), 0)).where(
                LlmUsage.created_at
                >= datetime.combine(month_start, datetime.min.time(), tzinfo=UTC)
            )
        )
    ).scalar_one() or 0

    cutoff = datetime.now(UTC).date() - timedelta(days=29)
    rows = (
        await session.execute(
            select(
                func.date(LlmUsage.created_at).label("d"),
                func.coalesce(func.sum(LlmUsage.cost_cents), 0).label("c"),
            )
            .where(func.date(LlmUsage.created_at) >= cutoff)
            .group_by(func.date(LlmUsage.created_at))
        )
    ).all()
    by_day: dict[str, float] = {
        (d.isoformat() if hasattr(d, "isoformat") else str(d)): float(c or 0) / 100.0
        for d, c in rows
    }
    today = datetime.now(UTC).date()
    series = [
        {
            "date": (today - timedelta(days=29 - i)).isoformat(),
            "cost_usd": round(by_day.get((today - timedelta(days=29 - i)).isoformat(), 0.0), 4),
        }
        for i in range(30)
    ]
    return float(mtd_cents) / 100.0, series


# ---------- Aggregate read ----------


@router.get(
    "",
    dependencies=[Depends(require_super_admin)],
)
async def get_admin_settings(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    defaults = await _load(session, "defaults")
    llm = await _load(session, "llm")
    oauth = await _load(session, "google_oauth")
    smtp = await _load(session, "transactional_smtp")
    danger = await _load(session, "danger")

    spend_mtd_usd, spend_series = await _llm_spend_summary(session)

    from app.config import get_settings

    env = get_settings()
    smtp_db_configured = bool(smtp.get("host"))
    smtp_mode = (
        "admin"
        if smtp_db_configured
        else ("env" if env.transactional_smtp_host else "dry_run")
    )

    return {
        "google_oauth": {
            "client_id_masked": oauth.get("client_id", ""),
            "configured": bool(oauth.get("client_id")) and bool(
                oauth.get("client_secret_encrypted")
            ),
        },
        "llm": {
            "api_key_masked": _mask(llm.get("api_key_tail", "")),
            "configured": bool(llm.get("api_key_encrypted")),
            "default_cap_tokens": int(llm.get("default_cap_tokens", 150_000)),
            "spend_mtd_usd": spend_mtd_usd,
            "spend_series": spend_series,
        },
        "defaults": {
            "ramp_day1": int(defaults.get("ramp_day1", 5)),
            "ramp_day7_target": int(defaults.get("ramp_day7_target", 10)),
            "human_delay_min_s": int(defaults.get("human_delay_min_s", 30)),
            "human_delay_max_s": int(defaults.get("human_delay_max_s", 300)),
            "email_from_display_name": defaults.get("email_from_display_name", ""),
            "reply_to": defaults.get("reply_to", ""),
            "warmup_log_retention_days": int(defaults.get("warmup_log_retention_days", 7)),
        },
        "transactional_smtp": {
            "host": smtp.get("host", ""),
            "port": int(smtp.get("port", 587)),
            "username": smtp.get("username", ""),
            "from_addr": smtp.get("from_addr", ""),
            "starttls": bool(smtp.get("starttls", True)),
            "password_masked": _mask(smtp.get("password_tail", "")),
            "configured": smtp_db_configured,
            "mode": smtp_mode,
            "env_host": env.transactional_smtp_host or "",
        },
        "danger": {"maintenance_mode": bool(danger.get("maintenance_mode", False))},
    }


# ---------- PATCH endpoints ----------


@router.patch(
    "/defaults",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def update_defaults(
    payload: UpdateDefaultsPayload,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cur = await _load(session, "defaults")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            cur[k] = v
    await _save(session, "defaults", cur)


@router.patch(
    "/llm",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def update_llm(
    payload: UpdateLlmPayload,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cur = await _load(session, "llm")
    if payload.api_key is not None:
        fernet = get_fernet_service()
        cur["api_key_encrypted"] = fernet.encrypt(payload.api_key.encode()).decode()
        cur["api_key_tail"] = payload.api_key[-4:] if len(payload.api_key) >= 4 else payload.api_key
    if payload.default_cap_tokens is not None:
        cur["default_cap_tokens"] = payload.default_cap_tokens
    await _save(session, "llm", cur)


@router.patch(
    "/google-oauth",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def update_oauth(
    payload: UpdateOauthPayload,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cur = await _load(session, "google_oauth")
    if payload.client_id is not None:
        cur["client_id"] = payload.client_id
    if payload.client_secret is not None:
        fernet = get_fernet_service()
        cur["client_secret_encrypted"] = fernet.encrypt(
            payload.client_secret.encode()
        ).decode()
        cur["client_secret_tail"] = payload.client_secret[-4:]
    await _save(session, "google_oauth", cur)


@router.patch(
    "/transactional-smtp",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def update_transactional_smtp(
    payload: UpdateSmtpPayload,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cur = await _load(session, "transactional_smtp")
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    for k, v in data.items():
        if v is not None:
            cur[k] = v
    if password is not None:
        fernet = get_fernet_service()
        cur["password_encrypted"] = fernet.encrypt(password.encode()).decode()
        cur["password_tail"] = password[-4:] if len(password) >= 4 else password
        password = "REDACTED"  # plaintext lives only as a local during this request
        del password
    await _save(session, "transactional_smtp", cur)


@router.post(
    "/maintenance",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def set_maintenance(
    payload: MaintenancePayload,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await _save(session, "danger", {"maintenance_mode": payload.enabled})


# ---------- Action endpoints ----------


@router.post(
    "/llm/rotate-key",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def rotate_llm_key(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Drop the stored LLM key. Caller must re-enter via PATCH /llm."""
    cur = await _load(session, "llm")
    cur["api_key_encrypted"] = None
    cur["api_key_tail"] = ""
    await _save(session, "llm", cur)


@router.post(
    "/llm/test",
    dependencies=[Depends(require_super_admin)],
)
async def test_llm(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    cur = await _load(session, "llm")
    if not cur.get("api_key_encrypted"):
        return {"ok": False, "error": "LLM API key not configured"}
    return {"ok": True}


@router.post(
    "/google-oauth/test",
    dependencies=[Depends(require_super_admin)],
)
async def test_oauth(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    cur = await _load(session, "google_oauth")
    if not cur.get("client_id") or not cur.get("client_secret_encrypted"):
        return {"ok": False, "error": "Google OAuth not configured"}
    return {"ok": True}


@router.post("/transactional-smtp/test")
async def test_transactional_smtp(
    user: Annotated[User, Depends(require_super_admin)],
) -> dict[str, Any]:
    """Send a real test email to the calling admin via the live SMTP path.

    Exercises the exact same resolver every transactional template uses, so a
    green result here means welcome / alert / 2FA mails will deliver too.
    """
    from app.services.transactional_mail import send_action_notice

    result = await send_action_notice(
        to=user.email,
        action="SMTP test",
        summary=(
            "This is a test email from the WarmPulse admin settings page. "
            "If you're reading it, transactional SMTP is configured correctly."
        ),
    )
    outcome = result.get("status")
    if outcome == "sent":
        return {"ok": True, "detail": f"Test email sent to {user.email}"}
    if outcome == "dry_run":
        return {
            "ok": False,
            "error": (
                "Dry-run mode — no SMTP host configured. Set one in this card "
                "or via TRANSACTIONAL_SMTP_HOST."
            ),
        }
    return {"ok": False, "error": "SMTP send failed — check host, port and login details."}


@router.post(
    "/peer-pool/reset-health",
    dependencies=[Depends(require_super_admin)],
    status_code=204,
)
async def reset_peer_health(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Reset all peer inbox reputation scores and per-day usage counters."""
    await session.execute(
        update(PeerInbox).values(reputation_score=100.0, used_today=0)
    )
    await session.commit()
