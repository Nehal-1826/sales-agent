"""Audit-log viewer queries for super_admins (§5.2 item 9).

This reads only; mutations flow through the other services' ``_write_audit``
helpers. CSV export streams via a generator so huge result sets don't blow
memory.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.users import User
from app.schemas.audit import (
    ActionCount,
    AuditLogEntryOut,
    AuditLogListResponse,
    AuditStatsResponse,
    DayCount,
)


def _base_filters(
    q,
    *,
    actor_user_id: uuid.UUID | None,
    action: str | None,
    target_type: str | None,
    from_: datetime | None,
    to: datetime | None,
    ip: str | None,
    search: str | None,
):
    if actor_user_id is not None:
        q = q.where(AuditLog.actor_user_id == actor_user_id)
    if action:
        q = q.where(AuditLog.action == action)
    if target_type:
        q = q.where(AuditLog.target_type == target_type)
    if from_ is not None:
        q = q.where(AuditLog.created_at >= from_)
    if to is not None:
        q = q.where(AuditLog.created_at <= to)
    if ip:
        q = q.where(AuditLog.ip == ip)
    if search:
        like = f"%{search}%"
        q = q.where(
            or_(
                AuditLog.action.ilike(like),
                AuditLog.target_type.ilike(like),
            )
        )
    return q


async def _hydrate_actor_emails(
    session: AsyncSession, rows: list[AuditLog]
) -> dict[uuid.UUID, str]:
    ids = {r.actor_user_id for r in rows if r.actor_user_id is not None}
    if not ids:
        return {}
    res = await session.execute(select(User.id, User.email).where(User.id.in_(ids)))
    return {row[0]: row[1] for row in res.all()}


async def list_audit(
    session: AsyncSession,
    *,
    actor_user_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    from_: datetime | None = None,
    to: datetime | None = None,
    ip: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> AuditLogListResponse:
    base = select(AuditLog)
    base = _base_filters(
        base,
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        from_=from_,
        to=to,
        ip=ip,
        search=search,
    )
    count_q = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_q)).scalar_one()

    rows_q = base.order_by(AuditLog.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size)
    rows = list((await session.execute(rows_q)).scalars().all())
    email_map = await _hydrate_actor_emails(session, rows)

    items = [
        AuditLogEntryOut(
            id=r.id,
            actor_user_id=r.actor_user_id,
            actor_email=email_map.get(r.actor_user_id) if r.actor_user_id else None,
            actor_role=r.actor_role,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            payload=r.payload,
            ip=r.ip,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return AuditLogListResponse(
        items=items, page=page, page_size=page_size, total=int(total or 0)
    )


async def audit_stats(session: AsyncSession) -> AuditStatsResponse:
    by_action_q = (
        select(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
        .limit(50)
    )
    by_action_rows = (await session.execute(by_action_q)).all()
    by_action = [ActionCount(action=a, count=int(c)) for (a, c) in by_action_rows]

    # Group by date(created_at) — portable to SQLite + Postgres.
    day_expr = func.date(AuditLog.created_at)
    by_day_q = (
        select(day_expr, func.count(AuditLog.id))
        .group_by(day_expr)
        .order_by(day_expr.desc())
        .limit(60)
    )
    by_day_rows = (await session.execute(by_day_q)).all()
    by_day: list[DayCount] = []
    for d, c in by_day_rows:
        if isinstance(d, str):
            try:
                d = date.fromisoformat(d)
            except Exception:
                continue
        by_day.append(DayCount(date=d, count=int(c)))
    return AuditStatsResponse(by_action=by_action, by_day=by_day)


async def collect_csv_bytes(
    session: AsyncSession,
    *,
    actor_user_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    from_: datetime | None = None,
    to: datetime | None = None,
    ip: str | None = None,
    search: str | None = None,
) -> list[bytes]:
    """Return CSV as a list of bytes chunks (header + one per row)."""
    q = _base_filters(
        select(AuditLog),
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        from_=from_,
        to=to,
        ip=ip,
        search=search,
    ).order_by(AuditLog.created_at.desc())
    rows = list((await session.execute(q)).scalars().all())
    email_map = await _hydrate_actor_emails(session, rows)

    import json

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "timestamp",
            "actor_email",
            "actor_role",
            "action",
            "target_type",
            "target_id",
            "ip",
            "payload_json",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r.created_at.isoformat() if r.created_at else "",
                email_map.get(r.actor_user_id) if r.actor_user_id else "",
                r.actor_role or "",
                r.action,
                r.target_type or "",
                str(r.target_id) if r.target_id else "",
                r.ip or "",
                json.dumps(r.payload) if r.payload else "",
            ]
        )
    return [buf.getvalue().encode("utf-8")]
