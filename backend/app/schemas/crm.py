"""Pydantic v2 wire schemas for the workspace-scoped CRM endpoints.

Field names here are the API contract consumed by the frontend CRM feature
(``frontend/src/features/crm``). Update bodies use ``ConfigDict(extra="forbid")``
so a typo'd field is a 422 rather than a silent no-op.

``CrmCampaignOut`` carries derived aggregates (``lead_count`` /
``won_value_cents``) the service computes per request so the frontend doesn't
re-derive pipeline rollups client-side.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------- #
# Enums (mirror the DB enums in app.db.models.crm_*)                           #
# --------------------------------------------------------------------------- #


# Upper bound for CRM email bodies (templates and sequence steps alike).
#
# Was 4000, which rejected any real HTML email — a modest branded template is
# 8-10KB and the "Upload .html" button could not be used at all. Gmail clips
# messages past roughly 102KB, so anything beyond this is wasted bytes.
MAX_BODY_CHARS = 100_000


class CrmCampaignStatusEnum(str, enum.Enum):
    active = "active"
    paused = "paused"
    archived = "archived"


class CrmLeadStageEnum(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    replied = "replied"
    interested = "interested"
    won = "won"
    lost = "lost"


class CrmActivityKindEnum(str, enum.Enum):
    created = "created"
    note = "note"
    stage_change = "stage_change"
    email_sent = "email_sent"
    email_opened = "email_opened"
    email_replied = "email_replied"


class CrmSequenceStatusEnum(str, enum.Enum):
    active = "active"
    paused = "paused"
    archived = "archived"


class CrmEnrollmentStatusEnum(str, enum.Enum):
    active = "active"
    completed = "completed"
    stopped = "stopped"


# --------------------------------------------------------------------------- #
# Campaigns                                                                    #
# --------------------------------------------------------------------------- #


class CrmCampaignOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    status: CrmCampaignStatusEnum
    lead_count: int
    won_value_cents: int
    # Per-stage lead counts for this campaign — all six stages present (0-filled)
    # so the frontend can render a proportional stage bar without re-deriving it.
    stage_counts: dict[str, int] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class CrmCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class CrmCampaignUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    status: CrmCampaignStatusEnum | None = None


# --------------------------------------------------------------------------- #
# Leads                                                                        #
# --------------------------------------------------------------------------- #


class CrmLeadOut(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    email: str
    company: str | None = None
    title: str | None = None
    phone: str | None = None
    stage: CrmLeadStageEnum
    value_cents: int
    owner_email: str | None = None
    source: str | None = None
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None
    last_activity_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CrmLeadCreate(BaseModel):
    campaign_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=1, max_length=320)
    company: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    stage: CrmLeadStageEnum = CrmLeadStageEnum.new
    value_cents: int = Field(default=0, ge=0)
    owner_email: str | None = Field(default=None, max_length=320)
    source: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=4000)


class CrmLeadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=1, max_length=320)
    company: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    stage: CrmLeadStageEnum | None = None
    value_cents: int | None = Field(default=None, ge=0)
    owner_email: str | None = Field(default=None, max_length=320)
    source: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = None
    notes: str | None = Field(default=None, max_length=4000)


# --------------------------------------------------------------------------- #
# Activities                                                                   #
# --------------------------------------------------------------------------- #


class CrmActivityOut(BaseModel):
    id: uuid.UUID
    lead_id: uuid.UUID
    kind: CrmActivityKindEnum
    body: str | None = None
    actor_email: str | None = None
    created_at: datetime


class CrmActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: CrmActivityKindEnum = CrmActivityKindEnum.note
    body: str = Field(min_length=1, max_length=2000)


class CrmRecentActivityOut(BaseModel):
    """A workspace-wide activity feed row — a lead activity joined to its lead's
    name so the CRM landing's "Recent activity" tile can render without a
    per-row lookup."""

    id: uuid.UUID
    lead_id: uuid.UUID
    lead_name: str
    kind: CrmActivityKindEnum
    body: str | None = None
    actor_email: str | None = None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Import + meta                                                                #
# --------------------------------------------------------------------------- #


class CrmLeadImport(BaseModel):
    campaign_id: uuid.UUID
    csv: str = Field(min_length=1)
    # "csv" (generic name,email,company,title,phone,value header) or "linkedin"
    # (LinkedIn "Export connections" Connections.csv — First Name / Last Name /
    # Email Address / Company / Position / URL, with the export's preamble lines
    # tolerated). Unknown values fall back to the generic CSV mapping.
    source: str = Field(default="csv", max_length=32)


class CrmImportResult(BaseModel):
    imported: int
    skipped: int


class CrmLimits(BaseModel):
    tier: str
    cap: int | None
    used: int


class CrmSummary(BaseModel):
    campaigns: int
    leads: int
    won_value_cents: int
    by_stage: dict[str, int]


# --------------------------------------------------------------------------- #
# Team members (owner assignment) + per-campaign analytics                     #
# --------------------------------------------------------------------------- #


class CrmMemberOut(BaseModel):
    """An assignable lead owner — a workspace user or an invited team member."""

    email: str
    name: str | None = None


class CrmOwnerStat(BaseModel):
    owner_email: str | None = None
    leads: int
    won: int
    value_cents: int


class CrmCampaignAnalytics(BaseModel):
    """Per-campaign rollup the analytics view renders.

    Rates are whole-number percentages (0–100). ``conversion_rate`` is
    won / total leads; ``open_rate`` / ``reply_rate`` are opened / replied
    over ``email_sent`` activities logged on the campaign's leads (so they
    track the sequence engine's sends).
    """

    campaign_id: uuid.UUID
    total_leads: int
    by_stage: dict[str, int]
    won_count: int
    won_value_cents: int
    pipeline_value_cents: int
    conversion_rate: float
    emails_sent: int
    emails_opened: int
    emails_replied: int
    open_rate: float
    reply_rate: float
    by_owner: list[CrmOwnerStat] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Sequences (email follow-up automation)                                       #
# --------------------------------------------------------------------------- #


class SequenceOut(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    status: CrmSequenceStatusEnum
    step_count: int
    active_enrollments: int
    created_at: datetime
    updated_at: datetime


class SequenceCreate(BaseModel):
    campaign_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)


class SequenceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    status: CrmSequenceStatusEnum | None = None


class CrmStepContentModeEnum(str, enum.Enum):
    text = "text"  # plain text, escaped + wrapped + personalized
    html = "html"  # designer HTML body, sent as-is + personalized
    ai = "ai"  # Gemini writes a fresh email per lead from ai_prompt


class SequenceStepOut(BaseModel):
    id: uuid.UUID
    sequence_id: uuid.UUID
    step_order: int
    delay_days: int
    subject: str
    body: str
    content_mode: CrmStepContentModeEnum = CrmStepContentModeEnum.text
    ai_prompt: str | None = None


class SequenceStepCreate(BaseModel):
    delay_days: int = Field(default=0, ge=0)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=MAX_BODY_CHARS)
    content_mode: CrmStepContentModeEnum = CrmStepContentModeEnum.text
    ai_prompt: str | None = Field(default=None, max_length=2000)
    # Omit to append at the end (max(step_order)+1).
    step_order: int | None = Field(default=None, ge=0)


class SequenceStepUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    delay_days: int | None = Field(default=None, ge=0)
    subject: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, min_length=1, max_length=MAX_BODY_CHARS)
    content_mode: CrmStepContentModeEnum | None = None
    ai_prompt: str | None = Field(default=None, max_length=2000)
    step_order: int | None = Field(default=None, ge=0)


class CrmAiDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=2000)


class CrmAiDraftResponse(BaseModel):
    subject: str
    body: str
    # False when no LLM provider is configured — the UI shows a hint.
    generated: bool


class EnrollmentOut(BaseModel):
    id: uuid.UUID
    sequence_id: uuid.UUID
    lead_id: uuid.UUID
    lead_name: str
    lead_email: str
    current_step: int
    status: CrmEnrollmentStatusEnum
    next_send_at: datetime | None = None
    enrolled_at: datetime
    completed_at: datetime | None = None


class EnrollRequest(BaseModel):
    lead_ids: list[uuid.UUID]


class EnrollResult(BaseModel):
    enrolled: int
    skipped: int


class SequenceTickResult(BaseModel):
    processed: int
    advanced: int
    completed: int


# --------------------------------------------------------------------------- #
# Email templates (sequence-step library)                                      #
# --------------------------------------------------------------------------- #


class CrmTemplateOut(BaseModel):
    """A template in the picker. ``id`` is a string: built-ins use
    ``builtin:<slug>`` ids, custom templates use their UUID (stringified).
    ``is_builtin`` gates edit/delete in the UI."""

    id: str
    name: str
    subject: str
    body: str
    category: str | None = None
    is_builtin: bool
    created_at: datetime | None = None
    has_logo: bool = False
    logo_url: str | None = None


class CrmTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=MAX_BODY_CHARS)
    category: str | None = Field(default=None, max_length=64)


class CrmTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    subject: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, min_length=1, max_length=MAX_BODY_CHARS)
    category: str | None = Field(default=None, max_length=64)
