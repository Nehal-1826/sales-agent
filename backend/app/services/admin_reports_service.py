"""Cross-workspace admin Reports service.

Super-admin only — this module is the ONLY place that knows about the
``admin_report_schedules`` table and report-generation logic. Routes are
thin pass-throughs.

Report types:
  revenue             — platform revenue (payments) + plan distribution
  subscriber_growth   — new signup timeseries + churn proxy
  warmup_usage        — send volume + engagement funnel across the platform
  deliverability      — inbox placement + bounce rate trend
  peer_health         — peer inbox health / reputation breakdown
  llm_cost            — LLM token/cost summary by user and mode

Export formats:
  csv   — always available (stdlib csv)
  xlsx  — via openpyxl; 501 with hint when missing
  pdf   — via reportlab; 501 with hint when missing

Audit invariant: every schedule mutation (create/update/delete) writes an
AuditLog row via a SAVEPOINT nested transaction so an audit failure can
never poison the surrounding transaction (same pattern as admin_crm_service).
"""
from __future__ import annotations

import csv
import io
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.admin_report_schedules import AdminReportSchedule
from app.db.models.audit_logs import AuditLog
from app.db.models.daily_metrics import DailyMetric
from app.db.models.llm_usage import LlmUsage
from app.db.models.mailboxes import Mailbox
from app.db.models.payments import Payment, PaymentStatus
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupAction, WarmupLog
from app.schemas.admin_reports import (
    Cadence,
    ExportFormat,
    ExportRequest,
    GenerateRequest,
    GenerateResult,
    GroupBy,
    ReportScheduleCreate,
    ReportScheduleOut,
    ReportScheduleUpdate,
    ReportTypeItem,
    SummaryItem,
)
from app.services import formatting

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Optional-dep availability flags                                              #
# --------------------------------------------------------------------------- #

_REPORTLAB_OK: bool | None = None
_OPENPYXL_OK: bool | None = None


def _reportlab_available() -> bool:
    global _REPORTLAB_OK
    if _REPORTLAB_OK is None:
        try:
            import reportlab  # noqa: F401
            _REPORTLAB_OK = True
        except Exception:
            _REPORTLAB_OK = False
    return _REPORTLAB_OK


def _openpyxl_available() -> bool:
    global _OPENPYXL_OK
    if _OPENPYXL_OK is None:
        try:
            import openpyxl  # noqa: F401
            _OPENPYXL_OK = True
        except Exception:
            _OPENPYXL_OK = False
    return _OPENPYXL_OK


# --------------------------------------------------------------------------- #
# Audit helper (SAVEPOINT pattern — same as admin_crm_service)                #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor: User,
    target_type: str,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor.id,
        actor_role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("audit write failed action=%s: %s", action, exc)


# --------------------------------------------------------------------------- #
# Report-type registry                                                         #
# --------------------------------------------------------------------------- #

_REGISTRY: list[ReportTypeItem] = [
    ReportTypeItem(
        key="revenue",
        label="Revenue",
        description="Platform revenue from succeeded payments, MRR trend, and plan distribution.",
        available_columns=["date", "plan", "amount_inr", "count", "mrr_inr", "cumulative_inr"],
        default_columns=["date", "plan", "amount_inr", "count"],
        has_money_metric=True,
    ),
    ReportTypeItem(
        key="subscriber_growth",
        label="Subscriber Growth",
        description="New user signups over time with plan breakdown.",
        available_columns=["date", "new_users", "plan", "total_users_cumulative"],
        default_columns=["date", "new_users", "total_users_cumulative"],
        has_money_metric=False,
    ),
    ReportTypeItem(
        key="warmup_usage",
        label="Warmup Usage",
        description="Platform-wide send volume, engagement funnel, and per-day warmth.",
        available_columns=["date", "emails_sent", "opens", "replies", "spam_rescues", "avg_warmth"],
        default_columns=["date", "emails_sent", "opens", "replies", "avg_warmth"],
        has_money_metric=False,
    ),
    ReportTypeItem(
        key="deliverability",
        label="Deliverability",
        description="Inbox placement, spam/promotions estimate, and bounce rate trend.",
        available_columns=["date", "inbox_pct", "spam_pct", "bounce_rate", "emails_sent"],
        default_columns=["date", "inbox_pct", "spam_pct", "bounce_rate"],
        has_money_metric=False,
    ),
    ReportTypeItem(
        key="peer_health",
        label="Peer Health",
        description="Peer inbox count, active ratio, reputation distribution, and provider breakdown.",
        available_columns=["provider", "total", "active", "inactive", "avg_reputation"],
        default_columns=["provider", "total", "active", "avg_reputation"],
        has_money_metric=False,
    ),
    ReportTypeItem(
        key="llm_cost",
        label="LLM Cost",
        description="LLM token consumption and cost by user and mode for the current month.",
        available_columns=["user_email", "plan", "tokens_mtd", "cost_inr", "mode_A", "mode_B", "mode_C", "mode_D"],
        default_columns=["user_email", "plan", "tokens_mtd", "cost_inr"],
        has_money_metric=True,
    ),
]

_REGISTRY_MAP: dict[str, ReportTypeItem] = {r.key: r for r in _REGISTRY}


def list_report_types() -> list[ReportTypeItem]:
    return _REGISTRY


# --------------------------------------------------------------------------- #
# Date-range resolver                                                          #
# --------------------------------------------------------------------------- #


def _resolve_range(req: GenerateRequest | ExportRequest) -> tuple[date, date]:
    today = datetime.now(UTC).date()
    if req.preset:
        if req.preset == "7d":
            return today - timedelta(days=6), today
        if req.preset == "30d":
            return today - timedelta(days=29), today
        if req.preset == "90d":
            return today - timedelta(days=89), today
        if req.preset == "mtd":
            return today.replace(day=1), today
        if req.preset == "ytd":
            return today.replace(month=1, day=1), today
    from_ = req.from_ or (today - timedelta(days=29))
    to_ = req.to_ or today
    return from_, to_


# --------------------------------------------------------------------------- #
# Per-type data assemblers                                                     #
# --------------------------------------------------------------------------- #


async def _assemble_revenue(
    session: AsyncSession,
    *,
    from_: date,
    to_: date,
    group_by: GroupBy,
    columns: list[str],
    compare_previous: bool,
) -> GenerateResult:
    """Revenue: daily totals from succeeded payments."""
    from_ = from_; to_ = to_
    rows = await _fetch_revenue_rows(session, from_=from_, to_=to_)
    summary = _revenue_summary(rows)

    prev_summary: dict[str, Any] | None = None
    if compare_previous:
        delta = (to_ - from_).days + 1
        p_from = from_ - timedelta(days=delta)
        p_to = from_ - timedelta(days=1)
        prev_rows = await _fetch_revenue_rows(session, from_=p_from, to_=p_to)
        prev_summary = _revenue_summary(prev_rows)

    summary_items = _build_revenue_summary_items(summary, prev_summary)
    effective_cols = columns or _REGISTRY_MAP["revenue"].default_columns
    out_rows = [_filter_cols(r, effective_cols) for r in rows]
    return GenerateResult(
        columns=effective_cols,
        rows=out_rows,
        summary=summary_items,
        estimated_rows=len(out_rows),
    )


async def _fetch_revenue_rows(
    session: AsyncSession, *, from_: date, to_: date
) -> list[dict[str, Any]]:
    stmt = (
        select(
            func.cast(Payment.created_at, type_=func.date(Payment.created_at).type).label("date"),
            Plan.name.label("plan"),
            func.coalesce(func.sum(Payment.amount_cents), 0).label("amount_cents"),
            func.count(Payment.id).label("count"),
        )
        .join(User, User.id == Payment.user_id, isouter=True)
        .join(Plan, Plan.id == User.plan_id, isouter=True)
        .where(
            Payment.status == PaymentStatus.succeeded,
            func.date(Payment.created_at) >= from_,
            func.date(Payment.created_at) <= to_,
        )
        .group_by(func.date(Payment.created_at), Plan.name)
        .order_by(func.date(Payment.created_at))
    )
    raw = (await session.execute(stmt)).all()
    rows: list[dict[str, Any]] = []
    for r in raw:
        d = r[0]
        if hasattr(d, "isoformat"):
            d_str = d.isoformat()
        else:
            d_str = str(d)
        rows.append({
            "date": d_str,
            "plan": r[1] or "unknown",
            "amount_inr": round(int(r[2] or 0) / 100, 2),
            "count": int(r[3] or 0),
        })
    return rows


def _revenue_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_inr = sum(r["amount_inr"] for r in rows)
    total_count = sum(r["count"] for r in rows)
    return {"total_inr": total_inr, "total_count": total_count}


def _build_revenue_summary_items(
    current: dict[str, Any], prev: dict[str, Any] | None
) -> list[SummaryItem]:
    items = [
        SummaryItem(
            label="Total Revenue",
            value=formatting.money_major(current["total_inr"], "INR"),
            delta_pct=_delta(current["total_inr"], prev["total_inr"] if prev else None),
        ),
        SummaryItem(
            label="Transactions",
            value=str(current["total_count"]),
            delta_pct=_delta(current["total_count"], prev["total_count"] if prev else None),
        ),
    ]
    return items


async def _assemble_subscriber_growth(
    session: AsyncSession,
    *,
    from_: date,
    to_: date,
    group_by: GroupBy,
    columns: list[str],
    compare_previous: bool,
) -> GenerateResult:
    stmt = (
        select(
            func.date(User.created_at).label("date"),
            Plan.name.label("plan"),
            func.count(User.id).label("new_users"),
        )
        .join(Plan, Plan.id == User.plan_id, isouter=True)
        .where(
            func.date(User.created_at) >= from_,
            func.date(User.created_at) <= to_,
        )
        .group_by(func.date(User.created_at), Plan.name)
        .order_by(func.date(User.created_at))
    )
    raw = (await session.execute(stmt)).all()
    rows: list[dict[str, Any]] = []
    cumulative = 0
    for r in raw:
        d = r[0]
        d_str = d.isoformat() if hasattr(d, "isoformat") else str(d)
        new = int(r[2] or 0)
        cumulative += new
        rows.append({
            "date": d_str,
            "plan": r[1] or "unknown",
            "new_users": new,
            "total_users_cumulative": cumulative,
        })

    total_current = sum(r["new_users"] for r in rows)
    prev_total: int | None = None
    if compare_previous:
        delta_days = (to_ - from_).days + 1
        p_from = from_ - timedelta(days=delta_days)
        p_to = from_ - timedelta(days=1)
        prev_count = int(
            await session.scalar(
                select(func.count(User.id)).where(
                    func.date(User.created_at) >= p_from,
                    func.date(User.created_at) <= p_to,
                )
            ) or 0
        )
        prev_total = prev_count

    effective_cols = columns or _REGISTRY_MAP["subscriber_growth"].default_columns
    return GenerateResult(
        columns=effective_cols,
        rows=[_filter_cols(r, effective_cols) for r in rows],
        summary=[
            SummaryItem(
                label="New Users",
                value=str(total_current),
                delta_pct=_delta(total_current, prev_total),
            )
        ],
        estimated_rows=len(rows),
    )


async def _assemble_warmup_usage(
    session: AsyncSession,
    *,
    from_: date,
    to_: date,
    group_by: GroupBy,
    columns: list[str],
    compare_previous: bool,
) -> GenerateResult:
    stmt = (
        select(
            DailyMetric.date,
            func.coalesce(func.sum(DailyMetric.emails_sent), 0),
            func.coalesce(func.sum(DailyMetric.opens), 0),
            func.coalesce(func.sum(DailyMetric.replies), 0),
            func.coalesce(func.sum(DailyMetric.spam_rescues), 0),
            func.coalesce(func.avg(DailyMetric.warmth_score), 0),
        )
        .where(DailyMetric.date >= from_, DailyMetric.date <= to_)
        .group_by(DailyMetric.date)
        .order_by(DailyMetric.date)
    )
    raw = (await session.execute(stmt)).all()
    rows: list[dict[str, Any]] = []
    for r in raw:
        rows.append({
            "date": r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]),
            "emails_sent": int(r[1] or 0),
            "opens": int(r[2] or 0),
            "replies": int(r[3] or 0),
            "spam_rescues": int(r[4] or 0),
            "avg_warmth": round(float(r[5] or 0), 2),
        })

    total_sent = sum(r["emails_sent"] for r in rows)
    total_opens = sum(r["opens"] for r in rows)
    prev_sent: int | None = None
    if compare_previous:
        delta_days = (to_ - from_).days + 1
        p_from = from_ - timedelta(days=delta_days)
        p_to = from_ - timedelta(days=1)
        prev_sent = int(
            await session.scalar(
                select(func.coalesce(func.sum(DailyMetric.emails_sent), 0)).where(
                    DailyMetric.date >= p_from, DailyMetric.date <= p_to
                )
            ) or 0
        )

    open_rate = round(total_opens / total_sent * 100, 2) if total_sent else 0.0
    effective_cols = columns or _REGISTRY_MAP["warmup_usage"].default_columns
    return GenerateResult(
        columns=effective_cols,
        rows=[_filter_cols(r, effective_cols) for r in rows],
        summary=[
            SummaryItem(
                label="Total Sent",
                value=str(total_sent),
                delta_pct=_delta(total_sent, prev_sent),
            ),
            SummaryItem(
                label="Open Rate",
                value=f"{open_rate:.1f}%",
            ),
        ],
        estimated_rows=len(rows),
    )


async def _assemble_deliverability(
    session: AsyncSession,
    *,
    from_: date,
    to_: date,
    group_by: GroupBy,
    columns: list[str],
    compare_previous: bool,
) -> GenerateResult:
    stmt = (
        select(
            DailyMetric.date,
            func.coalesce(func.avg(DailyMetric.inbox_placement_pct), 0),
            func.coalesce(func.sum(DailyMetric.bounce_count), 0),
            func.coalesce(func.sum(DailyMetric.emails_sent), 0),
        )
        .where(DailyMetric.date >= from_, DailyMetric.date <= to_)
        .group_by(DailyMetric.date)
        .order_by(DailyMetric.date)
    )
    raw = (await session.execute(stmt)).all()
    rows: list[dict[str, Any]] = []
    for r in raw:
        inbox = float(r[1] or 0)
        sent = int(r[3] or 0)
        bounces = int(r[2] or 0)
        spam_pct = round(max(0.0, 100.0 - inbox), 2)
        bounce_rate = round(bounces / sent * 100, 2) if sent else 0.0
        rows.append({
            "date": r[0].isoformat() if hasattr(r[0], "isoformat") else str(r[0]),
            "inbox_pct": round(inbox, 2),
            "spam_pct": spam_pct,
            "bounce_rate": bounce_rate,
            "emails_sent": sent,
        })

    avg_inbox = round(sum(r["inbox_pct"] for r in rows) / len(rows), 2) if rows else 0.0
    avg_bounce = round(sum(r["bounce_rate"] for r in rows) / len(rows), 2) if rows else 0.0
    effective_cols = columns or _REGISTRY_MAP["deliverability"].default_columns
    return GenerateResult(
        columns=effective_cols,
        rows=[_filter_cols(r, effective_cols) for r in rows],
        summary=[
            SummaryItem(label="Avg Inbox %", value=f"{avg_inbox:.1f}%"),
            SummaryItem(label="Avg Bounce Rate", value=f"{avg_bounce:.2f}%"),
        ],
        estimated_rows=len(rows),
    )


async def _assemble_peer_health(
    session: AsyncSession,
    *,
    columns: list[str],
    compare_previous: bool,
) -> GenerateResult:
    stmt = (
        select(
            PeerInbox.provider,
            func.count(PeerInbox.id).label("total"),
            func.sum(
                func.cast(PeerInbox.is_active.is_(True), type_=func.count().type)
            ).label("active_count"),
            func.coalesce(func.avg(PeerInbox.reputation_score), 0).label("avg_rep"),
        )
        .group_by(PeerInbox.provider)
        .order_by(func.count(PeerInbox.id).desc())
    )
    raw = (await session.execute(stmt)).all()
    rows: list[dict[str, Any]] = []
    for r in raw:
        prov = r[0].value if hasattr(r[0], "value") else str(r[0])
        total = int(r[1] or 0)
        active = int(r[2] or 0)
        rows.append({
            "provider": prov,
            "total": total,
            "active": active,
            "inactive": total - active,
            "avg_reputation": round(float(r[3] or 0), 3),
        })

    total_peers = sum(r["total"] for r in rows)
    active_peers = sum(r["active"] for r in rows)
    effective_cols = columns or _REGISTRY_MAP["peer_health"].default_columns
    return GenerateResult(
        columns=effective_cols,
        rows=[_filter_cols(r, effective_cols) for r in rows],
        summary=[
            SummaryItem(label="Total Peers", value=str(total_peers)),
            SummaryItem(
                label="Active",
                value=f"{active_peers}/{total_peers}",
            ),
        ],
        estimated_rows=len(rows),
    )


async def _assemble_llm_cost(
    session: AsyncSession,
    *,
    columns: list[str],
    compare_previous: bool,
) -> GenerateResult:
    since = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(
            User.email,
            Plan.name.label("plan"),
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ).label("tokens"),
            func.coalesce(func.sum(LlmUsage.cost_cents), 0).label("cost_cents"),
        )
        .select_from(LlmUsage)
        .join(User, User.id == LlmUsage.user_id)
        .join(Plan, Plan.id == User.plan_id, isouter=True)
        .where(LlmUsage.created_at >= since)
        .group_by(User.email, Plan.name)
        .order_by(func.sum(LlmUsage.cost_cents).desc())
    )
    raw = (await session.execute(stmt)).all()
    rows: list[dict[str, Any]] = []
    for r in raw:
        rows.append({
            "user_email": r[0] or "unknown",
            "plan": r[1] or "unknown",
            "tokens_mtd": int(r[2] or 0),
            "cost_inr": round(int(r[3] or 0) / 100, 2),
        })

    total_cost = sum(r["cost_inr"] for r in rows)
    total_tokens = sum(r["tokens_mtd"] for r in rows)
    effective_cols = columns or _REGISTRY_MAP["llm_cost"].default_columns
    return GenerateResult(
        columns=effective_cols,
        rows=[_filter_cols(r, effective_cols) for r in rows],
        summary=[
            SummaryItem(label="Total Cost (MTD)", value=formatting.money_major(total_cost, "INR")),
            SummaryItem(label="Total Tokens (MTD)", value=formatting.number(total_tokens)),
        ],
        estimated_rows=len(rows),
    )


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _delta(current: float | int, previous: float | int | None) -> float | None:
    if previous is None:
        return None
    if previous == 0:
        return None  # avoid inf
    return round((current - previous) / previous * 100, 2)


def _filter_cols(row: dict[str, Any], cols: list[str]) -> dict[str, Any]:
    if not cols:
        return row
    return {k: row.get(k) for k in cols if k in row}


# --------------------------------------------------------------------------- #
# generate()                                                                   #
# --------------------------------------------------------------------------- #


async def generate(session: AsyncSession, req: GenerateRequest) -> GenerateResult:
    if req.type not in _REGISTRY_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown report type: {req.type!r}. "
                   f"Valid: {list(_REGISTRY_MAP.keys())}",
        )
    from_, to_ = _resolve_range(req)
    effective_cols = req.columns or _REGISTRY_MAP[req.type].default_columns

    if req.type == "revenue":
        return await _assemble_revenue(
            session, from_=from_, to_=to_,
            group_by=req.group_by, columns=effective_cols,
            compare_previous=req.compare_previous,
        )
    if req.type == "subscriber_growth":
        return await _assemble_subscriber_growth(
            session, from_=from_, to_=to_,
            group_by=req.group_by, columns=effective_cols,
            compare_previous=req.compare_previous,
        )
    if req.type == "warmup_usage":
        return await _assemble_warmup_usage(
            session, from_=from_, to_=to_,
            group_by=req.group_by, columns=effective_cols,
            compare_previous=req.compare_previous,
        )
    if req.type == "deliverability":
        return await _assemble_deliverability(
            session, from_=from_, to_=to_,
            group_by=req.group_by, columns=effective_cols,
            compare_previous=req.compare_previous,
        )
    if req.type == "peer_health":
        return await _assemble_peer_health(
            session, columns=effective_cols,
            compare_previous=req.compare_previous,
        )
    # llm_cost
    return await _assemble_llm_cost(
        session, columns=effective_cols,
        compare_previous=req.compare_previous,
    )


# --------------------------------------------------------------------------- #
# export()                                                                     #
# --------------------------------------------------------------------------- #


async def export(
    session: AsyncSession,
    req: ExportRequest,
    actor: User,
) -> tuple[bytes, str, str]:
    """Return (body_bytes, media_type, filename).

    Raises 501 when PDF/XLSX deps are missing.
    """
    fmt = req.format
    if fmt == ExportFormat.pdf and not _reportlab_available():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="PDF export requires reportlab; use CSV or XLSX for now.",
        )
    if fmt == ExportFormat.xlsx and not _openpyxl_available():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="XLSX export requires openpyxl; use CSV for now.",
        )

    gen_req = GenerateRequest(
        type=req.type,
        preset=req.preset,
        from_=req.from_,
        to_=req.to_,
        plan_filter=req.plan_filter,
        region_filter=req.region_filter,
        status_filter=req.status_filter,
        group_by=req.group_by,
        columns=req.columns,
        compare_previous=False,
    )
    result = await generate(session, gen_req)

    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    safe_type = req.type.replace("_", "-")

    # Write an audit row for every export action.
    await _write_audit(
        session,
        action="admin_reports.export",
        actor=actor,
        target_type="admin_report",
        payload={"type": req.type, "format": fmt.value, "rows": result.estimated_rows},
    )

    if fmt == ExportFormat.csv:
        body = _to_csv(result)
        return body, "text/csv; charset=utf-8", f"admin-{safe_type}-{stamp}.csv"

    if fmt == ExportFormat.xlsx:
        body = _to_xlsx(result)
        return (
            body,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"admin-{safe_type}-{stamp}.xlsx",
        )

    # PDF
    body = _to_pdf(result, report_type=req.type, stamp=stamp)
    return body, "application/pdf", f"admin-{safe_type}-{stamp}.pdf"


# --------------------------------------------------------------------------- #
# Export serializers                                                           #
# --------------------------------------------------------------------------- #


def _to_csv(result: GenerateResult) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=result.columns, extrasaction="ignore")
    w.writeheader()
    w.writerows(result.rows)
    return buf.getvalue().encode("utf-8")


def _to_xlsx(result: GenerateResult) -> bytes:
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Report"
    ws.append(result.columns)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in result.rows:
        ws.append([row.get(c, "") for c in result.columns])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _to_pdf(result: GenerateResult, *, report_type: str, stamp: str) -> bytes:
    """Minimal single-page PDF — reportlab must be importable (caller guards)."""
    from reportlab.lib.pagesizes import A4  # type: ignore
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer  # type: ignore
    from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
    from reportlab.lib import colors  # type: ignore
    from reportlab.lib.units import mm  # type: ignore

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=18*mm, rightMargin=18*mm,
                            topMargin=18*mm, bottomMargin=22*mm,
                            title=f"Admin {report_type} report")
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"WarmPulse Admin Report — {report_type}", styles["Title"]),
        Paragraph(f"Generated: {stamp}", styles["Normal"]),
        Spacer(1, 10),
    ]
    if result.rows:
        data = [result.columns] + [[str(r.get(c, "")) for c in result.columns] for r in result.rows]
        t = Table(data, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f1419")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.HexColor("#f3f4f6")]),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#6b7280")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#6b7280")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)
    else:
        story.append(Paragraph("No data for this range.", styles["Normal"]))
    doc.build(story)
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# Schedules CRUD                                                               #
# --------------------------------------------------------------------------- #


def _compute_next_run(cadence: str) -> datetime:
    now = datetime.now(UTC)
    if cadence == Cadence.daily.value:
        return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    if cadence == Cadence.weekly.value:
        # Next Monday 00:00 UTC
        days_ahead = 7 - now.weekday()
        return (now + timedelta(days=days_ahead)).replace(hour=0, minute=0, second=0, microsecond=0)
    # Monthly — 1st of next month
    if now.month == 12:
        return now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)


async def list_schedules(session: AsyncSession) -> list[AdminReportSchedule]:
    result = await session.execute(
        select(AdminReportSchedule).order_by(AdminReportSchedule.created_at.desc())
    )
    return list(result.scalars().all())


async def create_schedule(
    session: AsyncSession,
    *,
    payload: ReportScheduleCreate,
    actor: User,
) -> AdminReportSchedule:
    row = AdminReportSchedule(
        name=payload.name,
        report_type=payload.report_type,
        cadence=payload.cadence.value,
        recipients=payload.recipients,
        format=payload.format.value,
        filters=payload.filters,
        enabled=payload.enabled,
        next_run_at=_compute_next_run(payload.cadence.value),
    )
    session.add(row)
    await session.flush()
    await _write_audit(
        session,
        action="admin_reports.schedule_created",
        actor=actor,
        target_type="admin_report_schedule",
        target_id=row.id,
        payload={"name": row.name, "type": row.report_type, "cadence": row.cadence},
    )
    await session.commit()
    await session.refresh(row)
    return row


async def update_schedule(
    session: AsyncSession,
    *,
    schedule_id: uuid.UUID,
    payload: ReportScheduleUpdate,
    actor: User,
) -> AdminReportSchedule:
    row = await session.get(AdminReportSchedule, schedule_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )
    data = payload.model_dump(exclude_unset=True)
    # Coerce enum fields to their string values
    for field in ("cadence", "format"):
        if field in data and hasattr(data[field], "value"):
            data[field] = data[field].value
    for k, v in data.items():
        setattr(row, k, v)
    # Recompute next_run_at if cadence changed and enabled
    if "cadence" in data and row.enabled:
        row.next_run_at = _compute_next_run(row.cadence)
    await session.flush()
    await _write_audit(
        session,
        action="admin_reports.schedule_updated",
        actor=actor,
        target_type="admin_report_schedule",
        target_id=row.id,
        payload=data,
    )
    await session.commit()
    await session.refresh(row)
    return row


async def delete_schedule(
    session: AsyncSession,
    *,
    schedule_id: uuid.UUID,
    actor: User,
) -> None:
    row = await session.get(AdminReportSchedule, schedule_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )
    await session.delete(row)
    await _write_audit(
        session,
        action="admin_reports.schedule_deleted",
        actor=actor,
        target_type="admin_report_schedule",
        target_id=schedule_id,
        payload={"name": row.name},
    )
    await session.commit()


def _schedule_to_out(row: AdminReportSchedule) -> ReportScheduleOut:
    return ReportScheduleOut(
        id=row.id,
        name=row.name,
        report_type=row.report_type,
        cadence=row.cadence,
        recipients=list(row.recipients or []),
        format=row.format,
        filters=dict(row.filters or {}),
        enabled=row.enabled,
        next_run_at=row.next_run_at,
        last_run_at=row.last_run_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
