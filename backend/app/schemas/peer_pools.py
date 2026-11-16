"""Pydantic v2 schemas for admin peer-pool + pool-routing endpoints.

Pools group peer inboxes; each client workspace is assigned to exactly
one pool (spec §7). The sankey schema backs the admin routing-visualizer.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.peer_inboxes import PeerInboxOut

# --------------------------------------------------------------------------- #
# Pools                                                                        #
# --------------------------------------------------------------------------- #


class PoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    is_default: bool
    daily_send_limit: int | None = None
    member_count: int
    client_count: int = 0
    created_at: datetime


class PoolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    is_default: bool = False
    daily_send_limit: int | None = None


class PoolUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=512)
    is_default: bool | None = None
    daily_send_limit: int | None = None


class PoolDetail(PoolOut):
    """Pool + paginated members."""

    members: list[PeerInboxOut] = Field(default_factory=list)
    page: int
    page_size: int
    total: int


class PoolListResponse(BaseModel):
    items: list[PoolOut]


# --------------------------------------------------------------------------- #
# Membership                                                                   #
# --------------------------------------------------------------------------- #


class AddMembersRequest(BaseModel):
    peer_inbox_ids: list[uuid.UUID]


class AddMembersResponse(BaseModel):
    added: int
    already_member: int


# --------------------------------------------------------------------------- #
# Routing — client -> pool assignment                                          #
# --------------------------------------------------------------------------- #


class PoolAssignmentOut(BaseModel):
    workspace_id: uuid.UUID
    user_id: uuid.UUID | None = None
    client_email: str
    client_plan: str | None = None
    pool_id: uuid.UUID
    pool_name: str
    assigned_at: datetime
    sends_last_30d: int = 0


class PoolAssignmentListResponse(BaseModel):
    items: list[PoolAssignmentOut]
    page: int
    page_size: int
    total: int


class PoolAssignmentRequest(BaseModel):
    workspace_id: uuid.UUID
    pool_id: uuid.UUID


class RoutingMailbox(BaseModel):
    """A mailbox in the admin pool-routing table."""

    id: uuid.UUID
    email: str
    provider: str
    workspace_id: uuid.UUID
    plan_name: str | None = None
    pool_id: uuid.UUID | None = None
    effective_pool_id: uuid.UUID | None = None
    sends_last_30d: int = 0
    can_send: bool
    is_oauth: bool


class RoutingMailboxListResponse(BaseModel):
    items: list[RoutingMailbox]


class MailboxPinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pool_id: uuid.UUID | None = None


class UnassignedClient(BaseModel):
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    plan: str | None = None
    sends_last_30d: int = 0


class UnassignedClientsResponse(BaseModel):
    items: list[UnassignedClient]


# --------------------------------------------------------------------------- #
# Sankey                                                                       #
# --------------------------------------------------------------------------- #


class SankeyNode(BaseModel):
    id: str
    name: str
    type: Literal["pool", "client"]


class SankeyLink(BaseModel):
    source: str
    target: str
    value: int


class SankeyData(BaseModel):
    nodes: list[SankeyNode]
    links: list[SankeyLink]
