"""Pydantic v2 schemas for the cross-workspace admin CRM endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# --------------------------------------------------------------------------- #
# Shared sub-shapes                                                           #
# --------------------------------------------------------------------------- #


class AdminCrmCampaignRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    leads: int
    status: str


class AdminCrmSequenceRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: str          # "active" | "paused" | "archived"
    paused: bool
    enrolled: int        # active enrollments
    open_rate: float
    reply_rate: float


class AdminCrmRecentActivity(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    lead_label: str      # lead name or email fallback
    at: datetime


# --------------------------------------------------------------------------- #
# Overview                                                                    #
# --------------------------------------------------------------------------- #


class AdminCrmWorkspaceRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workspace_id: uuid.UUID
    # The workspace "name" is the owner's display_name when set, else their email.
    name: str
    plan: str | None
    owner_email: str
    campaigns: int
    leads: int
    sequences_active: int
    sequences_paused: int
    active_enrollments: int
    open_rate: float
    reply_rate: float
    last_activity_at: datetime | None


class AdminCrmOverview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_campaigns: int
    total_leads: int
    sequences_active: int
    sequences_paused: int
    active_enrollments: int
    emails_sent_30d: int
    open_rate: float
    reply_rate: float
    workspaces: list[AdminCrmWorkspaceRow]


# --------------------------------------------------------------------------- #
# Workspace detail                                                             #
# --------------------------------------------------------------------------- #


class AdminCrmWorkspaceDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Flat workspace summary fields (same as AdminCrmWorkspaceRow)
    workspace_id: uuid.UUID
    name: str
    plan: str | None
    owner_email: str
    campaigns: int
    leads: int
    sequences_active: int
    sequences_paused: int
    active_enrollments: int
    open_rate: float
    reply_rate: float
    last_activity_at: datetime | None

    # Expanded sub-lists
    campaign_list: list[AdminCrmCampaignRow]
    sequence_list: list[AdminCrmSequenceRow]
    recent_activities: list[AdminCrmRecentActivity]


# --------------------------------------------------------------------------- #
# Status-toggle request / response                                             #
# --------------------------------------------------------------------------- #


class SequenceStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paused: bool


class SequenceStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    status: str
    paused: bool
