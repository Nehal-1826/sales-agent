"""Workspace reports — scheduled digest CRUD + on-demand CSV/PDF (§5.1 #7)."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.generated_reports import GeneratedReport
from app.db.models.scheduled_reports import ScheduledReport as ScheduledReportModel
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.reports import (
    ReportExportRequest,
    ReportsHistoryEntry,
    ScheduledReportCreate,
    ScheduledReportOut,
    ScheduledReportUpdate,
)
from app.services import reports_service
from app.services.transactional_mail import send_transactional_with_attachment

router = APIRouter(prefix="/api/workspace/reports", tags=["reports"])


# ---------------- shapes the frontend expects ----------------


class GeneratedReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    range: str
    format: str
    created_at: datetime
    download_url: str


class GenerateReportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    type: Literal["warmth", "engagement", "placement", "white_label"]
    format: Literal["pdf", "csv"]
    from_: date = Field(alias="from")
    to: date
    mailbox_ids: list[uuid.UUID] | None = None


class EmailReportPayload(BaseModel):
    """Email an on-demand report to one or more recipients.

    If ``recipients`` is omitted we default to the caller's own email so the
    "Email to me" button on the Pro Reports page just works without any extra
    UX. Behaviour is dry-run-friendly: when the transactional SMTP host is
    unset we log + ack with 202 rather than failing the call.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    type: Literal["warmth", "engagement", "placement", "white_label"]
    format: Literal["pdf", "csv"] = "pdf"
    from_: date = Field(alias="from")
    to: date
    recipients: list[str] | None = None
    mailbox_ids: list[uuid.UUID] | None = None


class ReportsVolumePoint(BaseModel):
    date: str
    pdfs: int
    csvs: int


def _generated_to_out(row: GeneratedReport) -> GeneratedReportOut:
    # NOTE: download_url is intentionally WITHOUT the "/api" prefix. The
    # frontend axios instance (frontend/src/lib/api.ts) sets
    # baseURL=VITE_API_BASE_URL which is "/api" (dev, Vite-proxied) or
    # "http://host/api" (env override). useDownloadReport() passes this
    # relative path to api.get(...), and axios combineURLs prepends the
    # baseURL → "/api/workspace/reports/generated/<id>/download", which is
    # exactly the router prefix ("/api/workspace/reports") + this route.
    # Adding "/api" here would double-prefix to "/api/api/..." → 404.
    return GeneratedReportOut(
        id=row.id,
        type=row.type,
        range=row.range_label,
        format=row.format,
        created_at=row.created_at,
        download_url=f"/workspace/reports/generated/{row.id}/download",
    )


def _scheduled_to_dict(row: ScheduledReportModel) -> dict[str, Any]:
    """Map ScheduledReport model → frontend ScheduledReport shape."""
    last = row.last_sent_at
    if last is not None:
        # Naïve "next run" projection so the UI can show a date.
        delta = {"daily": 1, "weekly": 7, "monthly": 30}.get(row.frequency, 7)
        next_run = last + timedelta(days=delta)
    else:
        next_run = datetime.now(UTC)
    return {
        "id": str(row.id),
        "type": row.type,
        "frequency": row.frequency,
        "recipients": list(row.recipients or []),
        "next_run_at": next_run.isoformat(),
        "last_run_at": last.isoformat() if last else None,
    }


async def _list_generated(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[GeneratedReport]:
    rows = (
        await session.execute(
            select(GeneratedReport)
            .where(GeneratedReport.workspace_id == workspace_id)
            .order_by(GeneratedReport.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def _volume_series(
    session: AsyncSession, *, workspace_id: uuid.UUID, days: int
) -> list[ReportsVolumePoint]:
    cutoff = datetime.now(UTC).date() - timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(
                func.date(GeneratedReport.created_at).label("d"),
                GeneratedReport.format,
                func.count().label("n"),
            )
            .where(
                GeneratedReport.workspace_id == workspace_id,
                func.date(GeneratedReport.created_at) >= cutoff,
            )
            .group_by(func.date(GeneratedReport.created_at), GeneratedReport.format)
        )
    ).all()
    by_day: dict[str, dict[str, int]] = {}
    for d, fmt, n in rows:
        key = d.isoformat() if hasattr(d, "isoformat") else str(d)
        slot = by_day.setdefault(key, {"pdfs": 0, "csvs": 0})
        if fmt == "pdf":
            slot["pdfs"] = int(n)
        elif fmt == "csv":
            slot["csvs"] = int(n)

    today = datetime.now(UTC).date()
    out: list[ReportsVolumePoint] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        slot = by_day.get(d.isoformat(), {"pdfs": 0, "csvs": 0})
        out.append(
            ReportsVolumePoint(date=d.isoformat(), pdfs=slot["pdfs"], csvs=slot["csvs"])
        )
    return out


@router.get("")
async def reports_aggregate(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Single aggregate so the Reports tab loads in one request."""
    generated = await _list_generated(session, workspace_id=user.workspace_id)
    scheduled = await reports_service.list_scheduled(session, user=user)
    volume = await _volume_series(session, workspace_id=user.workspace_id, days=30)
    return {
        "generated": [_generated_to_out(g).model_dump(mode="json") for g in generated],
        "scheduled": [_scheduled_to_dict(s) for s in scheduled],
        "volume_series": [v.model_dump() for v in volume],
    }


@router.get("/history", response_model=list[ReportsHistoryEntry])
async def list_history(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[ReportsHistoryEntry]:
    rows = await reports_service.list_scheduled(session, user=user)
    return [
        ReportsHistoryEntry(
            id=r.id,
            type=r.type,  # type: ignore[arg-type]
            frequency=r.frequency,  # type: ignore[arg-type]
            recipients=list(r.recipients or []),
            last_sent_at=r.last_sent_at,
            status="sent" if r.last_sent_at else "scheduled",
        )
        for r in rows
    ]


@router.get("/generated", response_model=list[GeneratedReportOut])
async def list_generated_reports(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[GeneratedReportOut]:
    rows = await _list_generated(session, workspace_id=user.workspace_id)
    return [_generated_to_out(r) for r in rows]


@router.get("/volume", response_model=list[ReportsVolumePoint])
async def reports_volume(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
) -> list[ReportsVolumePoint]:
    days = max(1, min(days, 365))
    return await _volume_series(session, workspace_id=user.workspace_id, days=days)


@router.post(
    "/generate",
    response_model=GeneratedReportOut,
    status_code=status.HTTP_201_CREATED,
)
async def generate_report(
    payload: GenerateReportPayload,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> GeneratedReportOut:
    if payload.from_ > payload.to:
        raise HTTPException(status_code=400, detail="from must be on or before to")

    body, content_type, filename = await reports_service.export_report(
        session,
        user=user,
        kind=payload.type,
        payload=ReportExportRequest(
            mailbox_ids=payload.mailbox_ids,
            from_=payload.from_,
            to=payload.to,
            format=payload.format,
        ),
    )

    row = GeneratedReport(
        workspace_id=user.workspace_id,
        type=payload.type,
        format=payload.format,
        range_label=f"{payload.from_.isoformat()} → {payload.to.isoformat()}",
        from_date=payload.from_,
        to_date=payload.to,
        body=body,
        content_type=content_type,
        filename=filename,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _generated_to_out(row)


@router.post("/email", status_code=status.HTTP_202_ACCEPTED)
async def email_report(
    payload: EmailReportPayload,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Generate a report and email it to the requested recipients.

    Persists the generated report row first (so the user still sees it in
    "Recently generated"), then dispatches the email with the rendered file
    attached. Returns 202 with a ``status`` describing the dispatch outcome
    (``sent`` / ``dry_run`` / ``failed``) — the call always succeeds at the
    HTTP layer so the UI gets a clean confirmation either way.
    """
    if payload.from_ > payload.to:
        raise HTTPException(status_code=400, detail="from must be on or before to")

    recipients = [r.strip() for r in (payload.recipients or []) if r and r.strip()]
    if not recipients:
        if not user.email:
            raise HTTPException(status_code=400, detail="No recipient email available")
        recipients = [user.email]

    body, content_type, filename = await reports_service.export_report(
        session,
        user=user,
        kind=payload.type,
        payload=ReportExportRequest(
            mailbox_ids=payload.mailbox_ids,
            from_=payload.from_,
            to=payload.to,
            format=payload.format,
        ),
    )

    # Persist the generation so "Recently generated" picks it up.
    row = GeneratedReport(
        workspace_id=user.workspace_id,
        type=payload.type,
        format=payload.format,
        range_label=f"{payload.from_.isoformat()} → {payload.to.isoformat()}",
        from_date=payload.from_,
        to_date=payload.to,
        body=body,
        content_type=content_type,
        filename=filename,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    pretty = payload.type.replace("_", "-").title()
    subject = f"Your WarmPulse {pretty} report — {row.range_label}"
    text_body = (
        f"Hi,\n\n"
        f"Your {pretty} report for {row.range_label} is attached.\n"
        f"You can also download it any time from the WarmPulse dashboard.\n\n"
        f"— WarmPulse"
    )

    statuses: list[str] = []
    for to_addr in recipients:
        result = await send_transactional_with_attachment(
            to=to_addr,
            subject=subject,
            body_text=text_body,
            attachment_filename=filename,
            attachment_bytes=body,
            attachment_content_type=content_type,
        )
        statuses.append(result.get("status", "unknown"))

    # Aggregate status: failed beats dry_run beats sent. We surface the worst
    # outcome so the UI can tell the user when nothing was actually delivered.
    if "failed" in statuses:
        dispatch = "failed"
    elif statuses and all(s == "sent" for s in statuses):
        dispatch = "sent"
    elif "dry_run" in statuses:
        dispatch = "dry_run"
    else:
        dispatch = statuses[0] if statuses else "unknown"

    return {
        "status": dispatch,
        "recipients": recipients,
        "report": _generated_to_out(row).model_dump(mode="json"),
    }


@router.get("/generated/{report_id}/download")
async def download_generated(
    report_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    row = await session.get(GeneratedReport, report_id)
    if row is None or row.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Report not found")
    body = row.body or b""

    async def _iter() -> Any:
        yield body

    return StreamingResponse(
        _iter(),
        media_type=row.content_type,
        headers={"Content-Disposition": f'attachment; filename="{row.filename}"'},
    )


@router.delete("/generated/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_generated(
    report_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    row = await session.get(GeneratedReport, report_id)
    if row is None or row.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Report not found")
    await session.delete(row)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/export/warmth")
async def export_warmth(
    payload: ReportExportRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    body, content_type, filename = await reports_service.export_warmth(
        session, user=user, payload=payload
    )

    async def _iter() -> AsyncIterator[bytes]:
        yield body

    return StreamingResponse(
        _iter(),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/scheduled", response_model=list[ScheduledReportOut])
async def list_scheduled(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScheduledReportOut]:
    rows = await reports_service.list_scheduled(session, user=user)
    return [ScheduledReportOut.model_validate(r) for r in rows]


@router.post(
    "/scheduled",
    response_model=ScheduledReportOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_scheduled(
    payload: ScheduledReportCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduledReportOut:
    row = await reports_service.create_scheduled(session, user=user, payload=payload)
    return ScheduledReportOut.model_validate(row)


@router.patch("/scheduled/{report_id}", response_model=ScheduledReportOut)
async def update_scheduled(
    report_id: uuid.UUID,
    payload: ScheduledReportUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ScheduledReportOut:
    row = await reports_service.update_scheduled(
        session, user=user, report_id=report_id, payload=payload
    )
    return ScheduledReportOut.model_validate(row)


@router.delete("/scheduled/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scheduled(
    report_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await reports_service.delete_scheduled(session, user=user, report_id=report_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
