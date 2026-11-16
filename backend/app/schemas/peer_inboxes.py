"""Pydantic v2 schemas for admin peer-inbox endpoints.

Peer inboxes are system-owned mailboxes that form the warmup network
(spec §7). Only super_admins ever see these schemas — clients never
interact with peer inboxes directly. Encrypted credentials are stored
as ``BYTEA`` in the DB but never surface on the wire; responses carry
only provider/capacity/reputation metadata.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PeerProviderEnum(str, enum.Enum):
    google_ws = "google_ws"
    office365 = "office365"
    yahoo = "yahoo"


class PoolMembershipRef(BaseModel):
    """Lightweight pool ref embedded in ``PeerInboxOut.pool_memberships``.

    Retained for the admin pool-routing detail views which still want both
    the id and the name. The simpler ``pool_ids`` list is what the peer-
    inbox table reads.
    """

    pool_id: uuid.UUID
    pool_name: str


# --------------------------------------------------------------------------- #
# Create / Update                                                              #
# --------------------------------------------------------------------------- #


class PeerInboxCreate(BaseModel):
    email_address: EmailStr
    provider: PeerProviderEnum
    smtp_host: str = Field(min_length=1, max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = Field(min_length=1, max_length=255)
    smtp_password: str = Field(min_length=1, max_length=1024)
    imap_host: str = Field(min_length=1, max_length=255)
    imap_port: int = Field(default=993, ge=1, le=65535)
    imap_username: str = Field(min_length=1, max_length=255)
    imap_password: str = Field(min_length=1, max_length=1024)
    daily_capacity: int = Field(default=50, ge=1, le=500)


class PeerInboxUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daily_capacity: int | None = Field(default=None, ge=1, le=500)
    is_active: bool | None = None


# --------------------------------------------------------------------------- #
# Responses                                                                    #
# --------------------------------------------------------------------------- #


class PeerInboxOut(BaseModel):
    """Public projection of a PeerInbox row. Never includes encrypted blobs.

    Wire shape is the contract the admin UI reads — the DB columns
    (``email_address``, ``used_today``) are renamed to the more natural
    ``email`` / ``sends_today`` here. ``pool_memberships`` stays for any
    consumer that wants the full {id, name}; ``pool_ids`` is the trimmed
    list the peer-inbox table actually displays.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    provider: PeerProviderEnum
    daily_capacity: int
    sends_today: int
    reputation_score: float
    is_active: bool
    last_used_at: datetime | None = None
    pool_memberships: list[PoolMembershipRef] = Field(default_factory=list)
    pool_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime


class PeerInboxListResponse(BaseModel):
    items: list[PeerInboxOut]
    page: int
    page_size: int
    total: int


class PeerInboxByProviderRow(BaseModel):
    provider: str
    count: int
    active: int


class PeerInboxStats(BaseModel):
    """Wire shape mirrors ``frontend/src/features/admin/types.ts``.

    ``by_provider`` is a list (not a dict) so the chart can iterate without
    Object.entries gymnastics. ``total_capacity`` / ``used_capacity_today``
    are the natural names the dashboard renders.
    """

    total: int
    active: int
    inactive: int
    by_provider: list[PeerInboxByProviderRow]
    avg_reputation: float
    total_capacity: int
    used_capacity_today: int
    capacity_used_pct: float


class BulkRowFailure(BaseModel):
    row: int
    error: str


class BulkImportResult(BaseModel):
    succeeded: int
    failed: list[BulkRowFailure] = Field(default_factory=list)


class TestConnectionResponse(BaseModel):
    smtp_ok: bool
    imap_ok: bool
    smtp_error: str | None = None
    imap_error: str | None = None
