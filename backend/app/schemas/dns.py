"""Pydantic v2 schemas for DNS (SPF/DKIM/DMARC) validation endpoints.

Response shapes are shared by both the free-form ``POST /api/workspace/dns/check``
and the mailbox-scoped ``POST /api/workspace/mailboxes/{id}/dns-check`` routes
so the frontend can render the same UI component for either flow.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class SpfResult(BaseModel):
    valid: bool
    record: str | None = None
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DkimResult(BaseModel):
    valid: bool
    selector: str
    record: str | None = None
    errors: list[str] = Field(default_factory=list)


class DmarcResult(BaseModel):
    valid: bool
    record: str | None = None
    policy: Literal["none", "quarantine", "reject"] | None = None
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DnsSummary(BaseModel):
    passing: int
    total: int
    overall_pass: bool


class DnsFixes(BaseModel):
    spf: list[str] = Field(default_factory=list)
    dkim: list[str] = Field(default_factory=list)
    dmarc: list[str] = Field(default_factory=list)


class DnsCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str | None = None
    email: EmailStr | None = None
    dkim_selector: str = "default"

    @model_validator(mode="after")
    def _require_domain_or_email(self) -> DnsCheckRequest:
        if not self.domain and not self.email:
            raise ValueError("At least one of 'domain' or 'email' must be provided")
        return self


class DnsCheckResponse(BaseModel):
    domain: str
    spf: SpfResult
    dkim: DkimResult
    dmarc: DmarcResult
    summary: DnsSummary
    checked_at: datetime
    fixes: DnsFixes
