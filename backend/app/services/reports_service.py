"""Reports service — scheduled reports CRUD + on-demand CSV/PDF export.

PDF generation requires the optional ``reportlab`` dependency. When it
is not importable the route returns 501 with a hint — we never fall
back to a misleading extension silently. CSV is always available.
"""
from __future__ import annotations

import csv
import io
import logging
import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox
from app.db.models.scheduled_reports import ScheduledReport
from app.db.models.users import User
from app.schemas.reports import (
    ReportExportRequest,
    ScheduledReportCreate,
    ScheduledReportUpdate,
)
from app.services import formatting

logger = logging.getLogger(__name__)

_REPORTLAB_AVAILABLE: bool | None = None


def _reportlab_available() -> bool:
    global _REPORTLAB_AVAILABLE
    if _REPORTLAB_AVAILABLE is None:
        try:
            import reportlab  # noqa: F401
            _REPORTLAB_AVAILABLE = True
        except Exception:
            _REPORTLAB_AVAILABLE = False
    return _REPORTLAB_AVAILABLE


async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor_user_id: uuid.UUID | None,
    actor_role: str | None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
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


# ---------------- scheduled reports ----------------

async def list_scheduled(
    session: AsyncSession, *, user: User
) -> list[ScheduledReport]:
    result = await session.execute(
        select(ScheduledReport).where(
            ScheduledReport.workspace_id == user.workspace_id
        )
    )
    return list(result.scalars().all())


async def create_scheduled(
    session: AsyncSession, *, user: User, payload: ScheduledReportCreate
) -> ScheduledReport:
    row = ScheduledReport(
        workspace_id=user.workspace_id,
        type=payload.type,
        frequency=payload.frequency,
        recipients=[str(e) for e in payload.recipients],
    )
    session.add(row)
    await session.flush()
    await _write_audit(
        session,
        action="scheduled_report.created",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="scheduled_report",
        target_id=row.id,
        payload={"type": row.type, "frequency": row.frequency},
    )
    await session.commit()
    await session.refresh(row)
    return row


async def update_scheduled(
    session: AsyncSession,
    *,
    user: User,
    report_id: uuid.UUID,
    payload: ScheduledReportUpdate,
) -> ScheduledReport:
    row = await session.get(ScheduledReport, report_id)
    if row is None or row.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    data = payload.model_dump(exclude_unset=True)
    if "recipients" in data and data["recipients"] is not None:
        data["recipients"] = [str(e) for e in data["recipients"]]
    for field, val in data.items():
        setattr(row, field, val)
    await session.flush()
    await _write_audit(
        session,
        action="scheduled_report.updated",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="scheduled_report",
        target_id=row.id,
        payload=data,
    )
    await session.commit()
    await session.refresh(row)
    return row


async def delete_scheduled(
    session: AsyncSession, *, user: User, report_id: uuid.UUID
) -> None:
    row = await session.get(ScheduledReport, report_id)
    if row is None or row.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    await session.delete(row)
    await _write_audit(
        session,
        action="scheduled_report.deleted",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="scheduled_report",
        target_id=report_id,
    )
    await session.commit()


# ---------------- on-demand export ----------------

class _DailyRow:
    """Flat denormalized row used by both CSV and PDF renderers."""

    __slots__ = (
        "mailbox_email",
        "provider",
        "date",
        "weekday",
        "emails_sent",
        "emails_received",
        "opens",
        "replies",
        "spam_rescues",
        "bounce_count",
        "placement_pct",
        "warmth_score",
    )

    def __init__(
        self,
        *,
        mailbox_email: str,
        provider: str,
        date_: date,
        emails_sent: int,
        emails_received: int,
        opens: int,
        replies: int,
        spam_rescues: int,
        bounce_count: int,
        placement_pct: float,
        warmth_score: float,
    ) -> None:
        self.mailbox_email = mailbox_email
        self.provider = provider
        self.date = date_
        self.weekday = date_.strftime("%a")
        self.emails_sent = emails_sent
        self.emails_received = emails_received
        self.opens = opens
        self.replies = replies
        self.spam_rescues = spam_rescues
        self.bounce_count = bounce_count
        self.placement_pct = placement_pct
        self.warmth_score = warmth_score

    @property
    def open_rate(self) -> float:
        return (self.opens / self.emails_sent * 100) if self.emails_sent else 0.0

    @property
    def reply_rate(self) -> float:
        return (self.replies / self.emails_sent * 100) if self.emails_sent else 0.0


async def _fetch_export_rows(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_ids: list[uuid.UUID] | None,
    from_: date,
    to: date,
) -> list[_DailyRow]:
    """Fetch denormalized daily-metric rows, ordered by mailbox then date."""
    mbx_q = select(Mailbox.id, Mailbox.email_address, Mailbox.provider).where(
        Mailbox.workspace_id == workspace_id
    )
    if mailbox_ids:
        mbx_q = mbx_q.where(Mailbox.id.in_(mailbox_ids))
    mbx_rows = (await session.execute(mbx_q)).all()
    if not mbx_rows:
        return []
    mbx_map: dict[uuid.UUID, tuple[str, str]] = {
        row[0]: (row[1], (row[2].value if hasattr(row[2], "value") else str(row[2])))
        for row in mbx_rows
    }

    q = (
        select(DailyMetric)
        .where(
            and_(
                DailyMetric.mailbox_id.in_(list(mbx_map.keys())),
                DailyMetric.date >= from_,
                DailyMetric.date <= to,
            )
        )
        .order_by(DailyMetric.mailbox_id, DailyMetric.date)
    )
    metrics = (await session.execute(q)).scalars().all()
    out: list[_DailyRow] = []
    for m in metrics:
        email, provider = mbx_map.get(m.mailbox_id, ("", "smtp"))
        out.append(
            _DailyRow(
                mailbox_email=email,
                provider=provider,
                date_=m.date,
                emails_sent=m.emails_sent,
                emails_received=m.emails_received,
                opens=m.opens,
                replies=m.replies,
                spam_rescues=m.spam_rescues,
                bounce_count=m.bounce_count,
                placement_pct=m.inbox_placement_pct,
                warmth_score=m.warmth_score,
            )
        )
    return out


# ---------------- summarization helpers ----------------


def _summarize(rows: list[_DailyRow]) -> dict[str, Any]:
    """Compute aggregate KPIs across the full row set."""
    if not rows:
        return {
            "total_sent": 0, "total_received": 0, "total_opens": 0,
            "total_replies": 0, "total_spam_rescues": 0, "total_bounces": 0,
            "avg_warmth": 0.0, "avg_placement": 0.0,
            "open_rate": 0.0, "reply_rate": 0.0, "bounce_rate": 0.0,
            "mailbox_count": 0, "day_count": 0, "peak_day": None, "peak_sent": 0,
        }
    sent = sum(r.emails_sent for r in rows)
    by_day: dict[date, int] = {}
    for r in rows:
        by_day[r.date] = by_day.get(r.date, 0) + r.emails_sent
    peak_day, peak_sent = max(by_day.items(), key=lambda kv: kv[1])
    return {
        "total_sent": sent,
        "total_received": sum(r.emails_received for r in rows),
        "total_opens": sum(r.opens for r in rows),
        "total_replies": sum(r.replies for r in rows),
        "total_spam_rescues": sum(r.spam_rescues for r in rows),
        "total_bounces": sum(r.bounce_count for r in rows),
        "avg_warmth": sum(r.warmth_score for r in rows) / len(rows),
        "avg_placement": sum(r.placement_pct for r in rows) / len(rows),
        "open_rate": (sum(r.opens for r in rows) / sent * 100) if sent else 0.0,
        "reply_rate": (sum(r.replies for r in rows) / sent * 100) if sent else 0.0,
        "bounce_rate": (sum(r.bounce_count for r in rows) / sent * 100) if sent else 0.0,
        "mailbox_count": len({r.mailbox_email for r in rows}),
        "day_count": len(by_day),
        "peak_day": peak_day,
        "peak_sent": peak_sent,
    }


def _per_mailbox_summary(rows: list[_DailyRow]) -> list[dict[str, Any]]:
    """Roll-up totals per mailbox so the PDF gets a one-row-per-mailbox table."""
    by: dict[str, dict[str, Any]] = {}
    for r in rows:
        slot = by.setdefault(
            r.mailbox_email,
            {
                "mailbox_email": r.mailbox_email, "provider": r.provider,
                "sent": 0, "opens": 0, "replies": 0, "bounces": 0,
                "warmth_sum": 0.0, "placement_sum": 0.0, "n": 0,
            },
        )
        slot["sent"] += r.emails_sent
        slot["opens"] += r.opens
        slot["replies"] += r.replies
        slot["bounces"] += r.bounce_count
        slot["warmth_sum"] += r.warmth_score
        slot["placement_sum"] += r.placement_pct
        slot["n"] += 1
    out: list[dict[str, Any]] = []
    for slot in by.values():
        n = slot["n"] or 1
        sent = slot["sent"] or 0
        out.append(
            {
                "mailbox_email": slot["mailbox_email"],
                "provider": slot["provider"],
                "sent": sent,
                "opens": slot["opens"],
                "replies": slot["replies"],
                "bounces": slot["bounces"],
                "avg_warmth": slot["warmth_sum"] / n,
                "avg_placement": slot["placement_sum"] / n,
                "open_rate": (slot["opens"] / sent * 100) if sent else 0.0,
                "reply_rate": (slot["replies"] / sent * 100) if sent else 0.0,
            }
        )
    out.sort(key=lambda x: x["sent"], reverse=True)
    return out


def _health_assessment(summary: dict[str, Any]) -> list[tuple[str, str]]:
    """Return [(severity, text)] tuples — severity in {good, warn, bad}."""
    out: list[tuple[str, str]] = []
    warmth = summary["avg_warmth"]
    if warmth >= 70:
        out.append(("good", f"Warmth at {warmth:.0f}/100 — sender reputation is healthy."))
    elif warmth >= 40:
        out.append(("warn", f"Warmth at {warmth:.0f}/100 — building reputation, stay the course."))
    else:
        out.append(("bad", f"Warmth at {warmth:.0f}/100 — under-warmed; expect placement variance."))

    placement = summary["avg_placement"]
    if placement >= 90:
        out.append(("good", f"Inbox placement {placement:.1f}% — excellent."))
    elif placement >= 70:
        out.append(("warn", f"Inbox placement {placement:.1f}% — acceptable but watch trends."))
    else:
        out.append(("bad", f"Inbox placement {placement:.1f}% — investigate spam/promotions."))

    bounce = summary["bounce_rate"]
    if bounce <= 2:
        out.append(("good", f"Bounce rate {bounce:.2f}% — within ESP-safe band."))
    elif bounce <= 5:
        out.append(("warn", f"Bounce rate {bounce:.2f}% — verify list hygiene."))
    else:
        out.append(("bad", f"Bounce rate {bounce:.2f}% — above 5% triggers ESP throttling."))

    open_rate = summary["open_rate"]
    if open_rate >= 30:
        out.append(("good", f"Engagement (open rate) {open_rate:.1f}% — strong peer signal."))
    elif open_rate >= 10:
        out.append(("warn", f"Engagement {open_rate:.1f}% — peer pool warming up."))
    else:
        out.append(("bad", f"Engagement {open_rate:.1f}% — peer IMAP polling may not be configured."))
    return out


# ---------------- CSV (per type) ----------------


def _csv_preamble(
    buf: io.StringIO,
    *,
    kind: str,
    workspace: str,
    range_label: str,
    n: int,
    brand_name: str | None = None,
) -> None:
    if brand_name and brand_name != "WarmPulse":
        buf.write(f"# Report generated for {brand_name}\n")
    buf.write(f"# WarmPulse {kind} report\n")
    buf.write(f"# Workspace: {workspace}\n")
    buf.write(f"# Range: {range_label}\n")
    buf.write(f"# Generated: {datetime.now(UTC).isoformat(timespec='seconds')}\n")
    buf.write(f"# Rows: {n}\n")
    buf.write("\n")


def _csv_warmth(
    rows: list[_DailyRow], *, workspace: str, range_label: str,
    brand_name: str | None = None,
) -> bytes:
    """Warmth-focused: warmth + placement + bounce trends, day-by-day."""
    buf = io.StringIO()
    _csv_preamble(buf, kind="warmth", workspace=workspace, range_label=range_label,
                  n=len(rows), brand_name=brand_name)
    w = csv.writer(buf)
    w.writerow([
        "mailbox_email", "provider", "date", "weekday",
        "warmth_score", "placement_pct", "bounce_count", "emails_sent",
    ])
    for r in rows:
        w.writerow([
            r.mailbox_email, r.provider, r.date.isoformat(), r.weekday,
            f"{r.warmth_score:.2f}", f"{r.placement_pct:.1f}",
            r.bounce_count, r.emails_sent,
        ])
    return buf.getvalue().encode("utf-8")


def _csv_engagement(
    rows: list[_DailyRow], *, workspace: str, range_label: str,
    brand_name: str | None = None,
) -> bytes:
    """Engagement-focused: opens / replies / rescues + rates."""
    buf = io.StringIO()
    _csv_preamble(buf, kind="engagement", workspace=workspace, range_label=range_label,
                  n=len(rows), brand_name=brand_name)
    w = csv.writer(buf)
    w.writerow([
        "mailbox_email", "date", "weekday", "emails_sent",
        "opens", "open_rate_pct",
        "replies", "reply_rate_pct",
        "spam_rescues", "spam_rescue_rate_pct",
    ])
    for r in rows:
        rescue_rate = (r.spam_rescues / r.emails_sent * 100) if r.emails_sent else 0.0
        w.writerow([
            r.mailbox_email, r.date.isoformat(), r.weekday, r.emails_sent,
            r.opens, f"{r.open_rate:.2f}",
            r.replies, f"{r.reply_rate:.2f}",
            r.spam_rescues, f"{rescue_rate:.2f}",
        ])
    return buf.getvalue().encode("utf-8")


def _csv_placement(
    rows: list[_DailyRow], *, workspace: str, range_label: str,
    brand_name: str | None = None,
) -> bytes:
    """Placement-focused: inbox vs spam estimate, by provider, with bounces."""
    buf = io.StringIO()
    _csv_preamble(buf, kind="placement", workspace=workspace, range_label=range_label,
                  n=len(rows), brand_name=brand_name)
    w = csv.writer(buf)
    w.writerow([
        "mailbox_email", "provider", "date", "weekday",
        "emails_sent", "inbox_pct", "spam_or_promo_pct",
        "bounce_count", "bounce_rate_pct",
    ])
    for r in rows:
        bounce_rate = (r.bounce_count / r.emails_sent * 100) if r.emails_sent else 0.0
        spam_estimate = max(0.0, 100.0 - r.placement_pct)
        w.writerow([
            r.mailbox_email, r.provider, r.date.isoformat(), r.weekday,
            r.emails_sent, f"{r.placement_pct:.1f}", f"{spam_estimate:.1f}",
            r.bounce_count, f"{bounce_rate:.2f}",
        ])
    return buf.getvalue().encode("utf-8")


def _csv_white_label(
    rows: list[_DailyRow], *, workspace: str, range_label: str,
    brand_name: str | None = None,
) -> bytes:
    """White-label / agency export: per-mailbox roll-up, no day-level noise."""
    pm = _per_mailbox_summary(rows)
    buf = io.StringIO()
    _csv_preamble(
        buf, kind="white-label summary",
        workspace=workspace, range_label=range_label, n=len(pm),
        brand_name=brand_name,
    )
    w = csv.writer(buf)
    w.writerow([
        "mailbox", "provider", "emails_sent", "opens", "open_rate_pct",
        "replies", "reply_rate_pct", "bounces",
        "avg_warmth", "avg_placement_pct",
    ])
    for m in pm:
        w.writerow([
            m["mailbox_email"], m["provider"], m["sent"], m["opens"],
            f"{m['open_rate']:.2f}", m["replies"], f"{m['reply_rate']:.2f}",
            m["bounces"], f"{m['avg_warmth']:.1f}", f"{m['avg_placement']:.1f}",
        ])
    return buf.getvalue().encode("utf-8")


# ---------------- PDF helpers (shared across types) ----------------


def _pdf_imports():
    """One-shot reportlab import bundle so the per-type builders stay terse."""
    from reportlab.lib import colors  # type: ignore
    from reportlab.lib.pagesizes import A4  # type: ignore
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore
    from reportlab.lib.units import mm  # type: ignore
    from reportlab.platypus import (  # type: ignore
        SimpleDocTemplate, Table, TableStyle,
        Paragraph, Spacer, KeepTogether, PageBreak,
    )
    from reportlab.graphics.shapes import Drawing, Rect, String  # type: ignore
    from reportlab.graphics.charts.linecharts import HorizontalLineChart  # type: ignore
    from reportlab.graphics.charts.barcharts import VerticalBarChart  # type: ignore
    from reportlab.graphics.charts.piecharts import Pie  # type: ignore
    return {
        "colors": colors, "A4": A4,
        "getSampleStyleSheet": getSampleStyleSheet, "ParagraphStyle": ParagraphStyle,
        "mm": mm,
        "SimpleDocTemplate": SimpleDocTemplate, "Table": Table, "TableStyle": TableStyle,
        "Paragraph": Paragraph, "Spacer": Spacer, "KeepTogether": KeepTogether,
        "PageBreak": PageBreak,
        "Drawing": Drawing, "Rect": Rect, "String": String,
        "LineChart": HorizontalLineChart, "BarChart": VerticalBarChart, "Pie": Pie,
    }


def _pdf_styles(rl):
    """Brand palette + paragraph styles used by every report type.

    Palette mirrors the WarmPulse client UI tokens (CSS) so PDFs feel like
    the dashboard:
      VIOLET — primary accent  (rgb(124, 92, 255))  — hero / brand band
      CYAN   — secondary       (rgb(0, 196, 255))   — chart accent
      OK     — success         (rgb(0, 229, 160))
      WARN   — warning         (rgb(255, 213, 79))
      BAD    — danger          (rgb(255, 107, 74))
    """
    colors = rl["colors"]
    VIOLET = colors.HexColor("#F26522")
    VIOLET_SOFT = colors.HexColor("#FF9670")
    CYAN = colors.HexColor("#00c4ff")
    OK = colors.HexColor("#00e5a0")
    WARN = colors.HexColor("#ffd54f")
    BAD = colors.HexColor("#ff6b4a")
    DARK = colors.HexColor("#0f1419")
    INK = colors.HexColor("#1f2433")
    MUTED = colors.HexColor("#6b7280")
    LIGHT = colors.HexColor("#f5f3ff")
    ZEBRA = colors.HexColor("#f7f6fb")
    styles = rl["getSampleStyleSheet"]()
    PS = rl["ParagraphStyle"]
    return {
        # Brand-aligned (kept under the old "BRAND" key for back-compat with
        # any external callers, but the value is now violet, not green).
        "BRAND": VIOLET, "VIOLET": VIOLET, "VIOLET_SOFT": VIOLET_SOFT, "CYAN": CYAN,
        "OK": OK, "WARN": WARN, "BAD": BAD,
        "DARK": DARK, "INK": INK, "MUTED": MUTED,
        "LIGHT": LIGHT, "ZEBRA": ZEBRA,
        "h1_white": PS("h1_white", parent=styles["Title"], fontName="Helvetica-Bold",
                       fontSize=24, leading=28, textColor=colors.whitesmoke,
                       spaceAfter=2),
        "sub_white": PS("sub_white", parent=styles["BodyText"], fontName="Helvetica",
                        fontSize=10, leading=14, textColor=colors.whitesmoke,
                        spaceAfter=2),
        "tag_white": PS("tag_white", parent=styles["BodyText"], fontName="Helvetica-Bold",
                        fontSize=8, leading=10, textColor=colors.whitesmoke),
        "h1": PS("h1", parent=styles["Title"], fontName="Helvetica-Bold",
                 fontSize=22, leading=26, textColor=DARK, spaceAfter=4),
        "h2": PS("h2", parent=styles["Heading2"], fontName="Helvetica-Bold",
                 fontSize=13, leading=16, textColor=DARK,
                 spaceBefore=12, spaceAfter=6),
        "h3": PS("h3", parent=styles["Heading3"], fontName="Helvetica-Bold",
                 fontSize=10, leading=12, textColor=VIOLET,
                 spaceBefore=6, spaceAfter=4),
        "body": PS("body", parent=styles["BodyText"], fontName="Helvetica",
                   fontSize=9, leading=12, textColor=DARK),
        "muted": PS("muted", parent=styles["BodyText"], fontName="Helvetica",
                    fontSize=8, leading=10, textColor=MUTED),
        "hero_num": PS("hero_num", parent=styles["Title"], fontName="Helvetica-Bold",
                       fontSize=42, leading=44, textColor=colors.whitesmoke,
                       spaceAfter=0),
    }


def _hero_band(rl, st, *, title: str, subtitle: str, workspace: str,
               range_label: str, hero_label: str, hero_value: str,
               hero_caption: str):
    """Full-width violet brand band with a hero KPI on the right.

    Visually mirrors the dashboard hero cards: brand color block, eyebrow tag,
    big title, one-line description, and a giant numeric metric callout.
    """
    mm = rl["mm"]
    colors = rl["colors"]
    Drawing, Rect, String = rl["Drawing"], rl["Rect"], rl["String"]

    # Background band — full document width minus margins (~174mm content).
    band_w = 174 * mm
    band_h = 40 * mm
    band = Drawing(band_w, band_h)
    band.add(Rect(0, 0, band_w, band_h, fillColor=st["VIOLET"], strokeColor=None))
    # Decorative atmosphere circle — pure visual chrome.
    band.add(Rect(
        band_w - 30*mm, -5*mm, 60*mm, 60*mm,
        fillColor=st["VIOLET_SOFT"], strokeColor=None,
        # Faked rounded blob via low-stroke + visual offset; A4 PDF doesn't
        # need a true circle here.
    ))
    band.add(Rect(0, 0, band_w, band_h, fillColor=st["VIOLET"], strokeColor=None,
                  fillOpacity=0.92))  # restore main band over the blob.

    # Left text block (positioned via String shapes).
    band.add(String(8*mm, band_h - 8*mm, "WARMPULSE · REPORT",
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica-Bold", fontSize=8))
    band.add(String(8*mm, band_h - 18*mm, title,
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica-Bold", fontSize=18))
    band.add(String(8*mm, band_h - 26*mm, subtitle,
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica", fontSize=9))
    band.add(String(8*mm, band_h - 33*mm,
                    f"Workspace · {workspace}",
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica", fontSize=8))
    band.add(String(8*mm, band_h - 38*mm,
                    f"Range · {range_label}",
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica", fontSize=8))

    # Right hero KPI block.
    hero_x = band_w - 65*mm
    band.add(String(hero_x, band_h - 10*mm, hero_label.upper(),
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica-Bold", fontSize=8))
    band.add(String(hero_x, band_h - 24*mm, hero_value,
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica-Bold", fontSize=28))
    band.add(String(hero_x, band_h - 32*mm, hero_caption,
                    fillColor=colors.whitesmoke,
                    fontName="Helvetica", fontSize=8))

    return band


def _cover_block(rl, st, *, title: str, workspace: str, range_label: str,
                 mailbox_count: int, day_count: int, subtitle: str | None = None,
                 hero_label: str = "Period", hero_value: str = "",
                 hero_caption: str = ""):
    """Cover band — brand-banded hero with KPI callout + meta strip below.

    Backwards-compatible signature: existing builders that don't pass the new
    hero_* kwargs still get a sensible default (a "Period" callout showing
    mailbox/day counts).
    """
    band = _hero_band(
        rl, st,
        title=title,
        subtitle=subtitle or "WarmPulse warmup performance report.",
        workspace=workspace, range_label=range_label,
        hero_label=hero_label or "Period",
        hero_value=hero_value or f"{day_count}d",
        hero_caption=hero_caption or f"{mailbox_count} mailboxes covered",
    )
    out: list[Any] = [
        band,
        rl["Spacer"](1, 6),
        rl["Paragraph"](
            f"<font color='#6b7280'>Generated {formatting.datetime_label(datetime.now(UTC))} "
            f"&nbsp;·&nbsp; {mailbox_count} mailboxes &nbsp;·&nbsp; {day_count} days</font>",
            st["muted"],
        ),
        rl["Spacer"](1, 4),
    ]
    return rl["KeepTogether"](out)


def _divider(rl, st, *, label: str):
    """Section divider — colored bar + title."""
    mm = rl["mm"]
    Drawing, Rect, String = rl["Drawing"], rl["Rect"], rl["String"]
    d = Drawing(174 * mm, 6 * mm)
    d.add(Rect(0, 1.5*mm, 4*mm, 4*mm, fillColor=st["VIOLET"], strokeColor=None))
    d.add(String(7*mm, 2.5*mm, label.upper(),
                 fillColor=st["DARK"],
                 fontName="Helvetica-Bold", fontSize=10))
    return d


def _warmth_line_chart(rl, st, rows: list["_DailyRow"]):
    """Daily warmth line chart, 170mm × 50mm. Falls back to muted message."""
    mm = rl["mm"]
    if not rows:
        return rl["Paragraph"]("No warmth data in range.", st["muted"])
    # Aggregate by date — across mailboxes for the workspace average.
    by_day: dict[date, list[float]] = {}
    for r in rows:
        by_day.setdefault(r.date, []).append(r.warmth_score)
    series_points = sorted(
        (d, sum(vs) / len(vs)) for d, vs in by_day.items()
    )
    series = [p[1] for p in series_points]
    n = len(series)
    if n < 2:
        # Single-day data — fall back to a labelled bar so the section isn't blank.
        return _sends_bar_chart(rl, st, rows, color=st["VIOLET"])

    Drawing = rl["Drawing"]
    LineChart = rl["LineChart"]
    d = Drawing(170 * mm, 50 * mm)
    chart = LineChart()
    chart.x = 12 * mm
    chart.y = 8 * mm
    chart.width = 154 * mm
    chart.height = 36 * mm
    chart.data = [series]
    chart.lines[0].strokeColor = st["VIOLET"]
    chart.lines[0].strokeWidth = 1.6
    chart.lines.symbol = None
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 100
    chart.valueAxis.valueStep = 25
    chart.valueAxis.gridStrokeColor = st["MUTED"]
    chart.valueAxis.gridStrokeWidth = 0.2
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = st["MUTED"]
    # X labels: only show first/last and ~3 in between.
    cats: list[str] = []
    show_every = max(1, n // 5)
    for i, (dt, _) in enumerate(series_points):
        if i == 0 or i == n - 1 or i % show_every == 0:
            cats.append(dt.strftime("%b %d"))
        else:
            cats.append("")
    chart.categoryAxis.categoryNames = cats
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.fillColor = st["MUTED"]
    chart.categoryAxis.labels.angle = 0
    d.add(chart)
    return d


def _sends_bar_chart(rl, st, rows: list["_DailyRow"], *, color=None):
    """Daily emails-sent bar chart, 170mm × 50mm."""
    mm = rl["mm"]
    if not rows:
        return rl["Paragraph"]("No volume data in range.", st["muted"])
    by_day: dict[date, int] = {}
    for r in rows:
        by_day[r.date] = by_day.get(r.date, 0) + r.emails_sent
    pts = sorted(by_day.items())
    series = [v for _, v in pts]

    Drawing = rl["Drawing"]
    BarChart = rl["BarChart"]
    d = Drawing(170 * mm, 50 * mm)
    chart = BarChart()
    chart.x = 12 * mm
    chart.y = 8 * mm
    chart.width = 154 * mm
    chart.height = 36 * mm
    chart.data = [series]
    chart.bars[0].fillColor = color or st["CYAN"]
    chart.bars[0].strokeColor = None
    chart.valueAxis.valueMin = 0
    chart.valueAxis.gridStrokeColor = st["MUTED"]
    chart.valueAxis.gridStrokeWidth = 0.2
    chart.valueAxis.labels.fontName = "Helvetica"
    chart.valueAxis.labels.fontSize = 7
    chart.valueAxis.labels.fillColor = st["MUTED"]
    n = len(series)
    cats: list[str] = []
    show_every = max(1, n // 5)
    for i, (dt, _) in enumerate(pts):
        if i == 0 or i == n - 1 or i % show_every == 0:
            cats.append(dt.strftime("%b %d"))
        else:
            cats.append("")
    chart.categoryAxis.categoryNames = cats
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7
    chart.categoryAxis.labels.fillColor = st["MUTED"]
    chart.barSpacing = 1
    chart.groupSpacing = 4
    d.add(chart)
    return d


def _placement_donut(rl, st, summary: dict[str, Any]):
    """Inbox vs spam/promo donut, 60mm × 60mm."""
    mm = rl["mm"]
    inbox = float(summary.get("avg_placement", 0) or 0)
    inbox = max(0.0, min(100.0, inbox))
    other = max(0.0, 100.0 - inbox)
    if inbox == 0 and other == 0:
        return rl["Paragraph"]("No placement signal.", st["muted"])

    Drawing = rl["Drawing"]
    Pie = rl["Pie"]
    String = rl["String"]
    d = Drawing(70 * mm, 60 * mm)
    pie = Pie()
    pie.x = 5 * mm
    pie.y = 5 * mm
    pie.width = 50 * mm
    pie.height = 50 * mm
    pie.data = [inbox, other]
    pie.labels = None
    pie.sideLabels = 0
    pie.slices.strokeWidth = 0.5
    pie.slices.strokeColor = rl["colors"].whitesmoke
    pie.slices[0].fillColor = st["OK"]
    pie.slices[1].fillColor = st["MUTED"]
    pie.simpleLabels = 1
    # Hollow center by laying down a smaller white circle on top (mimics donut).
    Rect = rl["Rect"]
    d.add(pie)
    # Centred numeric label.
    d.add(Rect(15*mm, 22*mm, 30*mm, 16*mm,
               fillColor=rl["colors"].white, strokeColor=None))
    d.add(String(30*mm, 30*mm, f"{inbox:.0f}%",
                 fillColor=st["DARK"],
                 fontName="Helvetica-Bold", fontSize=14,
                 textAnchor="middle"))
    d.add(String(30*mm, 25*mm, "INBOX",
                 fillColor=st["MUTED"],
                 fontName="Helvetica-Bold", fontSize=7,
                 textAnchor="middle"))
    return d


def _kpi_grid(rl, st, *, top_labels: list[str], top_values: list[str],
              bottom_labels: list[str], bottom_values: list[str]):
    """Generic 4-column KPI grid (label/value × 2 rows)."""
    colors = rl["colors"]
    mm = rl["mm"]
    data = [top_labels, top_values, bottom_labels, bottom_values]
    t = rl["Table"](data, colWidths=[42*mm]*4)
    t.setStyle(rl["TableStyle"]([
        ("BACKGROUND", (0, 0), (-1, 0), st["DARK"]),
        ("BACKGROUND", (0, 2), (-1, 2), st["DARK"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("TEXTCOLOR", (0, 2), (-1, 2), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 2), (-1, 2), 8),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("FONTSIZE", (0, 3), (-1, 3), 14),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 0.5, st["MUTED"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, st["MUTED"]),
    ]))
    return t


def _data_table(rl, st, *, header: list[str], rows: list[list[Any]],
                col_widths: list[float] | None = None,
                font_size: int = 8):
    """Data table with brand header + zebra rows. Auto-flows across pages."""
    colors = rl["colors"]
    data = [header] + rows
    t = rl["Table"](data, repeatRows=1, colWidths=col_widths)
    t.setStyle(rl["TableStyle"]([
        ("BACKGROUND", (0, 0), (-1, 0), st["DARK"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1),
         [colors.whitesmoke, colors.HexColor("#f3f4f6")]),
        ("BOX", (0, 0), (-1, -1), 0.5, st["MUTED"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, st["MUTED"]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _health_table(rl, st, signals: list[tuple[str, str]]):
    """Health-assessment table — colored severity column."""
    colors = rl["colors"]
    mm = rl["mm"]
    if not signals:
        return rl["Paragraph"]("No signals to assess for this range.", st["muted"])
    data = [["Signal", "Verdict"]]
    for sev, text in signals:
        marker = {"good": "OK", "warn": "Watch", "bad": "Action"}.get(sev, sev)
        data.append([marker, text])
    t = rl["Table"](data, colWidths=[22*mm, 152*mm], repeatRows=1)
    style_cmds: list[Any] = [
        ("BACKGROUND", (0, 0), (-1, 0), st["DARK"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.5, st["MUTED"]),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, st["MUTED"]),
    ]
    for i, (sev, _) in enumerate(signals, start=1):
        bg = {"good": colors.HexColor("#10b981"),
              "warn": colors.HexColor("#f59e0b"),
              "bad": colors.HexColor("#ef4444")}.get(sev, colors.lightgrey)
        style_cmds.append(("BACKGROUND", (0, i), (0, i), bg))
        style_cmds.append(("TEXTCOLOR", (0, i), (0, i), colors.whitesmoke))
    t.setStyle(rl["TableStyle"](style_cmds))
    return t


def _make_doc(rl, *, title: str, workspace: str, range_label: str):
    """Build a SimpleDocTemplate with margins + buffer + footer callback."""
    mm = rl["mm"]
    colors = rl["colors"]
    # Footer brand line uses the same violet as the cover band so the report
    # feels consistent end-to-end. (Old value was a green "#00e5a0" leftover.)
    BRAND = colors.HexColor("#F26522")
    MUTED = colors.HexColor("#6b7280")
    buf = io.BytesIO()
    doc = rl["SimpleDocTemplate"](
        buf, pagesize=rl["A4"],
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=18*mm, bottomMargin=22*mm,
        title=title, author="WarmPulse",
    )

    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(18*mm, 12*mm, f"WarmPulse · {workspace} · {range_label}")
        canvas.drawRightString(
            doc.pagesize[0] - 18*mm, 12*mm, f"Page {doc.page}",
        )
        canvas.setStrokeColor(BRAND)
        canvas.setLineWidth(1.5)
        canvas.line(18*mm, 16*mm, doc.pagesize[0] - 18*mm, 16*mm)
        canvas.restoreState()

    return buf, doc, _footer


# ---------------- PDF (per type) ----------------


def _pdf_warmth(rows: list[_DailyRow], *, workspace: str, range_label: str) -> bytes:
    """Warmth report: reputation/placement/bounce focus."""
    rl = _pdf_imports(); st = _pdf_styles(rl)
    summary = _summarize(rows)
    health = _health_assessment(summary)
    buf, doc, footer = _make_doc(
        rl, title=f"WarmPulse warmth — {range_label}",
        workspace=workspace, range_label=range_label,
    )

    story: list[Any] = [
        _cover_block(
            rl, st, title="Warmth report",
            subtitle="Reputation, placement and bounce health across your mailboxes.",
            workspace=workspace, range_label=range_label,
            mailbox_count=summary["mailbox_count"], day_count=summary["day_count"],
            hero_label="Avg warmth",
            hero_value=f"{summary['avg_warmth']:.0f}",
            hero_caption=f"out of 100 · {summary['day_count']}d window",
        ),
        _divider(rl, st, label="Executive summary"),
        rl["Paragraph"](_warmth_summary_prose(summary), st["body"]),
        rl["Spacer"](1, 6),
        _kpi_grid(
            rl, st,
            top_labels=["Avg warmth", "Avg placement", "Bounce rate", "Total sent"],
            top_values=[
                f"{summary['avg_warmth']:.1f}",
                f"{summary['avg_placement']:.1f}%",
                f"{summary['bounce_rate']:.2f}%",
                str(summary["total_sent"]),
            ],
            bottom_labels=["Total bounces", "Mailboxes", "Days covered", "Peak day"],
            bottom_values=[
                str(summary["total_bounces"]),
                str(summary["mailbox_count"]),
                str(summary["day_count"]),
                (summary["peak_day"].isoformat() if summary["peak_day"] else "—"),
            ],
        ),
        _divider(rl, st, label="Warmth trend"),
        _warmth_line_chart(rl, st, rows),
        _divider(rl, st, label="Health assessment"),
        _health_table(rl, st, health),
    ]

    pm = _per_mailbox_summary(rows)
    story.append(_divider(rl, st, label="Per-mailbox warmth"))
    if pm:
        story.append(_data_table(
            rl, st,
            header=["Mailbox", "Provider", "Sent", "Bounces",
                    "Avg warmth", "Avg placement"],
            rows=[
                [m["mailbox_email"], m["provider"], str(m["sent"]),
                 str(m["bounces"]), f"{m['avg_warmth']:.1f}",
                 f"{m['avg_placement']:.1f}%"]
                for m in pm
            ],
        ))
    else:
        story.append(rl["Paragraph"]("No mailbox activity in range.", st["muted"]))

    story.append(_divider(rl, st, label="Daily warmth & placement"))
    if rows:
        story.append(_data_table(
            rl, st,
            header=["Mailbox", "Date", "Day", "Sent",
                    "Bounces", "Warmth", "Placement"],
            rows=[
                [r.mailbox_email, r.date.isoformat(), r.weekday,
                 str(r.emails_sent), str(r.bounce_count),
                 f"{r.warmth_score:.1f}", f"{r.placement_pct:.1f}%"]
                for r in rows
            ],
        ))
    else:
        story.append(rl["Paragraph"]("No daily data in range.", st["muted"]))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _warmth_summary_prose(summary: dict[str, Any]) -> str:
    """Plain-English executive summary paragraph for the warmth PDF."""
    warmth = summary["avg_warmth"]
    placement = summary["avg_placement"]
    sent = summary["total_sent"]
    days = summary["day_count"]
    if sent == 0:
        return (
            "No mailbox activity recorded in this window. Once the warmup engine "
            "begins sending, this section will summarise reputation and placement trends."
        )
    if warmth >= 70:
        verdict = "Sender reputation is healthy."
    elif warmth >= 40:
        verdict = "Sender reputation is building — keep the engine running."
    else:
        verdict = "Sender reputation is still warming up; expect placement variance."
    return (
        f"<b>{verdict}</b> Across {days} days, the warmup engine sent "
        f"<b>{sent:,}</b> peer messages with an average warmth score of "
        f"<b>{warmth:.0f}/100</b> and average inbox placement of "
        f"<b>{placement:.0f}%</b>. The sections below break this down by day "
        f"and mailbox, and surface any signals that need attention."
    )


def _pdf_engagement(rows: list[_DailyRow], *, workspace: str, range_label: str) -> bytes:
    """Engagement report: opens / replies / spam-rescue focus."""
    rl = _pdf_imports(); st = _pdf_styles(rl)
    summary = _summarize(rows)
    buf, doc, footer = _make_doc(
        rl, title=f"WarmPulse engagement — {range_label}",
        workspace=workspace, range_label=range_label,
    )

    story: list[Any] = [
        _cover_block(
            rl, st, title="Engagement report",
            subtitle="How peers are interacting with your warmup mail "
                     "(opens, replies, spam-rescue).",
            workspace=workspace, range_label=range_label,
            mailbox_count=summary["mailbox_count"], day_count=summary["day_count"],
            hero_label="Open rate",
            hero_value=f"{summary['open_rate']:.0f}%",
            hero_caption=(f"{summary['total_opens']:,} opens / "
                          f"{summary['total_sent']:,} sent"),
        ),
        _divider(rl, st, label="Executive summary"),
        rl["Paragraph"](_engagement_summary_prose(summary), st["body"]),
        rl["Spacer"](1, 6),
        _kpi_grid(
            rl, st,
            top_labels=["Opens", "Replies", "Spam rescues", "Total sent"],
            top_values=[
                str(summary["total_opens"]), str(summary["total_replies"]),
                str(summary["total_spam_rescues"]), str(summary["total_sent"]),
            ],
            bottom_labels=["Open rate", "Reply rate",
                           "Rescue / send", "Reply / open"],
            bottom_values=[
                f"{summary['open_rate']:.1f}%",
                f"{summary['reply_rate']:.1f}%",
                (f"{(summary['total_spam_rescues'] / summary['total_sent'] * 100):.2f}%"
                 if summary["total_sent"] else "—"),
                (f"{(summary['total_replies'] / summary['total_opens'] * 100):.1f}%"
                 if summary["total_opens"] else "—"),
            ],
        ),
        _divider(rl, st, label="Daily sends"),
        _sends_bar_chart(rl, st, rows, color=st["CYAN"]),
        _divider(rl, st, label="Per-mailbox engagement"),
    ]
    pm = _per_mailbox_summary(rows)
    if pm:
        story.append(_data_table(
            rl, st,
            header=["Mailbox", "Sent", "Opens", "Open %",
                    "Replies", "Reply %", "Bounces"],
            rows=[
                [m["mailbox_email"], str(m["sent"]),
                 str(m["opens"]), f"{m['open_rate']:.1f}%",
                 str(m["replies"]), f"{m['reply_rate']:.1f}%",
                 str(m["bounces"])]
                for m in pm
            ],
        ))
    else:
        story.append(rl["Paragraph"]("No engagement signal in range.", st["muted"]))

    story.append(_divider(rl, st, label="Daily engagement breakdown"))
    if rows:
        story.append(_data_table(
            rl, st,
            header=["Mailbox", "Date", "Day", "Sent",
                    "Opens", "Open %", "Replies", "Reply %", "Rescues"],
            rows=[
                [r.mailbox_email, r.date.isoformat(), r.weekday,
                 str(r.emails_sent), str(r.opens), f"{r.open_rate:.1f}%",
                 str(r.replies), f"{r.reply_rate:.1f}%",
                 str(r.spam_rescues)]
                for r in rows
            ],
        ))
    else:
        story.append(rl["Paragraph"]("No daily engagement data.", st["muted"]))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _engagement_summary_prose(summary: dict[str, Any]) -> str:
    """Plain-English executive summary paragraph for the engagement PDF."""
    sent = summary["total_sent"]
    if sent == 0:
        return (
            "No engagement signal yet. Peer interactions appear here once the "
            "warmup engine has sent enough mail for IMAP polling to surface "
            "opens and replies."
        )
    open_rate = summary["open_rate"]
    reply_rate = summary["reply_rate"]
    if open_rate >= 30:
        verdict = "Engagement is strong."
    elif open_rate >= 10:
        verdict = "Engagement is building."
    else:
        verdict = "Engagement is low — peer IMAP polling may not be configured."
    return (
        f"<b>{verdict}</b> The peer network opened <b>{summary['total_opens']:,}</b> "
        f"of <b>{sent:,}</b> messages ({open_rate:.0f}% open rate) and replied to "
        f"<b>{summary['total_replies']:,}</b> ({reply_rate:.0f}% reply rate). "
        f"Inbox providers heavily weight engagement signals when computing "
        f"sender reputation, so consistent opens and replies are exactly what "
        f"the warmup engine is here to produce."
    )


def _pdf_placement(rows: list[_DailyRow], *, workspace: str, range_label: str) -> bytes:
    """Placement report: inbox vs spam/promo, bounces, by provider."""
    rl = _pdf_imports(); st = _pdf_styles(rl)
    summary = _summarize(rows)
    buf, doc, footer = _make_doc(
        rl, title=f"WarmPulse placement — {range_label}",
        workspace=workspace, range_label=range_label,
    )

    # Provider roll-up.
    by_provider: dict[str, dict[str, Any]] = {}
    for r in rows:
        slot = by_provider.setdefault(
            r.provider, {"sent": 0, "bounces": 0,
                         "placement_sum": 0.0, "n": 0},
        )
        slot["sent"] += r.emails_sent
        slot["bounces"] += r.bounce_count
        slot["placement_sum"] += r.placement_pct
        slot["n"] += 1

    story: list[Any] = [
        _cover_block(
            rl, st, title="Placement report",
            subtitle="Inbox vs spam/promotions estimate, by provider, with bounce signal.",
            workspace=workspace, range_label=range_label,
            mailbox_count=summary["mailbox_count"], day_count=summary["day_count"],
            hero_label="Inbox placement",
            hero_value=f"{summary['avg_placement']:.0f}%",
            hero_caption=f"{max(0.0, 100.0 - summary['avg_placement']):.0f}% spam/promo",
        ),
        _divider(rl, st, label="Executive summary"),
        rl["Paragraph"](_placement_summary_prose(summary), st["body"]),
        rl["Spacer"](1, 6),
        # Donut + KPI grid side by side.
        rl["Table"](
            [[_placement_donut(rl, st, summary),
              _kpi_grid(
                  rl, st,
                  top_labels=["Avg inbox %", "Avg spam/promo %",
                              "Bounce rate", "Total sent"],
                  top_values=[
                      f"{summary['avg_placement']:.1f}%",
                      f"{max(0.0, 100.0 - summary['avg_placement']):.1f}%",
                      f"{summary['bounce_rate']:.2f}%",
                      str(summary["total_sent"]),
                  ],
                  bottom_labels=["Total bounces", "Providers",
                                 "Mailboxes", "Days covered"],
                  bottom_values=[
                      str(summary["total_bounces"]),
                      str(len(by_provider) or "—"),
                      str(summary["mailbox_count"]),
                      str(summary["day_count"]),
                  ],
              )]],
            colWidths=[70 * rl["mm"], 104 * rl["mm"]],
        ),
        _divider(rl, st, label="Daily sends"),
        _sends_bar_chart(rl, st, rows, color=st["OK"]),
        _divider(rl, st, label="By provider"),
    ]
    if by_provider:
        story.append(_data_table(
            rl, st,
            header=["Provider", "Mailbox-days", "Sent", "Bounces",
                    "Avg inbox %", "Bounce rate"],
            rows=sorted(
                [
                    [
                        prov, str(slot["n"]), str(slot["sent"]),
                        str(slot["bounces"]),
                        f"{(slot['placement_sum'] / slot['n']):.1f}%",
                        (f"{(slot['bounces'] / slot['sent'] * 100):.2f}%"
                         if slot["sent"] else "—"),
                    ]
                    for prov, slot in by_provider.items()
                ],
                key=lambda row: int(row[2]), reverse=True,
            ),
        ))
    else:
        story.append(rl["Paragraph"]("No provider breakdown in range.", st["muted"]))

    story.append(_divider(rl, st, label="Daily placement detail"))
    if rows:
        story.append(_data_table(
            rl, st,
            header=["Mailbox", "Provider", "Date", "Sent",
                    "Inbox %", "Spam/Promo %", "Bounces"],
            rows=[
                [r.mailbox_email, r.provider, r.date.isoformat(),
                 str(r.emails_sent),
                 f"{r.placement_pct:.1f}%",
                 f"{max(0.0, 100.0 - r.placement_pct):.1f}%",
                 str(r.bounce_count)]
                for r in rows
            ],
        ))
    else:
        story.append(rl["Paragraph"]("No daily placement data.", st["muted"]))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _placement_summary_prose(summary: dict[str, Any]) -> str:
    """Plain-English executive summary paragraph for the placement PDF."""
    placement = summary["avg_placement"]
    sent = summary["total_sent"]
    if sent == 0:
        return (
            "No placement signal yet. Once the warmup engine begins sending and "
            "peer IMAP polling reports back, this section will summarise inbox vs "
            "spam/promotions distribution by provider."
        )
    if placement >= 90:
        verdict = "Inbox placement is excellent."
    elif placement >= 70:
        verdict = "Inbox placement is acceptable but worth watching."
    else:
        verdict = "Inbox placement is low — investigate spam/promotions exposure."
    return (
        f"<b>{verdict}</b> Of <b>{sent:,}</b> warmup sends in this window, the "
        f"engine estimates <b>{placement:.0f}%</b> reached the inbox and "
        f"<b>{max(0.0, 100.0 - placement):.0f}%</b> landed in spam or promotions. "
        f"Bounce rate sits at <b>{summary['bounce_rate']:.2f}%</b>. "
        f"The donut and provider breakdown below show where the misses concentrate."
    )


def _pdf_white_label(rows: list[_DailyRow], *, workspace: str, range_label: str) -> bytes:
    """White-label / agency report: branded for the workspace, exec summary only."""
    rl = _pdf_imports(); st = _pdf_styles(rl)
    summary = _summarize(rows)
    pm = _per_mailbox_summary(rows)
    health = _health_assessment(summary)
    buf, doc, footer = _make_doc(
        rl, title=f"{workspace} — warmup performance — {range_label}",
        workspace=workspace, range_label=range_label,
    )

    # White-label cover: brand band shows the workspace as the publisher,
    # not "WarmPulse" — agency clients should see their own brand front-and-centre.
    cover = _hero_band(
        rl, st,
        title=workspace,
        subtitle="Warmup performance summary",
        workspace=workspace, range_label=range_label,
        hero_label="Mails sent",
        hero_value=f"{summary['total_sent']:,}",
        hero_caption=(f"{summary['mailbox_count']} mailboxes · "
                      f"{summary['day_count']}d window"),
    )

    rl_p = rl["Paragraph"]
    story: list[Any] = [
        cover,
        rl["Spacer"](1, 8),
        _divider(rl, st, label="Highlights"),
        _kpi_grid(
            rl, st,
            top_labels=["Mails sent", "Avg warmth",
                        "Inbox placement", "Engagement"],
            top_values=[
                str(summary["total_sent"]),
                f"{summary['avg_warmth']:.0f}/100",
                f"{summary['avg_placement']:.0f}%",
                f"{summary['open_rate']:.0f}%",
            ],
            bottom_labels=["Replies", "Spam rescued",
                           "Bounce rate", "Mailboxes"],
            bottom_values=[
                str(summary["total_replies"]),
                str(summary["total_spam_rescues"]),
                f"{summary['bounce_rate']:.2f}%",
                str(summary["mailbox_count"]),
            ],
        ),
        _divider(rl, st, label="Warmth trend"),
        _warmth_line_chart(rl, st, rows),
        _divider(rl, st, label="Performance verdict"),
        _health_table(rl, st, health),
        _divider(rl, st, label="Per-mailbox roll-up"),
    ]
    if pm:
        story.append(_data_table(
            rl, st,
            header=["Mailbox", "Sent", "Avg warmth",
                    "Inbox %", "Open %", "Reply %"],
            rows=[
                [m["mailbox_email"], str(m["sent"]),
                 f"{m['avg_warmth']:.0f}/100",
                 f"{m['avg_placement']:.0f}%",
                 f"{m['open_rate']:.1f}%",
                 f"{m['reply_rate']:.1f}%"]
                for m in pm
            ],
        ))
    else:
        story.append(rl_p("No mailbox activity in range.", st["muted"]))

    # Note: white-label intentionally omits the daily-detail table. Agency
    # clients want a one-glance executive view, not raw rows.

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


# ---------------- dispatcher ----------------


_PDF_BUILDERS = {
    "warmth": _pdf_warmth,
    "engagement": _pdf_engagement,
    "placement": _pdf_placement,
    "white_label": _pdf_white_label,
}
_CSV_BUILDERS = {
    "warmth": _csv_warmth,
    "engagement": _csv_engagement,
    "placement": _csv_placement,
    "white_label": _csv_white_label,
}


async def export_report(
    session: AsyncSession,
    *,
    user: User,
    kind: str,
    payload: ReportExportRequest,
) -> tuple[bytes, str, str]:
    """Type-aware export. ``kind`` ∈ warmth | engagement | placement | white_label.

    Falls back to ``warmth`` when an unknown kind is passed so the caller
    never receives a 500 for typos — but the filename will reflect what
    we actually rendered.
    """
    fmt = payload.format
    if fmt == "pdf" and not _reportlab_available():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={"error": "PDF export requires reportlab; use CSV for now."},
        )
    norm_kind = kind if kind in _PDF_BUILDERS else "warmth"
    rows = await _fetch_export_rows(
        session,
        workspace_id=user.workspace_id,
        mailbox_ids=payload.mailbox_ids,
        from_=payload.from_, to=payload.to,
    )
    # White-label branding: when the workspace has an Agency-tier brand
    # configured the title row uses the brand name; otherwise the default
    # ("WarmPulse") leaves the existing output unchanged.
    try:
        from app.services import branding_service
        branding = await branding_service.get_effective(session, user.workspace_id)
        brand_name = branding.get("brand_name") or "WarmPulse"
    except Exception:  # pragma: no cover — branding is best-effort here
        brand_name = "WarmPulse"

    workspace_label = (
        brand_name if brand_name and brand_name != "WarmPulse"
        else (user.email or str(user.workspace_id))
    )
    range_label = f"{payload.from_.isoformat()} → {payload.to.isoformat()}"
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    safe_kind = norm_kind.replace("_", "-")
    if fmt == "csv":
        body = _CSV_BUILDERS[norm_kind](
            rows, workspace=workspace_label, range_label=range_label,
            brand_name=brand_name,
        )
        return body, "text/csv; charset=utf-8", f"{safe_kind}-{stamp}.csv"
    body = _PDF_BUILDERS[norm_kind](
        rows, workspace=workspace_label, range_label=range_label,
    )
    return body, "application/pdf", f"{safe_kind}-{stamp}.pdf"


# Backwards-compat: the legacy /export/warmth endpoint and a few tests still
# import this name. Always renders the warmth variant regardless of caller.
async def export_warmth(
    session: AsyncSession, *, user: User, payload: ReportExportRequest
) -> tuple[bytes, str, str]:
    return await export_report(session, user=user, kind="warmth", payload=payload)
