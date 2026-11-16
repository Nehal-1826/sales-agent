"""Pydantic schemas for LLM usage admin endpoints (spec §6)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LlmUsageRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: uuid.UUID
    user_email: str | None = None
    plan_name: str | None = None
    mailbox_id: uuid.UUID | None = None
    mode: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_cents: int
    created_at: datetime


class LlmUsageListResponse(BaseModel):
    items: list[LlmUsageRow]
    page: int
    page_size: int
    total: int


class LlmPerUserSummary(BaseModel):
    user_id: uuid.UUID
    email: str
    plan: str | None = None
    tokens_mtd: int
    cost_cents_mtd: int
    cap: int
    pct_used: float


class LlmModeSummary(BaseModel):
    A: int = 0
    B: int = 0
    C: int = 0
    D: int = 0


class LlmUsageSummary(BaseModel):
    total_tokens_mtd: int
    total_cost_cents_mtd: int
    by_user: list[LlmPerUserSummary]
    by_mode: LlmModeSummary
    forecast_eom_cents: int


class LlmTimeSeriesPoint(BaseModel):
    date: str  # ISO date (YYYY-MM-DD)
    tokens: int
    cost_cents: int


class LlmUsageTimeSeries(BaseModel):
    points: list[LlmTimeSeriesPoint]


class LlmPerUserDetail(BaseModel):
    user_id: uuid.UUID
    email: str
    plan: str | None = None
    tokens_mtd: int
    cost_cents_mtd: int
    cap: int
    pct_used: float
    time_series: LlmUsageTimeSeries
    by_mode: LlmModeSummary


class TokenCapUpdate(BaseModel):
    token_cap_per_month: int = Field(..., ge=0)
