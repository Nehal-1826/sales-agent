"""Pydantic v2 schemas for analytics endpoints (workspace + admin).

See spec §5.1 items 1/3/4 and §5.2 item 5. These are strictly projection
schemas — all inputs are query params parsed at the route layer, so there
are no "request" models here.
"""
from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

# --------------------------------------------------------------------------- #
# Workspace dashboard summary                                                 #
# --------------------------------------------------------------------------- #


class PlacementSplit(BaseModel):
    inbox_pct: float = Field(ge=0.0, le=100.0)
    promotions_pct: float = Field(ge=0.0, le=100.0)
    spam_pct: float = Field(ge=0.0, le=100.0)


class TodayStats(BaseModel):
    sent: int
    opens: int
    replies: int
    spam_rescues: int
    stars: int
    marked_important: int


class WarmthPoint(BaseModel):
    date: date
    score: float


class DashboardSummary(BaseModel):
    mean_warmth_score: float
    warmth_delta_24h: float
    total_mailboxes: int
    active_mailboxes: int
    placement_split: PlacementSplit
    today: TodayStats
    warmth_30d: list[WarmthPoint]


# --------------------------------------------------------------------------- #
# Daily metrics + trends                                                      #
# --------------------------------------------------------------------------- #


class DailyMetricRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    emails_sent: int
    emails_received: int
    opens: int
    replies: int
    spam_rescues: int
    bounce_count: int
    inbox_placement_pct: float
    warmth_score: float


class PlacementTrendPoint(BaseModel):
    date: date
    inbox_pct: float
    promotions_pct: float
    spam_pct: float


class EngagementPoint(BaseModel):
    date: date
    open_rate: float
    reply_rate: float
    star_rate: float
    spam_rescue_rate: float


class HeatmapCell(BaseModel):
    weekday: int = Field(ge=0, le=6)
    hour: int = Field(ge=0, le=23)
    value: float


class WarmthHeatmap(BaseModel):
    cells: list[HeatmapCell]


class BounceSpamPoint(BaseModel):
    date: date
    bounce_rate: float
    spam_rate: float


# --------------------------------------------------------------------------- #
# Admin platform analytics                                                    #
# --------------------------------------------------------------------------- #


class PlatformOverview(BaseModel):
    total_users: int
    active_users: int
    total_mailboxes: int
    active_mailboxes: int
    total_peer_inboxes: int
    active_peer_inboxes: int
    mrr_cents: int
    total_sends_today: int
    total_sends_7d: int


class WarmthDistributionBin(BaseModel):
    range: str
    count: int


class WarmthDistribution(BaseModel):
    bins: list[WarmthDistributionBin]


class VolumePoint(BaseModel):
    date: date
    sent: int
    received: int
    opens: int
    replies: int


class PlanDistributionRow(BaseModel):
    plan_name: str
    user_count: int
    active_mailboxes: int
    mrr_cents: int


class PlanDistribution(BaseModel):
    by_plan: list[PlanDistributionRow]


class SignupPoint(BaseModel):
    date: date
    count: int


class TopClient(BaseModel):
    user_id: uuid.UUID
    email: str
    plan_name: str | None
    metric_value: float
