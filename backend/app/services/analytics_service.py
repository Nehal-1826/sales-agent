"""Workspace + platform analytics business logic (spec §5.1 items 1/4, §5.2 item 5).

All functions here are read-only — no writes to any table (no audit rows,
no row mutations, no upserts). Handlers in :mod:`app.api.routes.analytics`
and :mod:`app.api.routes.admin_platform_analytics` stay thin.

Workspace scoping: every workspace-facing helper takes a ``workspace_id``
and filters :class:`~app.db.models.mailboxes.Mailbox` rows by that column,
so cross-workspace leakage is impossible.

Placement split rationale (documented per spec):
    If no ``placement_tests`` rows are present, ``inbox_pct`` falls back
    to ``mean(daily_metrics.inbox_placement_pct)`` or ``100.0`` when that
    average is NULL too. ``spam_pct`` is derived as a proxy from the
    ratio of spam_rescues to emails_sent over the recent window, and
    ``promotions_pct`` absorbs the remainder so the three buckets sum
    to 100.0. This is an approximation until Wave 4 wires placement
    tests into the mix.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.payments import Payment, PaymentStatus
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupLog

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Shared helpers                                                              #
# --------------------------------------------------------------------------- #


def _today_utc() -> date:
    return datetime.now(UTC).date()


def _range_default(
    from_: date | None, to: date | None, *, days: int = 30
) -> tuple[date, date]:
    """Return (from, to) with sane defaults. ``to`` inclusive."""
    today = _today_utc()
    to_ = to or today
    from_ = from_ or (to_ - timedelta(days=days - 1))
    return from_, to_


async def _workspace_mailbox_ids(
    session: AsyncSession, workspace_id: uuid.UUID
) -> list[uuid.UUID]:
    result = await session.execute(
        select(Mailbox.id).where(Mailbox.workspace_id == workspace_id)
    )
    return [row[0] for row in result.all()]


async def _ensure_mailbox_in_workspace(
    session: AsyncSession, workspace_id: uuid.UUID, mailbox_id: uuid.UUID
) -> bool:
    result = await session.execute(
        select(Mailbox.id).where(
            Mailbox.id == mailbox_id, Mailbox.workspace_id == workspace_id
        )
    )
    return result.scalar_one_or_none() is not None


async def _resolve_mailbox_scope(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
) -> list[uuid.UUID] | None:
    """Return a list of mailbox ids to filter by, or ``None`` if no mailboxes.

    If ``mailbox_id`` is given and belongs to the workspace, returns
    ``[mailbox_id]``. If it doesn't belong, returns ``[]`` (caller short
    circuits to empty result). If omitted, returns all workspace mailbox
    ids (possibly empty list).
    """
    if mailbox_id is None:
        return await _workspace_mailbox_ids(session, workspace_id)
    if not await _ensure_mailbox_in_workspace(session, workspace_id, mailbox_id):
        return []
    return [mailbox_id]


# --------------------------------------------------------------------------- #
# Dashboard summary                                                           #
# --------------------------------------------------------------------------- #


async def dashboard_summary(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> dict[str, Any]:
    """Compose the dashboard hero response — combines 4 small queries."""
    mailbox_ids = await _workspace_mailbox_ids(session, workspace_id)
    total_mailboxes = len(mailbox_ids)

    # Active mailbox count (status=active, not paused).
    active_mailboxes = 0
    if mailbox_ids:
        result = await session.execute(
            select(func.count())
            .select_from(Mailbox)
            .where(
                Mailbox.workspace_id == workspace_id,
                Mailbox.warmup_status == WarmupStatus.active,
                Mailbox.is_paused.is_(False),
            )
        )
        active_mailboxes = int(result.scalar_one() or 0)

    today = _today_utc()
    yesterday = today - timedelta(days=1)
    start_30d = today - timedelta(days=29)

    today_stats = {
        "sent": 0,
        "opens": 0,
        "replies": 0,
        "spam_rescues": 0,
        "stars": 0,
        "marked_important": 0,
    }
    warmth_30d: list[dict[str, Any]] = []
    mean_warmth = 0.0
    warmth_delta_24h = 0.0
    inbox_pct_mean: float | None = None

    if mailbox_ids:
        # Read today's counts directly from warmup_logs so they're real-time.
        # The daily_metrics rollup runs at end-of-day — querying it here would
        # return zero until the celery beat task runs, which is the bug that
        # caused dashboard "today.sent=0" while /today-stats reported the truth.
        log_counts = await _today_action_counts(session, mailbox_ids, today)
        today_stats["sent"] = log_counts.get("sent", 0)
        today_stats["opens"] = log_counts.get("opened", 0)
        today_stats["replies"] = log_counts.get("replied", 0)
        today_stats["spam_rescues"] = log_counts.get("spam_rescued", 0)
        today_stats["stars"] = log_counts.get("starred", 0)
        today_stats["marked_important"] = log_counts.get("marked_important", 0)

        # Mean warmth for today + yesterday.
        today_mean, today_placement = await _daily_means(
            session, mailbox_ids, today
        )
        yday_mean, _ = await _daily_means(session, mailbox_ids, yesterday)
        mean_warmth = today_mean or 0.0
        if today_mean is not None and yday_mean is not None:
            warmth_delta_24h = today_mean - yday_mean
        inbox_pct_mean = today_placement

        # 30-day warmth history — one point per date, mean across mailboxes.
        warmth_rows = (
            await session.execute(
                select(
                    DailyMetric.date,
                    func.avg(DailyMetric.warmth_score),
                )
                .where(
                    DailyMetric.mailbox_id.in_(mailbox_ids),
                    DailyMetric.date >= start_30d,
                    DailyMetric.date <= today,
                )
                .group_by(DailyMetric.date)
                .order_by(DailyMetric.date.asc())
            )
        ).all()
        warmth_30d = [
            {"date": r[0], "score": float(r[1] or 0.0)} for r in warmth_rows
        ]

    placement_split = _compute_placement_split(
        inbox_pct_mean, today_stats["sent"], today_stats["spam_rescues"]
    )

    return {
        "mean_warmth_score": float(mean_warmth),
        "warmth_delta_24h": float(warmth_delta_24h),
        "total_mailboxes": total_mailboxes,
        "active_mailboxes": active_mailboxes,
        "placement_split": placement_split,
        "today": today_stats,
        "warmth_30d": warmth_30d,
    }


async def _today_action_counts(
    session: AsyncSession, mailbox_ids: list[uuid.UUID], today: date
) -> dict[str, int]:
    """Return counts for ``starred`` and ``marked_important`` today (UTC)."""
    start = datetime.combine(today, datetime.min.time()).replace(tzinfo=UTC)
    end = start + timedelta(days=1)
    rows = (
        await session.execute(
            select(WarmupLog.action, func.count())
            .where(
                WarmupLog.mailbox_id.in_(mailbox_ids),
                WarmupLog.created_at >= start,
                WarmupLog.created_at < end,
            )
            .group_by(WarmupLog.action)
        )
    ).all()
    out: dict[str, int] = {}
    for action, cnt in rows:
        key = action.value if hasattr(action, "value") else str(action)
        out[key] = int(cnt)
    return out


async def _daily_means(
    session: AsyncSession, mailbox_ids: list[uuid.UUID], the_date: date
) -> tuple[float | None, float | None]:
    """Return (mean_warmth_score, mean_inbox_placement_pct) for ``the_date``."""
    row = (
        await session.execute(
            select(
                func.avg(DailyMetric.warmth_score),
                func.avg(DailyMetric.inbox_placement_pct),
            ).where(
                DailyMetric.mailbox_id.in_(mailbox_ids),
                DailyMetric.date == the_date,
            )
        )
    ).one()
    warmth = float(row[0]) if row[0] is not None else None
    placement = float(row[1]) if row[1] is not None else None
    return warmth, placement


def _compute_placement_split(
    inbox_pct_mean: float | None, sent: int, spam_rescues: int
) -> dict[str, float]:
    """Approximate split when no placement_tests rows exist.

    ``inbox_pct`` defaults to ``inbox_pct_mean`` or 100.0. ``spam_pct``
    is clamped to [0, 100 - inbox_pct] via a rescue-rate proxy;
    ``promotions_pct`` absorbs the remainder.
    """
    inbox = 100.0 if inbox_pct_mean is None else max(0.0, min(100.0, inbox_pct_mean))
    spam_rate = (spam_rescues / sent * 100.0) if sent > 0 else 0.0
    # Rescue ratio is a *proxy* for spam placement; cap at 100-inbox.
    spam = max(0.0, min(100.0 - inbox, spam_rate))
    promotions = max(0.0, 100.0 - inbox - spam)
    return {
        "inbox_pct": round(inbox, 2),
        "promotions_pct": round(promotions, 2),
        "spam_pct": round(spam, 2),
    }


# --------------------------------------------------------------------------- #
# Daily metrics list                                                          #
# --------------------------------------------------------------------------- #


async def daily_metrics_rows(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    from_: date,
    to: date,
    granularity: str,
) -> list[dict[str, Any]]:
    scope = await _resolve_mailbox_scope(
        session, workspace_id=workspace_id, mailbox_id=mailbox_id
    )
    if scope is None or not scope:
        return []

    # Aggregate per-date across mailboxes (so single + multi-mailbox both sum).
    agg = (
        await session.execute(
            select(
                DailyMetric.date,
                func.coalesce(func.sum(DailyMetric.emails_sent), 0),
                func.coalesce(func.sum(DailyMetric.emails_received), 0),
                func.coalesce(func.sum(DailyMetric.opens), 0),
                func.coalesce(func.sum(DailyMetric.replies), 0),
                func.coalesce(func.sum(DailyMetric.spam_rescues), 0),
                func.coalesce(func.sum(DailyMetric.bounce_count), 0),
                func.coalesce(func.avg(DailyMetric.inbox_placement_pct), 0.0),
                func.coalesce(func.avg(DailyMetric.warmth_score), 0.0),
            )
            .where(
                DailyMetric.mailbox_id.in_(scope),
                DailyMetric.date >= from_,
                DailyMetric.date <= to,
            )
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()

    rows = [
        {
            "date": r[0],
            "emails_sent": int(r[1]),
            "emails_received": int(r[2]),
            "opens": int(r[3]),
            "replies": int(r[4]),
            "spam_rescues": int(r[5]),
            "bounce_count": int(r[6]),
            "inbox_placement_pct": float(r[7] or 0.0),
            "warmth_score": float(r[8] or 0.0),
        }
        for r in agg
    ]

    if granularity == "week":
        return _bucket_weekly(rows)
    return rows


def _bucket_weekly(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group rows into ISO-week buckets; emit one row per Monday."""
    buckets: dict[date, dict[str, Any]] = {}
    for r in rows:
        d: date = r["date"]
        week_start = d - timedelta(days=d.weekday())
        b = buckets.setdefault(
            week_start,
            {
                "date": week_start,
                "emails_sent": 0,
                "emails_received": 0,
                "opens": 0,
                "replies": 0,
                "spam_rescues": 0,
                "bounce_count": 0,
                "inbox_placement_pct_sum": 0.0,
                "warmth_score_sum": 0.0,
                "_n": 0,
            },
        )
        b["emails_sent"] += r["emails_sent"]
        b["emails_received"] += r["emails_received"]
        b["opens"] += r["opens"]
        b["replies"] += r["replies"]
        b["spam_rescues"] += r["spam_rescues"]
        b["bounce_count"] += r["bounce_count"]
        b["inbox_placement_pct_sum"] += r["inbox_placement_pct"]
        b["warmth_score_sum"] += r["warmth_score"]
        b["_n"] += 1

    out = []
    for _k, b in sorted(buckets.items()):
        n = b["_n"] or 1
        out.append(
            {
                "date": b["date"],
                "emails_sent": b["emails_sent"],
                "emails_received": b["emails_received"],
                "opens": b["opens"],
                "replies": b["replies"],
                "spam_rescues": b["spam_rescues"],
                "bounce_count": b["bounce_count"],
                "inbox_placement_pct": b["inbox_placement_pct_sum"] / n,
                "warmth_score": b["warmth_score_sum"] / n,
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Placement trend                                                             #
# --------------------------------------------------------------------------- #


async def placement_trend(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    from_: date,
    to: date,
) -> list[dict[str, Any]]:
    scope = await _resolve_mailbox_scope(
        session, workspace_id=workspace_id, mailbox_id=mailbox_id
    )
    if scope is None or not scope:
        return []

    rows = (
        await session.execute(
            select(
                DailyMetric.date,
                func.avg(DailyMetric.inbox_placement_pct),
                func.coalesce(func.sum(DailyMetric.emails_sent), 0),
                func.coalesce(func.sum(DailyMetric.spam_rescues), 0),
            )
            .where(
                DailyMetric.mailbox_id.in_(scope),
                DailyMetric.date >= from_,
                DailyMetric.date <= to,
            )
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()

    out = []
    for d, inbox, sent, rescues in rows:
        split = _compute_placement_split(
            float(inbox) if inbox is not None else None,
            int(sent or 0),
            int(rescues or 0),
        )
        out.append(
            {
                "date": d,
                "inbox_pct": split["inbox_pct"],
                "promotions_pct": split["promotions_pct"],
                "spam_pct": split["spam_pct"],
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Engagement rates                                                            #
# --------------------------------------------------------------------------- #


async def engagement_rates(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    from_: date,
    to: date,
) -> list[dict[str, Any]]:
    scope = await _resolve_mailbox_scope(
        session, workspace_id=workspace_id, mailbox_id=mailbox_id
    )
    if scope is None or not scope:
        return []

    # daily_metrics gives opens/replies/spam_rescues — star count from warmup_logs.
    metric_rows = (
        await session.execute(
            select(
                DailyMetric.date,
                func.coalesce(func.sum(DailyMetric.emails_sent), 0),
                func.coalesce(func.sum(DailyMetric.opens), 0),
                func.coalesce(func.sum(DailyMetric.replies), 0),
                func.coalesce(func.sum(DailyMetric.spam_rescues), 0),
            )
            .where(
                DailyMetric.mailbox_id.in_(scope),
                DailyMetric.date >= from_,
                DailyMetric.date <= to,
            )
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()

    # Count stars per date from warmup_logs (group by date portion of created_at).
    # SQLite + Postgres both accept ``func.date(col)``.
    start_dt = datetime.combine(from_, datetime.min.time()).replace(tzinfo=UTC)
    end_dt = datetime.combine(to + timedelta(days=1), datetime.min.time()).replace(
        tzinfo=UTC
    )
    star_rows = (
        await session.execute(
            select(func.date(WarmupLog.created_at), func.count())
            .where(
                WarmupLog.mailbox_id.in_(scope),
                WarmupLog.action == WarmupAction.starred,
                WarmupLog.created_at >= start_dt,
                WarmupLog.created_at < end_dt,
            )
            .group_by(func.date(WarmupLog.created_at))
        )
    ).all()
    star_by_date: dict[date, int] = {}
    for d_raw, cnt in star_rows:
        d = _coerce_date(d_raw)
        if d is not None:
            star_by_date[d] = int(cnt)

    out = []
    for d, sent_raw, opens_raw, replies_raw, rescues_raw in metric_rows:
        sent = int(sent_raw or 0)
        opens = int(opens_raw or 0)
        replies = int(replies_raw or 0)
        rescues = int(rescues_raw or 0)
        stars = star_by_date.get(d, 0)
        denom = sent if sent > 0 else 1
        out.append(
            {
                "date": d,
                "open_rate": _rate(opens, sent),
                "reply_rate": _rate(replies, sent),
                "star_rate": _rate(stars, sent),
                "spam_rescue_rate": _rate(rescues, sent),
            }
        )
        _ = denom
    return out


def _rate(num: int, denom: int) -> float:
    if denom <= 0:
        return 0.0
    return max(0.0, min(1.0, num / denom))


def _coerce_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------- #
# Warmth heatmap                                                              #
# --------------------------------------------------------------------------- #


async def warmth_heatmap(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    """Return a 7×24 matrix (weekday × hour) of activity counts.

    We use warmup_logs rather than daily_metrics because we need hour
    granularity. The "value" is the number of warmup actions observed
    in that bucket — a proxy for warmth heat.
    """
    scope = await _resolve_mailbox_scope(
        session, workspace_id=workspace_id, mailbox_id=mailbox_id
    )
    # Always return the full 7x24 grid — empty buckets get value=0.
    grid: dict[tuple[int, int], float] = {
        (wd, h): 0.0 for wd in range(7) for h in range(24)
    }

    if scope is None or not scope:
        return [
            {"weekday": wd, "hour": h, "value": grid[(wd, h)]}
            for wd in range(7)
            for h in range(24)
        ]

    rows = (
        await session.execute(
            select(WarmupLog.created_at).where(WarmupLog.mailbox_id.in_(scope))
        )
    ).all()
    for (ts,) in rows:
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        wd = ts.weekday()  # Mon=0, Sun=6
        hr = ts.hour
        if 0 <= wd <= 6 and 0 <= hr <= 23:
            grid[(wd, hr)] += 1.0

    return [
        {"weekday": wd, "hour": h, "value": grid[(wd, h)]}
        for wd in range(7)
        for h in range(24)
    ]


# --------------------------------------------------------------------------- #
# Bounce / spam trend                                                         #
# --------------------------------------------------------------------------- #


async def bounce_spam_trend(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    from_: date,
    to: date,
) -> list[dict[str, Any]]:
    scope = await _resolve_mailbox_scope(
        session, workspace_id=workspace_id, mailbox_id=mailbox_id
    )
    if scope is None or not scope:
        return []

    rows = (
        await session.execute(
            select(
                DailyMetric.date,
                func.coalesce(func.sum(DailyMetric.emails_sent), 0),
                func.coalesce(func.sum(DailyMetric.bounce_count), 0),
                func.coalesce(func.sum(DailyMetric.spam_rescues), 0),
            )
            .where(
                DailyMetric.mailbox_id.in_(scope),
                DailyMetric.date >= from_,
                DailyMetric.date <= to,
            )
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()

    return [
        {
            "date": r[0],
            "bounce_rate": _rate(int(r[2] or 0), int(r[1] or 0)),
            "spam_rate": _rate(int(r[3] or 0), int(r[1] or 0)),
        }
        for r in rows
    ]


# --------------------------------------------------------------------------- #
# Admin: platform overview                                                    #
# --------------------------------------------------------------------------- #


async def platform_overview(session: AsyncSession) -> dict[str, Any]:
    total_users = int(
        (await session.execute(select(func.count()).select_from(User))).scalar_one()
        or 0
    )
    # Active users = has at least one active mailbox.
    active_users = int(
        (
            await session.execute(
                select(func.count(func.distinct(Mailbox.user_id))).where(
                    Mailbox.warmup_status == WarmupStatus.active,
                    Mailbox.is_paused.is_(False),
                )
            )
        ).scalar_one()
        or 0
    )
    total_mailboxes = int(
        (
            await session.execute(select(func.count()).select_from(Mailbox))
        ).scalar_one()
        or 0
    )
    active_mailboxes = int(
        (
            await session.execute(
                select(func.count()).select_from(Mailbox).where(
                    Mailbox.warmup_status == WarmupStatus.active,
                    Mailbox.is_paused.is_(False),
                )
            )
        ).scalar_one()
        or 0
    )
    total_peer_inboxes = int(
        (
            await session.execute(select(func.count()).select_from(PeerInbox))
        ).scalar_one()
        or 0
    )
    active_peer_inboxes = int(
        (
            await session.execute(
                select(func.count()).select_from(PeerInbox).where(
                    PeerInbox.is_active.is_(True)
                )
            )
        ).scalar_one()
        or 0
    )

    # MRR: sum of succeeded payments in the last 30 days.
    horizon = datetime.now(UTC) - timedelta(days=30)
    mrr_cents = int(
        (
            await session.execute(
                select(func.coalesce(func.sum(Payment.amount_cents), 0)).where(
                    Payment.status == PaymentStatus.succeeded,
                    Payment.created_at >= horizon,
                )
            )
        ).scalar_one()
        or 0
    )

    today = _today_utc()
    start_7d = today - timedelta(days=6)
    total_sends_today = int(
        (
            await session.execute(
                select(func.coalesce(func.sum(DailyMetric.emails_sent), 0)).where(
                    DailyMetric.date == today
                )
            )
        ).scalar_one()
        or 0
    )
    total_sends_7d = int(
        (
            await session.execute(
                select(func.coalesce(func.sum(DailyMetric.emails_sent), 0)).where(
                    DailyMetric.date >= start_7d,
                    DailyMetric.date <= today,
                )
            )
        ).scalar_one()
        or 0
    )

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_mailboxes": total_mailboxes,
        "active_mailboxes": active_mailboxes,
        "total_peer_inboxes": total_peer_inboxes,
        "active_peer_inboxes": active_peer_inboxes,
        "mrr_cents": mrr_cents,
        "total_sends_today": total_sends_today,
        "total_sends_7d": total_sends_7d,
    }


# --------------------------------------------------------------------------- #
# Admin: warmth distribution                                                  #
# --------------------------------------------------------------------------- #


_BINS: list[tuple[int, int, str]] = [
    (0, 10, "0-10"),
    (10, 20, "10-20"),
    (20, 30, "20-30"),
    (30, 40, "30-40"),
    (40, 50, "40-50"),
    (50, 60, "50-60"),
    (60, 70, "60-70"),
    (70, 80, "70-80"),
    (80, 90, "80-90"),
    (90, 100, "90-100"),
]


async def warmth_distribution(session: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await session.execute(select(Mailbox.warmth_score))
    ).all()
    buckets = {label: 0 for _lo, _hi, label in _BINS}
    for (score,) in rows:
        s = float(score or 0.0)
        # Clamp then pick bucket.
        s_clamped = max(0.0, min(100.0, s))
        for lo, hi, label in _BINS:
            # [lo, hi) for all except the final bucket which is [90, 100].
            if label == "90-100":
                if s_clamped >= lo and s_clamped <= hi:
                    buckets[label] += 1
                    break
            else:
                if s_clamped >= lo and s_clamped < hi:
                    buckets[label] += 1
                    break
    return [{"range": label, "count": buckets[label]} for _lo, _hi, label in _BINS]


# --------------------------------------------------------------------------- #
# Admin: send volume                                                          #
# --------------------------------------------------------------------------- #


async def send_volume(
    session: AsyncSession,
    *,
    from_: date,
    to: date,
    granularity: str,
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(
                DailyMetric.date,
                func.coalesce(func.sum(DailyMetric.emails_sent), 0),
                func.coalesce(func.sum(DailyMetric.emails_received), 0),
                func.coalesce(func.sum(DailyMetric.opens), 0),
                func.coalesce(func.sum(DailyMetric.replies), 0),
            )
            .where(DailyMetric.date >= from_, DailyMetric.date <= to)
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()
    out = [
        {
            "date": r[0],
            "sent": int(r[1] or 0),
            "received": int(r[2] or 0),
            "opens": int(r[3] or 0),
            "replies": int(r[4] or 0),
        }
        for r in rows
    ]
    if granularity == "week":
        return _bucket_volume_weekly(out)
    return out


def _bucket_volume_weekly(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[date, dict[str, Any]] = {}
    for r in rows:
        d: date = r["date"]
        wk = d - timedelta(days=d.weekday())
        b = buckets.setdefault(
            wk, {"date": wk, "sent": 0, "received": 0, "opens": 0, "replies": 0}
        )
        b["sent"] += r["sent"]
        b["received"] += r["received"]
        b["opens"] += r["opens"]
        b["replies"] += r["replies"]
    return [buckets[k] for k in sorted(buckets)]


# --------------------------------------------------------------------------- #
# Admin: plan distribution                                                    #
# --------------------------------------------------------------------------- #


async def plan_distribution(session: AsyncSession) -> list[dict[str, Any]]:
    # Per-plan user count.
    user_counts = (
        await session.execute(
            select(Plan.id, Plan.name, Plan.price_cents, func.count(User.id))
            .outerjoin(User, User.plan_id == Plan.id)
            .group_by(Plan.id, Plan.name, Plan.price_cents)
        )
    ).all()

    # Per-plan active mailbox counts — join User then Mailbox.
    mbx_counts = (
        await session.execute(
            select(User.plan_id, func.count(Mailbox.id))
            .join(Mailbox, Mailbox.user_id == User.id)
            .where(
                Mailbox.warmup_status == WarmupStatus.active,
                Mailbox.is_paused.is_(False),
            )
            .group_by(User.plan_id)
        )
    ).all()
    mbx_by_plan: dict[uuid.UUID, int] = {
        row[0]: int(row[1] or 0) for row in mbx_counts if row[0] is not None
    }

    out = []
    for plan_id, name, price_cents, user_count in user_counts:
        uc = int(user_count or 0)
        mrr = uc * int(price_cents or 0)
        out.append(
            {
                "plan_name": name,
                "user_count": uc,
                "active_mailboxes": mbx_by_plan.get(plan_id, 0),
                "mrr_cents": mrr,
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Admin: signup rate                                                          #
# --------------------------------------------------------------------------- #


async def signup_rate(
    session: AsyncSession,
    *,
    from_: date,
    to: date,
    granularity: str,
) -> list[dict[str, Any]]:
    start = datetime.combine(from_, datetime.min.time()).replace(tzinfo=UTC)
    end = datetime.combine(to + timedelta(days=1), datetime.min.time()).replace(
        tzinfo=UTC
    )
    rows = (
        await session.execute(
            select(func.date(User.created_at), func.count())
            .where(User.created_at >= start, User.created_at < end)
            .group_by(func.date(User.created_at))
            .order_by(func.date(User.created_at).asc())
        )
    ).all()
    daily = []
    for d_raw, cnt in rows:
        d = _coerce_date(d_raw)
        if d is None:
            continue
        daily.append({"date": d, "count": int(cnt)})
    if granularity == "week":
        buckets: dict[date, int] = {}
        for r in daily:
            d_val = cast(date, r["date"])
            cnt_val = cast(int, r["count"])
            wk = d_val - timedelta(days=d_val.weekday())
            buckets[wk] = buckets.get(wk, 0) + cnt_val
        return [{"date": k, "count": buckets[k]} for k in sorted(buckets)]
    return daily


# --------------------------------------------------------------------------- #
# Admin: top clients                                                          #
# --------------------------------------------------------------------------- #


async def top_clients(
    session: AsyncSession, *, by: str, limit: int
) -> list[dict[str, Any]]:
    if by == "send_volume":
        metric_expr = func.coalesce(func.sum(DailyMetric.emails_sent), 0).label("m")
        stmt = (
            select(User.id, User.email, Plan.name, metric_expr)
            .select_from(User)
            .outerjoin(Plan, Plan.id == User.plan_id)
            .outerjoin(Mailbox, Mailbox.user_id == User.id)
            .outerjoin(DailyMetric, DailyMetric.mailbox_id == Mailbox.id)
            .group_by(User.id, User.email, Plan.name)
            .order_by(metric_expr.desc())
            .limit(limit)
        )
    elif by == "warmth":
        metric_expr = func.coalesce(func.avg(Mailbox.warmth_score), 0.0).label("m")
        stmt = (
            select(User.id, User.email, Plan.name, metric_expr)
            .select_from(User)
            .outerjoin(Plan, Plan.id == User.plan_id)
            .outerjoin(Mailbox, Mailbox.user_id == User.id)
            .group_by(User.id, User.email, Plan.name)
            .order_by(metric_expr.desc())
            .limit(limit)
        )
    elif by == "mailboxes":
        metric_expr = func.count(Mailbox.id).label("m")
        stmt = (
            select(User.id, User.email, Plan.name, metric_expr)
            .select_from(User)
            .outerjoin(Plan, Plan.id == User.plan_id)
            .outerjoin(Mailbox, Mailbox.user_id == User.id)
            .group_by(User.id, User.email, Plan.name)
            .order_by(metric_expr.desc())
            .limit(limit)
        )
    else:
        return []
    rows = (await session.execute(stmt)).all()
    return [
        {
            "user_id": r[0],
            "email": r[1],
            "plan_name": r[2],
            "metric_value": float(r[3] or 0.0),
        }
        for r in rows
    ]
