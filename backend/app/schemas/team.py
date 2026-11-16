"""Pydantic v2 schemas for workspace team / sub-clients / API keys."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ---------------- Team members ----------------


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    invited_email: str
    role_in_workspace: str
    accepted_at: datetime | None = None
    created_at: datetime


class TeamMemberInvite(BaseModel):
    invited_email: EmailStr
    role_in_workspace: str = Field(default="member", min_length=1, max_length=64)


# ---------------- Sub-clients ----------------


class SubClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_workspace_id: uuid.UUID
    name: str
    contact_email: str
    created_at: datetime


class SubClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_email: EmailStr


# ---------------- API keys ----------------


class ApiKeyOut(BaseModel):
    """List projection — raw key is NEVER returned here."""

    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    prefix: str
    masked: str
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ApiKeyCreateResponse(BaseModel):
    """One-time response on create — the raw key appears here and nowhere else."""

    id: uuid.UUID
    name: str
    prefix: str
    key: str
    warning: str = "Save this key now — it won't be shown again."
