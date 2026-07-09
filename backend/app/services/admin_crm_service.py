"""Cross-workspace admin CRM service.

Super-admin only — NO workspace filter on any query. All DB access
lives here; the route handlers are thin pass-throughs.

Rates:
  open_rate  = email_opened  / email_sent (guard /0 → 0.0)
  reply_rate = email_replied / email_sent (guard /0 → 0.0)

Pause/resume toggles CrmSequence.status:
  paused=True  → CrmSequenceStatus.paused
  paused=False → CrmSequenceStatus.active
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.crm_campaigns import CrmCampaign
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_leads import CrmLead
from app.db.models.crm_sequence_enrollments import (
    CrmEnrollmentStatus,
    CrmSequenceEnrollment,
)
from app.db.models.crm_sequences import CrmSequence, CrmSequenceStatus
from app.db.models.plans import Plan
from app.db.models.users import User
from app.schemas.admin_crm import (
    AdminCrmCampaignRow,
    AdminCrmOverview,
    AdminCrmRecentActivity,
    AdminCrmSequenceRow,
    AdminCrmWorkspaceDetail,
    AdminCrmWorkspaceRow,
    SequenceStatusOut,
)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Audit helper (SAVEPOINT pattern, same as peer_pool_service)                 #
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
# Rate helpers                                                                 #
# --------------------------------------------------------------------------- #


def _rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 4)


# --------------------------------------------------------------------------- #
# Overview                                                                     #
# --------------------------------------------------------------------------- #


async def get_overview(session: AsyncSession) -> AdminCrmOverview:
    # --- Platform totals ---
    total_campaigns = int(
        (await session.execute(select(func.count(CrmCampaign.id)))).scalar_one()
    )
    total_leads = int(
        (await session.execute(select(func.count(CrmLead.id)))).scalar_one()
    )

    # Sequence counts by status
    seq_active = int(
        (await session.execute(
            select(func.count(CrmSequence.id)).where(
                CrmSequence.status == CrmSequenceStatus.active
            )
        )).scalar_one()
    )
    seq_paused = int(
        (await session.execute(
            select(func.count(CrmSequence.id)).where(
                CrmSequence.status == CrmSequenceStatus.paused
            )
        )).scalar_one()
    )

    active_enrollments = int(
        (await session.execute(
            select(func.count(CrmSequenceEnrollment.id)).where(
                CrmSequenceEnrollment.status == CrmEnrollmentStatus.active
            )
        )).scalar_one()
    )

    # Activity counts (platform-wide)
    cutoff_30d = datetime.now(UTC) - timedelta(days=30)
    emails_sent_30d = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.kind == CrmActivityKind.email_sent,
                CrmLeadActivity.created_at >= cutoff_30d,
            )
        )).scalar_one()
    )

    sent_all = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.kind == CrmActivityKind.email_sent
            )
        )).scalar_one()
    )
    opened_all = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.kind == CrmActivityKind.email_opened
            )
        )).scalar_one()
    )
    replied_all = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.kind == CrmActivityKind.email_replied
            )
        )).scalar_one()
    )
    open_rate = _rate(opened_all, sent_all)
    reply_rate = _rate(replied_all, sent_all)

    # --- Per-workspace rows ---
    # Collect all distinct workspace_ids that appear in any CRM table.
    # Use a column reference (not func.distinct) so SQLAlchemy returns typed UUIDs.
    ws_ids_q = select(CrmCampaign.workspace_id).distinct()
    ws_ids_raw = list((await session.execute(ws_ids_q)).scalars().all())
    # SQLite returns hex strings for UUID columns; coerce to uuid.UUID.
    ws_ids: list[uuid.UUID] = [
        v if isinstance(v, uuid.UUID) else uuid.UUID(str(v))
        for v in ws_ids_raw
    ]

    workspace_rows: list[AdminCrmWorkspaceRow] = []
    for ws_id in ws_ids:
        row = await _workspace_summary(session, ws_id)
        if row is not None:
            workspace_rows.append(row)

    workspace_rows.sort(key=lambda r: r.leads, reverse=True)

    return AdminCrmOverview(
        total_campaigns=total_campaigns,
        total_leads=total_leads,
        sequences_active=seq_active,
        sequences_paused=seq_paused,
        active_enrollments=active_enrollments,
        emails_sent_30d=emails_sent_30d,
        open_rate=open_rate,
        reply_rate=reply_rate,
        workspaces=workspace_rows,
    )


# --------------------------------------------------------------------------- #
# Per-workspace summary (shared between overview rows + detail endpoint)       #
# --------------------------------------------------------------------------- #


async def _workspace_summary(
    session: AsyncSession, workspace_id: uuid.UUID
) -> AdminCrmWorkspaceRow | None:
    # Owner = first client user in the workspace.
    owner_row = (
        await session.execute(
            select(User, Plan.name)
            .outerjoin(Plan, Plan.id == User.plan_id)
            .where(User.workspace_id == workspace_id)
            .order_by(User.created_at.asc())
            .limit(1)
        )
    ).one_or_none()
    if owner_row is None:
        return None
    owner_user, plan_name = owner_row

    campaigns = int(
        (await session.execute(
            select(func.count(CrmCampaign.id)).where(
                CrmCampaign.workspace_id == workspace_id
            )
        )).scalar_one()
    )
    leads = int(
        (await session.execute(
            select(func.count(CrmLead.id)).where(
                CrmLead.workspace_id == workspace_id
            )
        )).scalar_one()
    )

    seq_active_ws = int(
        (await session.execute(
            select(func.count(CrmSequence.id)).where(
                CrmSequence.workspace_id == workspace_id,
                CrmSequence.status == CrmSequenceStatus.active,
            )
        )).scalar_one()
    )
    seq_paused_ws = int(
        (await session.execute(
            select(func.count(CrmSequence.id)).where(
                CrmSequence.workspace_id == workspace_id,
                CrmSequence.status == CrmSequenceStatus.paused,
            )
        )).scalar_one()
    )
    active_enr_ws = int(
        (await session.execute(
            select(func.count(CrmSequenceEnrollment.id)).where(
                CrmSequenceEnrollment.workspace_id == workspace_id,
                CrmSequenceEnrollment.status == CrmEnrollmentStatus.active,
            )
        )).scalar_one()
    )

    sent_ws = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.workspace_id == workspace_id,
                CrmLeadActivity.kind == CrmActivityKind.email_sent,
            )
        )).scalar_one()
    )
    opened_ws = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.workspace_id == workspace_id,
                CrmLeadActivity.kind == CrmActivityKind.email_opened,
            )
        )).scalar_one()
    )
    replied_ws = int(
        (await session.execute(
            select(func.count(CrmLeadActivity.id)).where(
                CrmLeadActivity.workspace_id == workspace_id,
                CrmLeadActivity.kind == CrmActivityKind.email_replied,
            )
        )).scalar_one()
    )

    last_act: datetime | None = (
        await session.execute(
            select(func.max(CrmLeadActivity.created_at)).where(
                CrmLeadActivity.workspace_id == workspace_id
            )
        )
    ).scalar_one()

    label = owner_user.display_name or owner_user.email

    return AdminCrmWorkspaceRow(
        workspace_id=workspace_id,
        name=label,
        plan=plan_name,
        owner_email=owner_user.email,
        campaigns=campaigns,
        leads=leads,
        sequences_active=seq_active_ws,
        sequences_paused=seq_paused_ws,
        active_enrollments=active_enr_ws,
        open_rate=_rate(opened_ws, sent_ws),
        reply_rate=_rate(replied_ws, sent_ws),
        last_activity_at=last_act,
    )


# --------------------------------------------------------------------------- #
# Workspace detail                                                             #
# --------------------------------------------------------------------------- #


async def get_workspace_detail(
    session: AsyncSession, workspace_id: uuid.UUID
) -> AdminCrmWorkspaceDetail | None:
    summary = await _workspace_summary(session, workspace_id)
    if summary is None:
        return None

    # Campaigns with lead counts
    campaign_rows = list(
        (await session.execute(
            select(CrmCampaign).where(CrmCampaign.workspace_id == workspace_id)
                .order_by(CrmCampaign.created_at.desc())
        )).scalars().all()
    )
    campaign_list: list[AdminCrmCampaignRow] = []
    for c in campaign_rows:
        lc = int(
            (await session.execute(
                select(func.count(CrmLead.id)).where(CrmLead.campaign_id == c.id)
            )).scalar_one()
        )
        campaign_list.append(
            AdminCrmCampaignRow(
                id=c.id,
                name=c.name,
                leads=lc,
                status=c.status.value if hasattr(c.status, "value") else str(c.status),
            )
        )

    # Sequences with enrollment + rate info
    sequence_rows = list(
        (await session.execute(
            select(CrmSequence).where(CrmSequence.workspace_id == workspace_id)
                .order_by(CrmSequence.created_at.desc())
        )).scalars().all()
    )
    sequence_list: list[AdminCrmSequenceRow] = []
    for seq in sequence_rows:
        enr_count = int(
            (await session.execute(
                select(func.count(CrmSequenceEnrollment.id)).where(
                    CrmSequenceEnrollment.sequence_id == seq.id,
                    CrmSequenceEnrollment.status == CrmEnrollmentStatus.active,
                )
            )).scalar_one()
        )
        # Activities linked to leads enrolled in this sequence
        seq_sent = int(
            (await session.execute(
                select(func.count(CrmLeadActivity.id))
                .join(CrmSequenceEnrollment, CrmSequenceEnrollment.lead_id == CrmLeadActivity.lead_id)
                .where(
                    CrmSequenceEnrollment.sequence_id == seq.id,
                    CrmLeadActivity.kind == CrmActivityKind.email_sent,
                )
            )).scalar_one()
        )
        seq_opened = int(
            (await session.execute(
                select(func.count(CrmLeadActivity.id))
                .join(CrmSequenceEnrollment, CrmSequenceEnrollment.lead_id == CrmLeadActivity.lead_id)
                .where(
                    CrmSequenceEnrollment.sequence_id == seq.id,
                    CrmLeadActivity.kind == CrmActivityKind.email_opened,
                )
            )).scalar_one()
        )
        seq_replied = int(
            (await session.execute(
                select(func.count(CrmLeadActivity.id))
                .join(CrmSequenceEnrollment, CrmSequenceEnrollment.lead_id == CrmLeadActivity.lead_id)
                .where(
                    CrmSequenceEnrollment.sequence_id == seq.id,
                    CrmLeadActivity.kind == CrmActivityKind.email_replied,
                )
            )).scalar_one()
        )
        seq_status = seq.status.value if hasattr(seq.status, "value") else str(seq.status)
        sequence_list.append(
            AdminCrmSequenceRow(
                id=seq.id,
                name=seq.name,
                status=seq_status,
                paused=(seq_status == "paused"),
                enrolled=enr_count,
                open_rate=_rate(seq_opened, seq_sent),
                reply_rate=_rate(seq_replied, seq_sent),
            )
        )

    # Recent activities (last 20)
    act_rows = list(
        (await session.execute(
            select(CrmLeadActivity, CrmLead)
            .join(CrmLead, CrmLead.id == CrmLeadActivity.lead_id)
            .where(CrmLeadActivity.workspace_id == workspace_id)
            .order_by(CrmLeadActivity.created_at.desc())
            .limit(20)
        )).all()
    )
    recent_activities: list[AdminCrmRecentActivity] = [
        AdminCrmRecentActivity(
            kind=act.kind.value if hasattr(act.kind, "value") else str(act.kind),
            lead_label=lead.name or lead.email,
            at=act.created_at,
        )
        for act, lead in act_rows
    ]

    return AdminCrmWorkspaceDetail(
        workspace_id=summary.workspace_id,
        name=summary.name,
        plan=summary.plan,
        owner_email=summary.owner_email,
        campaigns=summary.campaigns,
        leads=summary.leads,
        sequences_active=summary.sequences_active,
        sequences_paused=summary.sequences_paused,
        active_enrollments=summary.active_enrollments,
        open_rate=summary.open_rate,
        reply_rate=summary.reply_rate,
        last_activity_at=summary.last_activity_at,
        campaign_list=campaign_list,
        sequence_list=sequence_list,
        recent_activities=recent_activities,
    )


# --------------------------------------------------------------------------- #
# Sequence status toggle                                                       #
# --------------------------------------------------------------------------- #


async def set_sequence_status(
    session: AsyncSession,
    *,
    sequence_id: uuid.UUID,
    paused: bool,
    actor: User,
) -> CrmSequence:
    seq = await session.get(CrmSequence, sequence_id)
    if seq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sequence not found",
        )

    new_status = CrmSequenceStatus.paused if paused else CrmSequenceStatus.active
    old_status = seq.status.value if hasattr(seq.status, "value") else str(seq.status)
    seq.status = new_status
    await session.flush()

    await _write_audit(
        session,
        action="admin_crm.sequence_status_changed",
        actor=actor,
        target_type="crm_sequence",
        target_id=sequence_id,
        payload={
            "sequence_id": str(sequence_id),
            "old_status": old_status,
            "new_status": new_status.value,
        },
    )
    await session.commit()
    await session.refresh(seq)
    return seq
