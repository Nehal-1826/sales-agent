"""Pydantic v2 schemas for the workspace-scoped Tools endpoints.

Covers the four Tools sub-pages (spec §5.1 item 6):
* Placement Tester — seed-inbox run + mocked per-provider results.
* Spam Scanner — subject/body scan with trigger list + 0-100 score.
* Template Designer — CRUD + LLM generation + HTML preview sanitization.
* Warmup Preview — dry-run sample messages from the content generator.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------- #
# Placement Tester                                                             #
# --------------------------------------------------------------------------- #


class PlacementTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mailbox_id: uuid.UUID
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=50_000)
    is_html: bool = False


class PerProviderResult(BaseModel):
    inbox: int
    promotions: int
    spam: int
    blocked: int


class PlacementTestResult(BaseModel):
    test_id: uuid.UUID
    mailbox_id: uuid.UUID
    seed_count: int
    # results JSON: {inbox, promotions, spam, blocked, per_provider: {gmail, outlook, yahoo}}
    results: dict
    sent_at: datetime


class PlacementTestListResponse(BaseModel):
    items: list[PlacementTestResult]
    total: int


# --------------------------------------------------------------------------- #
# Spam Scanner                                                                 #
# --------------------------------------------------------------------------- #


class SpamScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=100_000)
    is_html: bool = False


class SpamTrigger(BaseModel):
    type: Literal["word", "caps", "punct", "html", "shortener", "unsubscribe"]
    word: str | None = None
    line: str | None = None
    severity: Literal["major", "minor"]


class SpamScanResult(BaseModel):
    id: uuid.UUID
    score: float  # 0-100
    passed: bool  # score < 30
    triggers: list[SpamTrigger]
    created_at: datetime


class SpamScanListResponse(BaseModel):
    items: list[SpamScanResult]
    total: int


# --------------------------------------------------------------------------- #
# Template Designer                                                            #
# --------------------------------------------------------------------------- #


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    html: str
    thumbnail: str | None = None
    created_with_llm: bool = False
    created_at: datetime


class TemplateListResponse(BaseModel):
    items: list[TemplateOut]
    total: int


class TemplateCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    html: str = Field(min_length=1, max_length=500_000)
    thumbnail: str | None = None
    created_with_llm: bool = False


class TemplateUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    html: str | None = None
    thumbnail: str | None = None


class TemplateGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=3, max_length=2000)


class TemplateGenerateResponse(BaseModel):
    html: str


class TemplatePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    html: str = Field(max_length=500_000)


class TemplatePreviewResponse(BaseModel):
    html: str


# --------------------------------------------------------------------------- #
# Warmup Preview                                                               #
# --------------------------------------------------------------------------- #


class WarmupPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mailbox_id: uuid.UUID
    count: int = Field(5, ge=1, le=20)
    mode: Literal["A", "B", "C", "D"] = "A"


class WarmupSample(BaseModel):
    subject: str
    body: str
    is_html: bool
    peer_email_mock: str


class WarmupPreviewResult(BaseModel):
    samples: list[WarmupSample]
