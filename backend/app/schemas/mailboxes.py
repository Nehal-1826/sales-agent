"""Pydantic v2 schemas for the workspace-scoped mailbox CRUD endpoints.

The create request is a discriminated union on ``provider``:
* ``smtp`` / ``yahoo`` — classic IMAP+SMTP credentials.
* ``gmail`` / ``outlook`` — OAuth refresh-token flow.

``MailboxOut`` never surfaces encrypted credential columns. It carries the
derived ``ramp_target_today`` / ``days_remaining_in_ramp`` instead so the
frontend doesn't duplicate the ramp ladder logic.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class MailboxProviderEnum(str, enum.Enum):
    gmail = "gmail"
    outlook = "outlook"
    yahoo = "yahoo"
    smtp = "smtp"


class MailboxStatusEnum(str, enum.Enum):
    pending = "pending"
    active = "active"
    paused = "paused"
    completed = "completed"


class ContentMode(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


# --------------------------------------------------------------------------- #
# Shared normalizer — collapses provider-display spaces in app passwords      #
# --------------------------------------------------------------------------- #

import re as _re


def _normalize_app_password(v):
    """Strip surrounding whitespace; collapse provider-display spaces.

    Mail providers display app passwords as space-separated groups of 4
    characters for readability — the spaces are NOT part of the password.
    Examples:
    * Gmail / Google Workspace: ``xxxx xxxx xxxx xxxx`` (16 letters)
    * Zoho Mail:                ``xxxx xxxx xxxx``     (12 alphanumerics)
    * Yahoo / Outlook:          16 alphanumerics in 4 groups

    Users routinely paste with the spaces intact and the SMTP AUTH probe
    then rejects them with a confusing ``authentication_failed`` error
    even though they "copied the right password". Strip leading / trailing
    whitespace unconditionally; if the result is 3 or 4 groups of 4
    alphanumeric characters separated by single spaces, collapse the inner
    spaces. Anything else is left untouched so we never silently corrupt a
    real password that legitimately contains a space.
    """
    if not isinstance(v, str):
        return v
    stripped = v.strip()
    if _re.fullmatch(r"[A-Za-z0-9]{4}( [A-Za-z0-9]{4}){2,3}", stripped):
        return stripped.replace(" ", "")
    return stripped


# --------------------------------------------------------------------------- #
# Create — discriminated union                                                 #
# --------------------------------------------------------------------------- #


class MailboxCreateSmtp(BaseModel):
    """Classic SMTP+IMAP credential flow (provider=smtp, yahoo, or zoho).

    "zoho" is accepted as an alias of "smtp" — older/mobile clients send the
    raw provider tile name; Zoho mailboxes are stored as provider=smtp either
    way (no zoho value exists in the DB enum). The alias is normalised here so
    ``MailboxCreateSmtp(provider="zoho", ...)`` behaves identically to smtp.
    """

    email_address: EmailStr
    provider: Literal["smtp", "yahoo", "zoho"]
    smtp_host: str = Field(min_length=1, max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = Field(min_length=1, max_length=255)
    smtp_password: str = Field(min_length=1, max_length=1024)
    imap_host: str | None = Field(default=None, max_length=255)
    imap_port: int | None = Field(default=None, ge=1, le=65535)
    daily_target: int = Field(default=50, ge=1, le=200)
    content_mode: ContentMode = ContentMode.A

    @field_validator("smtp_host", "imap_host", "smtp_username", mode="before")
    @classmethod
    def _strip_whitespace(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("smtp_password", mode="before")
    @classmethod
    def _normalize_password(cls, v):
        return _normalize_app_password(v)


class MailboxProbeRequest(BaseModel):
    """Minimal payload for the no-persist credential probe (Step 3 of onboarding).

    Deliberately does NOT require ``provider`` / ``daily_target`` / ``content_mode``
    — those are user-facing knobs that have nothing to do with whether SMTP AUTH
    will succeed. Reuses the same field shapes + password normalizer as
    :class:`MailboxCreateSmtp` so a successful probe means the same payload
    will succeed at create time.
    """

    email_address: EmailStr
    smtp_host: str = Field(min_length=1, max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = Field(min_length=1, max_length=255)
    smtp_password: str = Field(min_length=1, max_length=1024)
    imap_host: str | None = Field(default=None, max_length=255)
    imap_port: int | None = Field(default=None, ge=1, le=65535)

    @field_validator("smtp_host", "imap_host", "smtp_username", mode="before")
    @classmethod
    def _strip_whitespace(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("smtp_password", mode="before")
    @classmethod
    def _normalize_password(cls, v):
        return _normalize_app_password(v)


class MailboxCreateOauth(BaseModel):
    """OAuth refresh-token flow (provider=gmail or outlook)."""

    email_address: EmailStr
    provider: Literal["gmail", "outlook"]
    oauth_refresh_token: str = Field(min_length=1, max_length=4096)
    daily_target: int = Field(default=50, ge=1, le=200)
    content_mode: ContentMode = ContentMode.A


MailboxCreateRequest = Annotated[
    MailboxCreateSmtp | MailboxCreateOauth,
    Field(discriminator="provider"),
]


# --------------------------------------------------------------------------- #
# Update — whitelisted optional fields                                         #
# --------------------------------------------------------------------------- #


class MailboxUpdate(BaseModel):
    """PATCH body — only these four fields are mutable via the update route."""

    model_config = ConfigDict(extra="forbid")

    daily_target: int | None = Field(default=None, ge=1, le=200)
    content_mode: ContentMode | None = None
    schedule_window_id: uuid.UUID | None = None
    is_paused: bool | None = None


class BulkMailboxPauseRequest(BaseModel):
    """Admin bulk pause/resume body for client users' mailboxes.

    An empty ``user_ids`` list means "all client users" — the admin Users
    page's select-all action relies on that. Non-client (super_admin) ids
    are silently skipped by the service.
    """

    model_config = ConfigDict(extra="forbid")

    user_ids: list[uuid.UUID] = Field(default_factory=list)
    action: Literal["pause", "resume"]


# --------------------------------------------------------------------------- #
# Responses                                                                    #
# --------------------------------------------------------------------------- #


class ScheduleWindowOut(BaseModel):
    """Embedded shape for the mailbox's send-time window.

    ``weekday_mask`` is a bitfield: bit 0 = Mon … bit 6 = Sun. Default 31
    (0b0011111) means Mon-Fri. The frontend SchedulePanel renders a row of
    seven checkboxes against this mask.
    """

    tz: str
    weekday_mask: int
    start_hour: int
    end_hour: int


class MailboxOut(BaseModel):
    """Public projection of a Mailbox row. Never includes encrypted columns."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email_address: str
    provider: MailboxProviderEnum
    warmup_status: MailboxStatusEnum
    daily_target: int
    current_day: int
    warmth_score: float
    content_mode: ContentMode
    is_paused: bool
    # True when connected via provider OAuth (refresh token stored) rather than
    # SMTP app-password. OAuth mailboxes send through the provider's own
    # authenticated infrastructure, so the client-facing DNS (SPF/DKIM/DMARC)
    # verification step doesn't apply to them.
    is_oauth: bool = False
    spf_valid: bool | None = None
    dkim_valid: bool | None = None
    dmarc_valid: bool | None = None
    schedule_window_id: uuid.UUID | None = None
    schedule_window: ScheduleWindowOut | None = None
    created_at: datetime
    ramp_target_today: int
    days_remaining_in_ramp: int
    # Number of warmup sends from this mailbox today (UTC). Populated by the
    # list/detail routes; defaults to 0 so unit-test fixtures still validate.
    sent_today: int = 0
    # Peer-side engagement received by this mailbox today (UTC): inbound
    # opened / replied warmup_log rows. Same population/defaults as sent_today.
    opens_today: int = 0
    replies_today: int = 0


class MailboxListResponse(BaseModel):
    items: list[MailboxOut]
    page: int
    page_size: int
    total: int


class TestConnectionResponse(BaseModel):
    smtp_ok: bool
    # ``imap_ok`` is ``None`` when the caller skipped the IMAP probe (i.e.
    # the probe payload had no imap_host / imap_port — typical for users
    # whose provider has IMAP disabled and who picked outbound-only warmup).
    imap_ok: bool | None = None
    smtp_error: str | None = None
    imap_error: str | None = None
    note: str | None = None


class RunWarmupNowResponse(BaseModel):
    """Result of an on-demand warmup trigger.

    ``send_queued`` is True when an outbound warmup send was enqueued;
    ``engage_queued`` is True when a Gmail engagement pass (spam-rescue /
    read / star / label) was also enqueued — that pass only exists for
    OAuth-connected Gmail mailboxes.
    """

    send_queued: bool
    engage_queued: bool
    sent_today: int
    quota_today: int
    note: str | None = None


class MailboxTransferRequest(BaseModel):
    """Admin transfer body — destination owner for a mailbox move."""

    model_config = ConfigDict(extra="forbid")

    target_user_id: str = Field(min_length=1, max_length=64)
