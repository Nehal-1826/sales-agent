"""Business logic for CRM email-sequence automation.

A *sequence* is an ordered set of follow-up steps attached to a campaign. Leads
are *enrolled*, and the beat-scheduled tick (:func:`process_due_enrollments`)
walks each active enrollment through its steps, "sending" the due step. The
auditable record of a send is a ``CrmLeadActivity(kind=email_sent)`` row plus a
``last_activity_at`` bump on the lead — exactly the bookkeeping
:mod:`app.services.crm_service` does for every other lead touch.

Layering / conventions mirror :mod:`app.services.crm_service`:
  * every workspace-owned row is filtered on ``workspace_id``; a sequence /
    step / enrollment that belongs to another workspace 404s.
  * mutations write a savepointed ``audit_logs`` row via :func:`_write_audit`
    so a logging failure can never poison the surrounding transaction.

:func:`process_due_enrollments` is the only system-wide entry point — it scans
across *all* workspaces (the scheduler is not request-scoped) and is the single
place ``next_send_at`` advances.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.audit_logs import AuditLog
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_leads import CrmLead
from app.db.models.crm_sequence_enrollments import (
    CrmEnrollmentStatus,
    CrmSequenceEnrollment,
)
from app.db.models.crm_sequence_steps import CrmSequenceStep
from app.db.models.crm_sequences import CrmSequence, CrmSequenceStatus
from app.db.models.users import User
from app.schemas.crm import (
    EnrollmentOut,
    EnrollResult,
    SequenceCreate,
    SequenceOut,
    SequenceStepCreate,
    SequenceStepOut,
    SequenceStepUpdate,
    SequenceTickResult,
    SequenceUpdate,
)

logger = logging.getLogger(__name__)

# Upper bound on enrollments processed in a single :func:`process_due_enrollments`
# tick. The beat job runs system-wide every 5 min and each real send can take
# ~20s of SMTP I/O, so an unbounded batch could overrun the interval. When a tick
# selects exactly this many it logs that the batch was truncated; the remainder
# (still due) is picked up by the next tick — never silently dropped.
MAX_ENROLLMENTS_PER_TICK = 250


class _Recipient:
    """Minimal ``peer``-shaped object for :func:`smtp_sender.send_email`.

    The sender only reads ``.email_address`` off its ``peer`` argument (to set
    the ``To`` header); CRM leads aren't peer inboxes, so we adapt the lead's
    email into the shape the sender expects without dragging in the peer model.
    """

    __slots__ = ("email_address",)

    def __init__(self, email_address: str) -> None:
        self.email_address = email_address


# --------------------------------------------------------------------------- #
# Audit helper (savepointed best-effort) — same shape as crm_service           #
# --------------------------------------------------------------------------- #


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
    except Exception as exc:  # pragma: no cover — audit failures never 500
        logger.warning("audit write failed action=%s: %s", action, exc)


def _actor_role(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _enum_value(raw: Any) -> str:
    return raw.value if hasattr(raw, "value") else str(raw)


# --------------------------------------------------------------------------- #
# Lookups (workspace-scoped, 404 on miss)                                      #
# --------------------------------------------------------------------------- #


async def _get_campaign_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, campaign_id: uuid.UUID
) -> None:
    """404 the campaign if it isn't in this workspace (never leak a guess)."""
    from app.db.models.crm_campaigns import CrmCampaign

    exists = (
        await session.execute(
            select(CrmCampaign.id).where(
                CrmCampaign.id == campaign_id,
                CrmCampaign.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(status_code=404, detail="Campaign not found")


async def _get_sequence_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, sequence_id: uuid.UUID
) -> CrmSequence:
    seq = (
        await session.execute(
            select(CrmSequence).where(
                CrmSequence.id == sequence_id,
                CrmSequence.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if seq is None:
        raise HTTPException(status_code=404, detail="Sequence not found")
    return seq


async def _get_step_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, step_id: uuid.UUID
) -> CrmSequenceStep:
    step = (
        await session.execute(
            select(CrmSequenceStep).where(
                CrmSequenceStep.id == step_id,
                CrmSequenceStep.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if step is None:
        raise HTTPException(status_code=404, detail="Sequence step not found")
    return step


async def _get_enrollment_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, enrollment_id: uuid.UUID
) -> CrmSequenceEnrollment:
    enr = (
        await session.execute(
            select(CrmSequenceEnrollment).where(
                CrmSequenceEnrollment.id == enrollment_id,
                CrmSequenceEnrollment.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if enr is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return enr


# --------------------------------------------------------------------------- #
# Projections                                                                  #
# --------------------------------------------------------------------------- #


async def _sequence_to_out(
    session: AsyncSession, sequence: CrmSequence
) -> SequenceOut:
    step_count = int(
        (
            await session.execute(
                select(func.count(CrmSequenceStep.id)).where(
                    CrmSequenceStep.sequence_id == sequence.id
                )
            )
        ).scalar_one()
    )
    active_enrollments = int(
        (
            await session.execute(
                select(func.count(CrmSequenceEnrollment.id)).where(
                    CrmSequenceEnrollment.sequence_id == sequence.id,
                    CrmSequenceEnrollment.status == CrmEnrollmentStatus.active,
                )
            )
        ).scalar_one()
    )
    return SequenceOut(
        id=sequence.id,
        campaign_id=sequence.campaign_id,
        name=sequence.name,
        status=_enum_value(sequence.status),
        step_count=step_count,
        active_enrollments=active_enrollments,
        created_at=sequence.created_at,
        updated_at=sequence.updated_at,
    )


def _step_to_out(step: CrmSequenceStep) -> SequenceStepOut:
    return SequenceStepOut(
        id=step.id,
        sequence_id=step.sequence_id,
        step_order=step.step_order,
        delay_days=step.delay_days,
        subject=step.subject,
        body=step.body,
        content_mode=getattr(step, "content_mode", "text") or "text",
        ai_prompt=getattr(step, "ai_prompt", None),
    )


def _enrollment_to_out(
    enrollment: CrmSequenceEnrollment, lead: CrmLead
) -> EnrollmentOut:
    return EnrollmentOut(
        id=enrollment.id,
        sequence_id=enrollment.sequence_id,
        lead_id=enrollment.lead_id,
        lead_name=lead.name,
        lead_email=lead.email,
        current_step=enrollment.current_step,
        status=_enum_value(enrollment.status),
        next_send_at=enrollment.next_send_at,
        enrolled_at=enrollment.enrolled_at,
        completed_at=enrollment.completed_at,
    )


# --------------------------------------------------------------------------- #
# Sequences                                                                    #
# --------------------------------------------------------------------------- #


async def list_sequences(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    campaign_id: uuid.UUID | None = None,
) -> list[SequenceOut]:
    stmt = select(CrmSequence).where(CrmSequence.workspace_id == workspace_id)
    if campaign_id is not None:
        stmt = stmt.where(CrmSequence.campaign_id == campaign_id)
    stmt = stmt.order_by(CrmSequence.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [await _sequence_to_out(session, s) for s in rows]


async def get_sequence(
    session: AsyncSession, *, workspace_id: uuid.UUID, sequence_id: uuid.UUID
) -> SequenceOut:
    seq = await _get_sequence_or_404(
        session, workspace_id=workspace_id, sequence_id=sequence_id
    )
    return await _sequence_to_out(session, seq)


async def create_sequence(
    session: AsyncSession, *, user: User, payload: SequenceCreate
) -> SequenceOut:
    # Campaign must belong to the caller's workspace.
    await _get_campaign_or_404(
        session, workspace_id=user.workspace_id, campaign_id=payload.campaign_id
    )
    seq = CrmSequence(
        workspace_id=user.workspace_id,
        campaign_id=payload.campaign_id,
        name=payload.name,
        status=CrmSequenceStatus.active,
    )
    session.add(seq)
    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_created",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=seq.id,
        payload={"campaign_id": str(seq.campaign_id), "name": seq.name},
    )
    await session.commit()
    await session.refresh(seq)
    return await _sequence_to_out(session, seq)


async def update_sequence(
    session: AsyncSession,
    *,
    user: User,
    sequence_id: uuid.UUID,
    payload: SequenceUpdate,
) -> SequenceOut:
    seq = await _get_sequence_or_404(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        seq.name = data["name"]
    if "status" in data and data["status"] is not None:
        seq.status = CrmSequenceStatus(_enum_value(data["status"]))

    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_updated",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=seq.id,
        payload={"fields": sorted(data.keys())},
    )
    await session.commit()
    await session.refresh(seq)
    return await _sequence_to_out(session, seq)


async def delete_sequence(
    session: AsyncSession, *, user: User, sequence_id: uuid.UUID
) -> None:
    seq = await _get_sequence_or_404(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )
    seq_id_copy = seq.id
    name_copy = seq.name
    # Steps + enrollments cascade via FK ondelete=CASCADE.
    await session.delete(seq)
    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_deleted",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=seq_id_copy,
        payload={"name": name_copy},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Steps                                                                        #
# --------------------------------------------------------------------------- #


async def list_steps(
    session: AsyncSession, *, workspace_id: uuid.UUID, sequence_id: uuid.UUID
) -> list[SequenceStepOut]:
    # 404 the sequence if it isn't in this workspace.
    await _get_sequence_or_404(
        session, workspace_id=workspace_id, sequence_id=sequence_id
    )
    rows = (
        await session.execute(
            select(CrmSequenceStep)
            .where(CrmSequenceStep.sequence_id == sequence_id)
            .order_by(CrmSequenceStep.step_order.asc())
        )
    ).scalars().all()
    return [_step_to_out(s) for s in rows]


async def add_step(
    session: AsyncSession,
    *,
    user: User,
    sequence_id: uuid.UUID,
    payload: SequenceStepCreate,
) -> SequenceStepOut:
    await _get_sequence_or_404(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )
    order = payload.step_order
    if order is None:
        current_max = (
            await session.execute(
                select(func.max(CrmSequenceStep.step_order)).where(
                    CrmSequenceStep.sequence_id == sequence_id
                )
            )
        ).scalar_one()
        order = 0 if current_max is None else int(current_max) + 1

    step = CrmSequenceStep(
        workspace_id=user.workspace_id,
        sequence_id=sequence_id,
        step_order=order,
        delay_days=payload.delay_days,
        subject=payload.subject,
        body=payload.body,
        content_mode=_enum_value(payload.content_mode),
        ai_prompt=payload.ai_prompt,
    )
    session.add(step)
    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_step_added",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=sequence_id,
        payload={"step_order": order},
    )
    await session.commit()
    await session.refresh(step)
    return _step_to_out(step)


async def update_step(
    session: AsyncSession,
    *,
    user: User,
    step_id: uuid.UUID,
    payload: SequenceStepUpdate,
) -> SequenceStepOut:
    step = await _get_step_or_404(
        session, workspace_id=user.workspace_id, step_id=step_id
    )
    data = payload.model_dump(exclude_unset=True)
    for field in ("delay_days", "subject", "body", "step_order"):
        if field in data and data[field] is not None:
            setattr(step, field, data[field])
    if "content_mode" in data and data["content_mode"] is not None:
        step.content_mode = _enum_value(data["content_mode"])
    # ai_prompt may be explicitly cleared (set to None) — allow that.
    if "ai_prompt" in data:
        step.ai_prompt = data["ai_prompt"]
    await session.flush()
    await session.commit()
    await session.refresh(step)
    return _step_to_out(step)


async def delete_step(
    session: AsyncSession, *, user: User, step_id: uuid.UUID
) -> None:
    step = await _get_step_or_404(
        session, workspace_id=user.workspace_id, step_id=step_id
    )
    sequence_id = step.sequence_id
    removed_order = step.step_order
    await session.delete(step)
    await session.flush()

    # Re-normalise step_order so the remaining steps stay 0..N-1 contiguous —
    # the scheduler indexes steps positionally via current_step.
    remaining = (
        await session.execute(
            select(CrmSequenceStep)
            .where(CrmSequenceStep.sequence_id == sequence_id)
            .order_by(CrmSequenceStep.step_order.asc())
        )
    ).scalars().all()
    for new_order, s in enumerate(remaining):
        if s.step_order != new_order:
            s.step_order = new_order

    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_step_deleted",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=sequence_id,
        payload={"step_order": removed_order},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Enrollments                                                                  #
# --------------------------------------------------------------------------- #


async def _ordered_steps(
    session: AsyncSession, sequence_id: uuid.UUID
) -> list[CrmSequenceStep]:
    return list(
        (
            await session.execute(
                select(CrmSequenceStep)
                .where(CrmSequenceStep.sequence_id == sequence_id)
                .order_by(CrmSequenceStep.step_order.asc())
            )
        ).scalars().all()
    )


async def enroll_leads(
    session: AsyncSession,
    *,
    user: User,
    sequence_id: uuid.UUID,
    lead_ids: list[uuid.UUID],
) -> EnrollResult:
    """Enroll leads into a sequence.

    A lead already *actively* enrolled in this sequence is skipped (re-enroll is
    only allowed once a prior enrollment is stopped/completed). ``next_send_at``
    is ``now + step0.delay_days``; if the sequence has no steps yet the
    enrollment is created with ``next_send_at = NULL`` (nothing to send — the
    scheduler simply never picks it up until steps are added and it is
    re-enrolled / the step list grows).
    """
    seq = await _get_sequence_or_404(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )
    now = datetime.now(UTC)
    steps = await _ordered_steps(session, seq.id)
    first_delay = steps[0].delay_days if steps else None

    # Lead IDs already actively enrolled in this sequence.
    already = set(
        (
            await session.execute(
                select(CrmSequenceEnrollment.lead_id).where(
                    CrmSequenceEnrollment.sequence_id == seq.id,
                    CrmSequenceEnrollment.status == CrmEnrollmentStatus.active,
                )
            )
        ).scalars().all()
    )

    enrolled = 0
    skipped = 0
    seen: set[uuid.UUID] = set()
    for lead_id in lead_ids:
        if lead_id in already or lead_id in seen:
            skipped += 1
            continue
        seen.add(lead_id)

        # Lead must exist in this workspace; otherwise skip (don't 404 the batch).
        lead = (
            await session.execute(
                select(CrmLead).where(
                    CrmLead.id == lead_id,
                    CrmLead.workspace_id == user.workspace_id,
                )
            )
        ).scalar_one_or_none()
        if lead is None:
            skipped += 1
            continue

        next_send_at = (
            None if first_delay is None else now + timedelta(days=first_delay)
        )

        session.add(
            CrmSequenceEnrollment(
                workspace_id=user.workspace_id,
                sequence_id=seq.id,
                lead_id=lead_id,
                current_step=0,
                status=CrmEnrollmentStatus.active,
                next_send_at=next_send_at,
            )
        )
        enrolled += 1

    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_leads_enrolled",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=seq.id,
        payload={"enrolled": enrolled, "skipped": skipped},
    )
    await session.commit()
    return EnrollResult(enrolled=enrolled, skipped=skipped)


async def list_enrollments(
    session: AsyncSession, *, workspace_id: uuid.UUID, sequence_id: uuid.UUID
) -> list[EnrollmentOut]:
    await _get_sequence_or_404(
        session, workspace_id=workspace_id, sequence_id=sequence_id
    )
    rows = (
        await session.execute(
            select(CrmSequenceEnrollment, CrmLead)
            .join(CrmLead, CrmLead.id == CrmSequenceEnrollment.lead_id)
            .where(CrmSequenceEnrollment.sequence_id == sequence_id)
            .order_by(CrmSequenceEnrollment.enrolled_at.desc())
        )
    ).all()
    return [_enrollment_to_out(enr, lead) for enr, lead in rows]


async def stop_enrollment(
    session: AsyncSession, *, user: User, enrollment_id: uuid.UUID
) -> None:
    enr = await _get_enrollment_or_404(
        session, workspace_id=user.workspace_id, enrollment_id=enrollment_id
    )
    enr.status = CrmEnrollmentStatus.stopped
    enr.next_send_at = None
    await session.flush()
    await _write_audit(
        session,
        action="crm.sequence_enrollment_stopped",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_sequence",
        target_id=enr.sequence_id,
        payload={"enrollment_id": str(enr.id)},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# THE SCHEDULER CORE (system-wide, all workspaces)                             #
# --------------------------------------------------------------------------- #


async def process_due_enrollments(
    session: AsyncSession, now: datetime
) -> SequenceTickResult:
    """Walk every due, active enrollment one step forward. System-wide.

    Selects active enrollments whose ``next_send_at`` is set and ``<= now`` and
    whose parent sequence is itself ``active`` (paused/archived sequences halt
    all their enrollments without losing position).

    **Idempotency invariant**: once an enrollment's due step has been processed
    it can never be re-selected and re-sent on a later tick — even if the worker
    crashes mid-batch. We guarantee this by committing the *step-advance* before
    attempting the (external, non-transactional) SMTP send: the row stops being
    "due" the instant we advance it, so a crash after the advance commit but
    before the send is at worst one missed send (acceptable), never a duplicate
    blast to a real prospect. Processing is therefore committed **per enrollment**
    (not once per batch): one bad send / commit can't strand the rest, and a
    half-processed batch leaves no due rows behind to be re-sent.

    For each due enrollment:

    1. Load the step at index ``current_step``. If that index is out of range
       (no such step) → the enrollment has run off the end: mark it completed
       (``completed_at = now``, ``next_send_at = NULL``), commit, and move on.
    2. **Advance first, then commit.** ``current_step += 1``; if a next step
       exists → ``next_send_at = now + next_step.delay_days`` and stay
       ``active``, else → ``status = completed``, ``completed_at = now``,
       ``next_send_at = NULL``. Commit so the enrollment is durably no longer
       due before any external send happens.
    3. Send the step, then append a ``CrmLeadActivity(kind=email_sent)`` row and
       bump the lead's ``last_activity_at`` to ``now`` (the activity row is the
       auditable record of the send), and commit that. Dispatch is resolved per
       workspace:

       * ``settings.mailbox_probes_dummy`` → an explicit prod/dev opt-out of any
         real dispatch; we skip the SMTP call and just log the activity. (Tests
         do **not** use this branch — they exercise the real path with a
         monkeypatched ``send_email``.)
       * no SMTP-capable sending mailbox in the workspace → no real send; log
         the activity (body notes the missing mailbox), so enrollments never get
         stuck behind a missing / OAuth-only connection.
       * otherwise → attempt :func:`app.services.warmup.smtp_sender.send_email`
         from the workspace's sending mailbox to ``lead.email``. The send is
         wrapped in try/except: a failure is logged + noted on the activity but
         **never** propagates out of the loop (one bad send must not halt the
         tick). The enrollment was already advanced + committed in (2), so the
         outcome of the send never affects whether it is re-selected.

    The batch is capped at :data:`MAX_ENROLLMENTS_PER_TICK`; if a tick selects
    exactly that many it logs that the batch was truncated and the remaining due
    enrollments are picked up by the next tick.

    Steps are loaded once per sequence and cached for the batch so a sequence
    shared by many due enrollments only hits the DB once. ``now`` is passed in
    (never read from the wall clock here) so the tick is deterministic and
    testable.
    """
    processed = 0
    advanced = 0
    completed = 0

    due_enrollments = (
        await session.execute(
            select(CrmSequenceEnrollment)
            .join(
                CrmSequence,
                CrmSequence.id == CrmSequenceEnrollment.sequence_id,
            )
            .where(
                CrmSequenceEnrollment.status == CrmEnrollmentStatus.active,
                CrmSequenceEnrollment.next_send_at.is_not(None),
                CrmSequenceEnrollment.next_send_at <= now,
                CrmSequence.status == CrmSequenceStatus.active,
            )
            .order_by(CrmSequenceEnrollment.next_send_at.asc())
            .limit(MAX_ENROLLMENTS_PER_TICK)
        )
    ).scalars().all()

    if len(due_enrollments) == MAX_ENROLLMENTS_PER_TICK:
        logger.info(
            "crm sequence tick truncated at MAX_ENROLLMENTS_PER_TICK=%s; "
            "remaining due enrollments will be picked up next tick",
            MAX_ENROLLMENTS_PER_TICK,
        )

    # Cache the ordered step list per sequence — many enrollments can share one.
    steps_cache: dict[uuid.UUID, list[CrmSequenceStep]] = {}

    async def _steps_for(sequence_id: uuid.UUID) -> list[CrmSequenceStep]:
        cached = steps_cache.get(sequence_id)
        if cached is None:
            cached = await _ordered_steps(session, sequence_id)
            steps_cache[sequence_id] = cached
        return cached

    # Cache the resolved sending mailbox per workspace — the first active,
    # non-paused mailbox that can actually SMTP-send (an OAuth/Gmail mailbox has
    # no ``smtp_password_encrypted`` and would make ``send_email`` raise, so we
    # filter those out here rather than discovering it per-send). ``None`` is
    # cached for "looked up, none qualifies" so a workspace without an
    # SMTP-capable mailbox isn't re-queried for every enrollment.
    from app.db.models.mailboxes import Mailbox, WarmupStatus

    mailbox_cache: dict[uuid.UUID, Mailbox | None] = {}

    async def _sending_mailbox_for(workspace_id: uuid.UUID) -> Mailbox | None:
        if workspace_id not in mailbox_cache:
            mailbox_cache[workspace_id] = (
                await session.execute(
                    select(Mailbox)
                    .where(
                        Mailbox.workspace_id == workspace_id,
                        Mailbox.warmup_status == WarmupStatus.active,
                        Mailbox.is_paused.is_(False),
                        Mailbox.smtp_password_encrypted.is_not(None),
                    )
                    .order_by(Mailbox.created_at.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        return mailbox_cache[workspace_id]

    # Dummy mode is an explicit prod/dev opt-out of any real dispatch (the
    # MAILBOX_PROBES_DUMMY setting, default False). Resolved once. Tests do NOT
    # rely on this branch — they monkeypatch send_email and exercise the real
    # path below.
    dummy_mode = get_settings().mailbox_probes_dummy

    for enr in due_enrollments:
        steps = await _steps_for(enr.sequence_id)

        # (1) current_step out of range → enrollment is done. Commit the
        # completion on its own so a later failure can't revive it.
        if enr.current_step >= len(steps):
            enr.status = CrmEnrollmentStatus.completed
            enr.completed_at = now
            enr.next_send_at = None
            await session.commit()
            processed += 1
            completed += 1
            continue

        step = steps[enr.current_step]
        step_number = enr.current_step + 1  # human-friendly 1-based for the log
        # Capture identifiers before the commit so the post-commit send/log path
        # never depends on the ORM identity map (it would otherwise lazy-load on
        # a session configured with expire_on_commit=True — illegal under async).
        enr_id = enr.id
        enr_lead_id = enr.lead_id
        enr_workspace_id = enr.workspace_id

        # (2) Advance FIRST, then commit — before any external send. This is the
        # idempotency guard: the row stops matching the "due" query the instant
        # we advance + commit it, so even if the worker dies before or during
        # the send below, the next tick will not re-select and re-send this
        # step. A
        # crash here is at worst one missed send, never a duplicate.
        enr.current_step += 1
        if enr.current_step < len(steps):
            next_step = steps[enr.current_step]
            enr.next_send_at = now + timedelta(days=next_step.delay_days)
            did_complete = False
        else:
            enr.status = CrmEnrollmentStatus.completed
            enr.completed_at = now
            enr.next_send_at = None
            did_complete = True
        await session.commit()

        if did_complete:
            completed += 1
        else:
            advanced += 1
        processed += 1

        # (3) Now attempt the send and write the durable activity record + bump
        # last_activity, committed separately. Dispatch is resolved per
        # workspace; the send is never allowed to raise out of the loop. Because
        # the advance in (2) is already committed, the send outcome can't affect
        # whether the enrollment is re-selected.
        lead = await session.get(CrmLead, enr_lead_id)
        if lead is None:
            continue

        # Resolve the sending mailbox up front so personalization can fill
        # {{sender_name}} from it (dummy mode has no real mailbox).
        mailbox = (
            None if dummy_mode else await _sending_mailbox_for(enr_workspace_id)
        )

        # Personalize subject per-lead for the activity label. The body is
        # resolved per content_mode at send time below.
        from app.services import crm_template_service

        mode = getattr(step, "content_mode", "text") or "text"
        subject = crm_template_service.render_personalization(
            step.subject, lead=lead, mailbox=mailbox
        )

        body = f"Sequence step {step_number}: {subject}"

        if dummy_mode:
            # Explicit opt-out (MAILBOX_PROBES_DUMMY): skip the real SMTP call,
            # just record the activity.
            pass
        elif mailbox is None:
            # No SMTP-capable mailbox → don't get stuck; just log the
            # activity (the enrollment already advanced in (2)).
            body = f"{body} (queued — no sending mailbox connected)"
        else:
            # Real outbound send. Wrap everything: one bad send must not
            # stop the tick. The enrollment already advanced regardless.
            #
            # The send is HTML with an open-tracking pixel and carries a
            # deterministic Message-Id keyed to (enrollment, step) so the
            # open-pixel route and the reply-scan can attribute opens and
            # replies back to this exact lead/step — that's what makes
            # open_rate / reply_rate auto-populate in campaign analytics.
            try:
                from app.services import crm_tracking
                from app.services.crypto import get_fernet_service
                from app.services.warmup import smtp_sender

                token = crm_tracking.make_open_token(
                    enr_lead_id, enr_id, step_number
                )
                pixel_url = crm_tracking.open_pixel_url(token)
                message_id = crm_tracking.sequence_message_id(enr_id, step_number)

                # Resolve the message per content_mode.
                if mode == "ai":
                    # Gemini writes a fresh email for this lead. On any miss we
                    # fall back to the stored subject/body (rendered as text) so
                    # the lead is never skipped.
                    from app.services import crm_ai_service

                    variables = crm_template_service.build_variables(
                        lead=lead, mailbox=mailbox
                    )
                    gen = await crm_ai_service.generate_email(
                        prompt=(step.ai_prompt or step.subject or step.body),
                        variables=variables,
                        settings=get_settings(),
                        session=session,
                    )
                    if gen is not None:
                        subject = gen.subject
                        send_html = crm_tracking.build_tracked_html(
                            gen.body, pixel_url
                        )
                        body = f"Sequence step {step_number}: {subject} (AI)"
                        if gen.usage is not None:
                            try:
                                from app.services.llm.usage_tracker import (
                                    record_usage,
                                )

                                await record_usage(
                                    session,
                                    user_id=mailbox.user_id,
                                    mailbox_id=mailbox.id,
                                    mode="crm_ai",
                                    usage=gen.usage,
                                    settings=get_settings(),
                                )
                            except Exception:  # noqa: BLE001
                                pass
                    else:
                        rendered = crm_template_service.render_personalization(
                            step.body, lead=lead, mailbox=mailbox
                        )
                        send_html = crm_tracking.build_tracked_html(
                            rendered, pixel_url
                        )
                        body = f"{body} (AI unavailable — sent fallback copy)"
                elif mode == "html":
                    # Designer HTML: fill {{vars}} into the HTML and inject the
                    # pixel without escaping so it renders as designed.
                    rendered = crm_template_service.render_personalization(
                        step.body, lead=lead, mailbox=mailbox
                    )
                    send_html = crm_tracking.inject_open_pixel(rendered, pixel_url)
                    body = f"Sequence step {step_number}: {subject} (HTML)"
                else:  # text
                    rendered = crm_template_service.render_personalization(
                        step.body, lead=lead, mailbox=mailbox
                    )
                    send_html = crm_tracking.build_tracked_html(rendered, pixel_url)

                await smtp_sender.send_email(
                    mailbox=mailbox,
                    peer=_Recipient(lead.email),
                    subject=subject,
                    body=send_html,
                    is_html=True,
                    fernet=get_fernet_service(),
                    custom_message_id=message_id,
                )
            except Exception as exc:  # noqa: BLE001 — never break the loop
                logger.warning(
                    "crm sequence send failed enrollment=%s lead=%s "
                    "step=%s: %s",
                    enr_id,
                    enr_lead_id,
                    step_number,
                    exc,
                )
                body = f"{body} (send failed: {exc})"

        session.add(
            CrmLeadActivity(
                workspace_id=enr_workspace_id,
                lead_id=enr_lead_id,
                kind=CrmActivityKind.email_sent,
                body=body,
                actor_email=None,
            )
        )
        lead.last_activity_at = now
        await session.commit()

    return SequenceTickResult(
        processed=processed, advanced=advanced, completed=completed
    )


# --------------------------------------------------------------------------- #
# System-level auto-outreach (no user / no audit) — used by auto-import        #
# --------------------------------------------------------------------------- #

DEFAULT_AUTO_SEQUENCE_NAME = "Auto Outreach"


async def ensure_default_sequence(
    session: AsyncSession, *, workspace_id: uuid.UUID, campaign_id: uuid.UUID
) -> uuid.UUID:
    """Return the id of the workspace's auto-outreach sequence for ``campaign_id``.

    Creates it (and seeds it from the first built-in templates — Intro →
    Follow-up → Break-up, with their default delays) the first time. Idempotent:
    once it exists we reuse it, so the user can freely edit/pause it. System
    action — no audit row, no user. Commits.
    """
    from app.services import crm_template_service

    existing = (
        await session.execute(
            select(CrmSequence).where(
                CrmSequence.workspace_id == workspace_id,
                CrmSequence.campaign_id == campaign_id,
                CrmSequence.name == DEFAULT_AUTO_SEQUENCE_NAME,
                CrmSequence.status != CrmSequenceStatus.archived,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing.id

    seq = CrmSequence(
        workspace_id=workspace_id,
        campaign_id=campaign_id,
        name=DEFAULT_AUTO_SEQUENCE_NAME,
        status=CrmSequenceStatus.active,
    )
    session.add(seq)
    await session.flush()

    for order, (builtin_id, delay_days) in enumerate(
        crm_template_service.DEFAULT_SEQUENCE_STEPS
    ):
        tpl = crm_template_service.builtin_by_id(builtin_id)
        if tpl is None:
            continue
        session.add(
            CrmSequenceStep(
                workspace_id=workspace_id,
                sequence_id=seq.id,
                step_order=order,
                delay_days=delay_days,
                subject=tpl["subject"],
                body=tpl["body"],
            )
        )
    await session.commit()
    return seq.id


async def system_enroll_leads(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    sequence_id: uuid.UUID,
    lead_ids: list[uuid.UUID],
) -> int:
    """Enroll leads into a sequence as a system action (no user / no audit).

    Mirrors :func:`enroll_leads`: leads already actively enrolled are skipped;
    ``next_send_at`` is ``now + step0.delay_days`` (NULL if the sequence somehow
    has no steps). Returns the number newly enrolled. Commits.
    """
    if not lead_ids:
        return 0

    steps = await _ordered_steps(session, sequence_id)
    first_delay = steps[0].delay_days if steps else None
    now = datetime.now(UTC)

    already = set(
        (
            await session.execute(
                select(CrmSequenceEnrollment.lead_id).where(
                    CrmSequenceEnrollment.sequence_id == sequence_id,
                    CrmSequenceEnrollment.status == CrmEnrollmentStatus.active,
                )
            )
        ).scalars().all()
    )

    enrolled = 0
    seen: set[uuid.UUID] = set()
    for lead_id in lead_ids:
        if lead_id in already or lead_id in seen:
            continue
        seen.add(lead_id)
        next_send_at = (
            None if first_delay is None else now + timedelta(days=first_delay)
        )
        session.add(
            CrmSequenceEnrollment(
                workspace_id=workspace_id,
                sequence_id=sequence_id,
                lead_id=lead_id,
                current_step=0,
                status=CrmEnrollmentStatus.active,
                next_send_at=next_send_at,
            )
        )
        enrolled += 1

    if enrolled:
        await session.commit()
    return enrolled
