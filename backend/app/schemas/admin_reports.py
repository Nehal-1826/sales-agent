"""Pydantic v2 schemas for the cross-workspace admin Reports endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


# --------------------------------------------------------------------------- #
# Report-type registry                                                         #
# --------------------------------------------------------------------------- #


class ReportTypeItem(BaseModel):
    """Static registry entry for one report type."""

    model_config = ConfigDict(from_attributes=True)

    key: str          # e.g. "revenue"
    label: str        # e.g. "Revenue"
    description: str
    available_columns: list[str]
    default_columns: list[str]
    has_money_metric: bool   # whether ₹ formatting applies


# --------------------------------------------------------------------------- #
# Generate request / result                                                    #
# --------------------------------------------------------------------------- #


class GroupBy(str, Enum):
    none = "none"
    plan = "plan"
    month = "month"
    region = "region"


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str                                   # key from registry
    # Date range — exactly one of (preset, from_/to_) must be provided;
    # preset shadows explicit dates when both are present.
    preset: str | None = None                   # "7d" | "30d" | "90d" | "mtd" | "ytd"
    from_: date | None = None
    to_: date | None = None
    # Optional filters (all lists may be empty / absent = no filter)
    plan_filter: list[str] = []
    region_filter: list[str] = []
    status_filter: list[str] = []
    group_by: GroupBy = GroupBy.none
    columns: list[str] = []                     # empty = use default_columns
    compare_previous: bool = False              # also fetch the preceding period


class SummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    label: str
    value: str        # formatted string (caller formats ₹ / % / n)
    delta_pct: float | None = None  # positive = up vs previous period


class GenerateResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    columns: list[str]
    rows: list[dict[str, Any]]
    summary: list[SummaryItem]
    estimated_rows: int


# --------------------------------------------------------------------------- #
# Export request                                                               #
# --------------------------------------------------------------------------- #


class ExportFormat(str, Enum):
    csv = "csv"
    pdf = "pdf"
    xlsx = "xlsx"


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    preset: str | None = None
    from_: date | None = None
    to_: date | None = None
    plan_filter: list[str] = []
    region_filter: list[str] = []
    status_filter: list[str] = []
    group_by: GroupBy = GroupBy.none
    columns: list[str] = []
    format: ExportFormat = ExportFormat.csv


# --------------------------------------------------------------------------- #
# Schedules                                                                    #
# --------------------------------------------------------------------------- #


class Cadence(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class ReportScheduleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    report_type: str
    cadence: Cadence
    recipients: list[str]
    format: ExportFormat = ExportFormat.csv
    filters: dict[str, Any] = {}
    enabled: bool = True


class ReportScheduleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    cadence: Cadence | None = None
    recipients: list[str] | None = None
    format: ExportFormat | None = None
    filters: dict[str, Any] | None = None
    enabled: bool | None = None


class ReportScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    report_type: str
    cadence: str
    recipients: list[str]
    format: str
    filters: dict[str, Any]
    enabled: bool
    next_run_at: datetime | None
    last_run_at: datetime | None
    created_at: datetime
    updated_at: datetime
