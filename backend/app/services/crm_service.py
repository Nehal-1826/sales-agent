"""Business logic for the workspace-scoped CRM feature.

Route handlers in :mod:`app.api.routes.crm` stay thin; every DB touch, the
tier-based campaign cap, audit writes, and the lead-activity timeline bookkeeping
all live here so they can be unit-tested without FastAPI in the loop.

Tier gating (mirrors the frontend ``normalisePlan`` ordering in
``frontend/src/lib/usePlan.ts``):

* starter / trial / free / no-plan → 0 campaigns (must upgrade to use CRM)
* pro / growth / scale            → 3 campaigns
* pro_plus                        → 10 campaigns
* agency / enterprise             → unlimited (cap is ``None``)

Audit writes are savepointed (``session.begin_nested()``) so a logging failure
can never poison the surrounding transaction — same pattern as
:mod:`app.services.team_service` and :mod:`app.services.mailbox_service`.
"""
from __future__ import annotations

import csv as csv_module
import io
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.crm_campaigns import CrmCampaign, CrmCampaignStatus
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_leads import CrmLead, CrmLeadStage
from app.db.models.plans import Plan
from app.db.models.team_members import TeamMember
from app.db.models.users import User
from app.db.models.workspace_settings import WorkspaceSetting
from app.schemas.crm import (
    CrmCampaignAnalytics,
    CrmCampaignCreate,
    CrmCampaignOut,
    CrmCampaignUpdate,
    CrmImportResult,
    CrmLeadCreate,
    CrmLeadUpdate,
    CrmLimits,
    CrmMemberOut,
    CrmOwnerStat,
    CrmRecentActivityOut,
    CrmSummary,
)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Tier cap helper                                                              #
# --------------------------------------------------------------------------- #


def crm_campaign_cap(plan_name: str | None, *, crm_addon: bool = False) -> int | None:
    """Max CRM campaigns the given plan may host. ``None`` means unlimited.

    Product decision (2026-06-14): CRM is available to every user at Pro Plus
    level. Agency / Enterprise stay unlimited; every other tier (Starter / Pro /
    Pro Plus / unknown) gets the Pro Plus allowance of 10 campaigns. The
    ``crm_addon`` flag is retained for signature compatibility but no longer
    gates access, since CRM is now included for all.
    """
    lower = (plan_name or "").lower().strip()
    # Agency / Enterprise → unlimited.
    if "agency" in lower or "enterprise" in lower:
        return None
    # Everyone else → Pro Plus allowance.
    return 10


def crm_lead_cap(plan_name: str | None) -> int | None:
    """Max CRM leads the given workspace's plan may hold. ``None`` is unlimited.

    Mirrors :func:`crm_campaign_cap`: Agency / Enterprise unlimited, every other
    tier gets the Pro Plus lead allowance of 25,000.
    """
    lower = (plan_name or "").lower().strip()
    # Agency / Enterprise → unlimited.
    if "agency" in lower or "enterprise" in lower:
        return None
    # Everyone else → Pro Plus allowance.
    return 25_000


def crm_auto_enabled_for_plan(plan_name: str | None) -> bool:
    """Whether a plan gets *automated* CRM (auto Sent-folder import + sequence
    auto-enrol), versus manual-only CRM where the user adds leads themselves.

    Product decision (2026-06-15): automated CRM is a Pro Plus / Agency /
    Enterprise capability. Below Pro Plus (Starter / Pro / unknown / no-plan)
    CRM is still fully usable but manual — no background import. Mirrors the
    ``normalisePlan`` tiering in ``frontend/src/lib/usePlan.ts``.
    """
    lower = (plan_name or "").lower().strip()
    if "agency" in lower or "enterprise" in lower:
        return True
    return any(t in lower for t in ("pro plus", "pro_plus", "pro-plus", "proplus"))


async def sync_workspace_auto_crm(
    session: AsyncSession, *, workspace_id: uuid.UUID, plan_name: str | None
) -> bool:
    """Align a workspace's ``auto_crm_enabled`` flag with its plan tier.

    Pro Plus / Agency / Enterprise → automated CRM on; below → off (manual).
    Called on every plan change so an upgrade starts auto-CRM and a downgrade
    drops back to manual. Creates the settings row if absent. Returns the new
    flag value. Does NOT commit — the caller owns the transaction.
    """
    enabled = crm_auto_enabled_for_plan(plan_name)
    row = await session.get(WorkspaceSetting, workspace_id)
    if row is None:
        row = WorkspaceSetting(workspace_id=workspace_id, auto_crm_enabled=enabled)
        session.add(row)
    else:
        row.auto_crm_enabled = enabled
    return enabled


async def _resolve_plan_name(session: AsyncSession, user: User) -> str:
    """Resolve the caller's plan name; null ``plan_id`` → ``"starter"``."""
    if user.plan_id is None:
        return "starter"
    plan = await session.get(Plan, user.plan_id)
    if plan is None:
        return "starter"
    return plan.name


async def _crm_addon_enabled(session: AsyncSession, user: User) -> bool:
    """Whether the caller's workspace has purchased the CRM add-on."""
    row = await session.get(WorkspaceSetting, user.workspace_id)
    return bool(row and row.crm_addon_enabled)


# --------------------------------------------------------------------------- #
# Audit helper (savepointed best-effort)                                       #
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


# --------------------------------------------------------------------------- #
# Projection helpers                                                           #
# --------------------------------------------------------------------------- #


async def _campaign_to_out(
    session: AsyncSession, campaign: CrmCampaign
) -> CrmCampaignOut:
    """Project a campaign + its aggregate lead_count / won_value_cents."""
    lead_count = int(
        (
            await session.execute(
                select(func.count(CrmLead.id)).where(
                    CrmLead.campaign_id == campaign.id
                )
            )
        ).scalar_one()
    )
    won_value = int(
        (
            await session.execute(
                select(func.coalesce(func.sum(CrmLead.value_cents), 0)).where(
                    CrmLead.campaign_id == campaign.id,
                    CrmLead.stage == CrmLeadStage.won,
                )
            )
        ).scalar_one()
    )

    # Per-stage breakdown for this campaign — all six stages present (0-filled),
    # mirroring how ``get_summary`` builds its workspace-wide ``by_stage``.
    stage_counts: dict[str, int] = {stage.value: 0 for stage in CrmLeadStage}
    stage_rows = await session.execute(
        select(CrmLead.stage, func.count(CrmLead.id))
        .where(CrmLead.campaign_id == campaign.id)
        .group_by(CrmLead.stage)
    )
    for stage_val, cnt in stage_rows.all():
        key = stage_val.value if hasattr(stage_val, "value") else str(stage_val)
        stage_counts[key] = int(cnt)

    return CrmCampaignOut(
        id=campaign.id,
        name=campaign.name,
        description=campaign.description,
        status=(
            campaign.status.value
            if hasattr(campaign.status, "value")
            else str(campaign.status)
        ),
        lead_count=lead_count,
        won_value_cents=won_value,
        stage_counts=stage_counts,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


# --------------------------------------------------------------------------- #
# Campaigns                                                                    #
# --------------------------------------------------------------------------- #


async def list_campaigns(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[CrmCampaignOut]:
    rows = (
        await session.execute(
            select(CrmCampaign)
            .where(CrmCampaign.workspace_id == workspace_id)
            .order_by(CrmCampaign.created_at.desc())
        )
    ).scalars().all()
    return [await _campaign_to_out(session, c) for c in rows]


async def _get_campaign_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, campaign_id: uuid.UUID
) -> CrmCampaign:
    campaign = (
        await session.execute(
            select(CrmCampaign).where(
                CrmCampaign.id == campaign_id,
                CrmCampaign.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


async def get_campaign(
    session: AsyncSession, *, workspace_id: uuid.UUID, campaign_id: uuid.UUID
) -> CrmCampaignOut:
    campaign = await _get_campaign_or_404(
        session, workspace_id=workspace_id, campaign_id=campaign_id
    )
    return await _campaign_to_out(session, campaign)


async def create_campaign(
    session: AsyncSession, *, user: User, payload: CrmCampaignCreate
) -> CrmCampaignOut:
    plan_name = await _resolve_plan_name(session, user)
    addon = await _crm_addon_enabled(session, user)
    cap = crm_campaign_cap(plan_name, crm_addon=addon)

    # Count non-archived campaigns against the cap. Archived campaigns are kept
    # for history but don't consume a slot.
    count = int(
        (
            await session.execute(
                select(func.count(CrmCampaign.id)).where(
                    CrmCampaign.workspace_id == user.workspace_id,
                    CrmCampaign.status != CrmCampaignStatus.archived,
                )
            )
        ).scalar_one()
    )
    if cap is not None and count >= cap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{plan_name} plan allows {cap} CRM campaigns. "
                "Upgrade to add more."
            ),
        )

    campaign = CrmCampaign(
        workspace_id=user.workspace_id,
        name=payload.name,
        description=payload.description,
        status=CrmCampaignStatus.active,
    )
    session.add(campaign)
    await session.flush()
    await _write_audit(
        session,
        action="crm.campaign_created",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_campaign",
        target_id=campaign.id,
        payload={"name": campaign.name},
    )
    await session.commit()
    await session.refresh(campaign)
    return await _campaign_to_out(session, campaign)


async def update_campaign(
    session: AsyncSession,
    *,
    user: User,
    campaign_id: uuid.UUID,
    payload: CrmCampaignUpdate,
) -> CrmCampaignOut:
    campaign = await _get_campaign_or_404(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        campaign.name = data["name"]
    if "description" in data:
        campaign.description = data["description"]
    if "status" in data and data["status"] is not None:
        raw = data["status"]
        campaign.status = CrmCampaignStatus(
            raw.value if hasattr(raw, "value") else str(raw)
        )

    await session.flush()
    await _write_audit(
        session,
        action="crm.campaign_updated",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_campaign",
        target_id=campaign.id,
        payload={"fields": sorted(data.keys())},
    )
    await session.commit()
    await session.refresh(campaign)
    return await _campaign_to_out(session, campaign)


async def delete_campaign(
    session: AsyncSession, *, user: User, campaign_id: uuid.UUID
) -> None:
    campaign = await _get_campaign_or_404(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )
    campaign_id_copy = campaign.id
    name_copy = campaign.name
    await session.delete(campaign)
    await session.flush()
    await _write_audit(
        session,
        action="crm.campaign_deleted",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_campaign",
        target_id=campaign_id_copy,
        payload={"name": name_copy},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Leads                                                                        #
# --------------------------------------------------------------------------- #


async def list_leads(
    session: AsyncSession, *, workspace_id: uuid.UUID, campaign_id: uuid.UUID
) -> list[CrmLead]:
    # 404 the campaign if it isn't in this workspace so we never leak another
    # workspace's leads via a guessed campaign_id.
    await _get_campaign_or_404(
        session, workspace_id=workspace_id, campaign_id=campaign_id
    )
    rows = (
        await session.execute(
            select(CrmLead)
            .where(
                CrmLead.workspace_id == workspace_id,
                CrmLead.campaign_id == campaign_id,
            )
            .order_by(CrmLead.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def _get_lead_or_404(
    session: AsyncSession, *, workspace_id: uuid.UUID, lead_id: uuid.UUID
) -> CrmLead:
    lead = (
        await session.execute(
            select(CrmLead).where(
                CrmLead.id == lead_id,
                CrmLead.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


async def create_lead(
    session: AsyncSession, *, user: User, payload: CrmLeadCreate
) -> CrmLead:
    # Campaign must belong to the caller's workspace.
    await _get_campaign_or_404(
        session, workspace_id=user.workspace_id, campaign_id=payload.campaign_id
    )

    # Per-tier lead-count cap. Count every lead in the workspace against it.
    plan_name = await _resolve_plan_name(session, user)
    cap = crm_lead_cap(plan_name)
    if cap is not None:
        count = int(
            (
                await session.execute(
                    select(func.count(CrmLead.id)).where(
                        CrmLead.workspace_id == user.workspace_id
                    )
                )
            ).scalar_one()
        )
        if count >= cap:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{plan_name} plan allows {cap} CRM leads. "
                    "Upgrade to add more."
                ),
            )

    now = datetime.now(UTC)
    stage_raw = (
        payload.stage.value if hasattr(payload.stage, "value") else str(payload.stage)
    )
    lead = CrmLead(
        workspace_id=user.workspace_id,
        campaign_id=payload.campaign_id,
        name=payload.name,
        email=payload.email,
        company=payload.company,
        title=payload.title,
        phone=payload.phone,
        stage=CrmLeadStage(stage_raw),
        value_cents=payload.value_cents,
        owner_email=payload.owner_email,
        source=payload.source,
        tags=list(payload.tags or []),
        notes=payload.notes,
        last_activity_at=now,
    )
    session.add(lead)
    await session.flush()

    # Seed the timeline with a ``created`` activity.
    session.add(
        CrmLeadActivity(
            workspace_id=user.workspace_id,
            lead_id=lead.id,
            kind=CrmActivityKind.created,
            body=f"Lead created: {lead.name}",
            actor_email=user.email,
        )
    )
    await session.flush()
    await _write_audit(
        session,
        action="crm.lead_created",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_lead",
        target_id=lead.id,
        payload={"campaign_id": str(lead.campaign_id), "email": lead.email},
    )
    await session.commit()
    await session.refresh(lead)
    return lead


async def update_lead(
    session: AsyncSession,
    *,
    user: User,
    lead_id: uuid.UUID,
    payload: CrmLeadUpdate,
) -> CrmLead:
    lead = await _get_lead_or_404(
        session, workspace_id=user.workspace_id, lead_id=lead_id
    )
    data = payload.model_dump(exclude_unset=True)

    old_stage = lead.stage.value if hasattr(lead.stage, "value") else str(lead.stage)
    new_stage = old_stage
    stage_changed = False

    simple_fields = (
        "name",
        "email",
        "company",
        "title",
        "phone",
        "value_cents",
        "owner_email",
        "source",
        "notes",
    )
    for field in simple_fields:
        if field in data:
            setattr(lead, field, data[field])
    if "tags" in data and data["tags"] is not None:
        lead.tags = list(data["tags"])
    if "stage" in data and data["stage"] is not None:
        raw = data["stage"]
        new_stage = raw.value if hasattr(raw, "value") else str(raw)
        if new_stage != old_stage:
            lead.stage = CrmLeadStage(new_stage)
            stage_changed = True

    now = datetime.now(UTC)
    if stage_changed:
        lead.last_activity_at = now
        session.add(
            CrmLeadActivity(
                workspace_id=user.workspace_id,
                lead_id=lead.id,
                kind=CrmActivityKind.stage_change,
                body=f"Stage changed {old_stage} → {new_stage}",
                actor_email=user.email,
            )
        )

    await session.flush()
    await _write_audit(
        session,
        action="crm.lead_updated",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_lead",
        target_id=lead.id,
        payload={"fields": sorted(data.keys()), "stage_changed": stage_changed},
    )
    await session.commit()
    await session.refresh(lead)
    return lead


async def delete_lead(
    session: AsyncSession, *, user: User, lead_id: uuid.UUID
) -> None:
    lead = await _get_lead_or_404(
        session, workspace_id=user.workspace_id, lead_id=lead_id
    )
    lead_id_copy = lead.id
    email_copy = lead.email
    await session.delete(lead)
    await session.flush()
    await _write_audit(
        session,
        action="crm.lead_deleted",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_lead",
        target_id=lead_id_copy,
        payload={"email": email_copy},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# CSV import                                                                   #
# --------------------------------------------------------------------------- #


def _parse_value_to_cents(raw: str | None) -> int:
    """Lenient money parse → integer cents. Empty / junk → 0.

    Accepts ``"1234"``, ``"$1,234.56"``, ``"1234.5"`` etc. Anything that yields
    no digits returns 0 rather than raising — a bad value column must never sink
    an entire import row.
    """
    if not raw:
        return 0
    cleaned = raw.strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    if not cleaned:
        return 0
    try:
        return int(round(float(cleaned) * 100))
    except (ValueError, TypeError):
        return 0


def _strip_linkedin_preamble(csv_text: str) -> str:
    """LinkedIn's Connections.csv export prepends a few "Notes:" lines before
    the real header. Drop everything before the first line that looks like the
    header (mentions First/Last Name or Email Address) so DictReader sees the
    right columns. No-op when no such header is found.
    """
    lines = csv_text.splitlines()
    for i, line in enumerate(lines):
        low = line.lower()
        if ("first name" in low and "last name" in low) or "email address" in low:
            return "\n".join(lines[i:])
    return csv_text


# Column headers for the downloadable import templates.
#
# Deliberately the single source of truth: _lead_fields_from_row() below reads
# exactly these keys, so a template handed to a user can never drift from what
# the parser actually accepts. Change a column here and the sample file, the
# parser and the docs all move together.
IMPORT_TEMPLATE_COLUMNS: dict[str, list[str]] = {
    "csv": ["name", "email", "company", "title", "phone", "value"],
    # LinkedIn's own connections export header, matched case-insensitively.
    "linkedin": [
        "First Name", "Last Name", "Email Address",
        "Company", "Position", "Connected On", "URL",
    ],
}

IMPORT_TEMPLATE_SAMPLE_ROWS: dict[str, list[list[str]]] = {
    "csv": [
        ["Ada Lovelace", "ada@example.com", "Analytical Engines", "Engineer", "+91 90000 00000", "25000"],
        ["Alan Turing", "alan@example.com", "Bletchley Ltd", "Researcher", "", "10000"],
    ],
    "linkedin": [
        ["Ada", "Lovelace", "ada@example.com", "Analytical Engines", "Engineer", "01 Jan 2026", "https://www.linkedin.com/in/example"],
    ],
}


def build_import_template(source: str) -> str:
    """Return a ready-to-fill CSV for ``source`` ("csv" or "linkedin").

    Generated from IMPORT_TEMPLATE_COLUMNS so the file a user downloads always
    matches the columns import_leads_csv() reads.
    """
    key = (source or "csv").strip().lower()
    if key not in IMPORT_TEMPLATE_COLUMNS:
        key = "csv"
    buf = io.StringIO()
    writer = csv_module.writer(buf)
    writer.writerow(IMPORT_TEMPLATE_COLUMNS[key])
    for row in IMPORT_TEMPLATE_SAMPLE_ROWS[key]:
        writer.writerow(row)
    return buf.getvalue()


def _lead_fields_from_row(norm: dict[str, str], *, linkedin: bool) -> dict[str, Any]:
    """Map a normalised CSV row to CrmLead kwargs for the given source.

    Generic CSV header: ``name,email,company,title,phone,value``.
    LinkedIn export header: ``First Name,Last Name,Email Address,Company,
    Position,Connected On,URL`` (column set varies; missing emails are fine
    since LinkedIn hides them unless the connection shared one).
    """
    if linkedin:
        first = norm.get("first name") or ""
        last = norm.get("last name") or ""
        name = f"{first} {last}".strip()
        email = norm.get("email address") or ""
        url = norm.get("url") or ""
        return {
            "name": name,
            "email": email,
            "company": norm.get("company") or None,
            "title": norm.get("position") or None,
            "phone": None,
            "value_cents": 0,
            "tags": ["linkedin"],
            "notes": f"LinkedIn profile: {url}" if url else None,
            "source": "linkedin",
        }
    return {
        "name": norm.get("name") or "",
        "email": norm.get("email") or "",
        "company": norm.get("company") or None,
        "title": norm.get("title") or None,
        "phone": norm.get("phone") or None,
        "value_cents": _parse_value_to_cents(norm.get("value")),
        "tags": [],
        "notes": None,
        "source": None,
    }


async def import_leads_csv(
    session: AsyncSession,
    *,
    user: User,
    campaign_id: uuid.UUID,
    csv_text: str,
    source: str = "csv",
) -> CrmImportResult:
    """Parse a CSV into leads.

    ``source="csv"`` expects ``name,email,company,title,phone,value``.
    ``source="linkedin"`` understands LinkedIn's connections export (First
    Name / Last Name / Email Address / Company / Position / URL) and tolerates
    its leading "Notes:" preamble, tagging each lead ``linkedin`` and stashing
    the profile URL in notes.

    Rows missing BOTH name and email are skipped. Each imported lead gets a
    ``created`` activity + ``last_activity_at`` stamp, mirroring
    :func:`create_lead`. Returns imported/skipped counts.
    """
    await _get_campaign_or_404(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )

    linkedin = (source or "").strip().lower() == "linkedin"
    if linkedin:
        csv_text = _strip_linkedin_preamble(csv_text)

    # Per-tier lead-count cap. Only ``remaining`` valid rows may be imported;
    # valid rows beyond the cap count as skipped (partial import — never 409).
    plan_name = await _resolve_plan_name(session, user)
    cap = crm_lead_cap(plan_name)
    remaining: int | None = None
    if cap is not None:
        current = int(
            (
                await session.execute(
                    select(func.count(CrmLead.id)).where(
                        CrmLead.workspace_id == user.workspace_id
                    )
                )
            ).scalar_one()
        )
        remaining = max(cap - current, 0)

    reader = csv_module.DictReader(io.StringIO(csv_text))
    # Normalise header keys to lowercase/stripped so "Email" / " name " match.
    imported = 0
    skipped = 0
    now = datetime.now(UTC)

    for row in reader:
        norm = {
            (k or "").strip().lower(): (v.strip() if isinstance(v, str) else v)
            for k, v in row.items()
        }
        fields = _lead_fields_from_row(norm, linkedin=linkedin)
        name = fields["name"]
        email = fields["email"]
        if not name and not email:
            skipped += 1
            continue

        # At/over the cap: this otherwise-valid row is skipped.
        if remaining is not None and remaining <= 0:
            skipped += 1
            continue

        lead = CrmLead(
            workspace_id=user.workspace_id,
            campaign_id=campaign_id,
            name=name or email,
            email=email or "",
            company=fields["company"],
            title=fields["title"],
            phone=fields["phone"],
            stage=CrmLeadStage.new,
            value_cents=fields["value_cents"],
            source=fields["source"],
            tags=list(fields["tags"]),
            notes=fields["notes"],
            last_activity_at=now,
        )
        session.add(lead)
        await session.flush()
        session.add(
            CrmLeadActivity(
                workspace_id=user.workspace_id,
                lead_id=lead.id,
                kind=CrmActivityKind.created,
                body="Lead imported from LinkedIn" if linkedin else "Lead imported from CSV",
                actor_email=user.email,
            )
        )
        imported += 1
        if remaining is not None:
            remaining -= 1

    await session.flush()
    await _write_audit(
        session,
        action="crm.leads_imported",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_campaign",
        target_id=campaign_id,
        payload={"imported": imported, "skipped": skipped, "source": "linkedin" if linkedin else "csv"},
    )
    await session.commit()
    return CrmImportResult(imported=imported, skipped=skipped)


# --------------------------------------------------------------------------- #
# Activities                                                                   #
# --------------------------------------------------------------------------- #


async def list_activities(
    session: AsyncSession, *, workspace_id: uuid.UUID, lead_id: uuid.UUID
) -> list[CrmLeadActivity]:
    # 404 the lead if it isn't in this workspace.
    await _get_lead_or_404(session, workspace_id=workspace_id, lead_id=lead_id)
    rows = (
        await session.execute(
            select(CrmLeadActivity)
            .where(
                CrmLeadActivity.workspace_id == workspace_id,
                CrmLeadActivity.lead_id == lead_id,
            )
            .order_by(CrmLeadActivity.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


async def add_activity(
    session: AsyncSession,
    *,
    user: User,
    lead_id: uuid.UUID,
    kind: str,
    body: str,
    actor_email: str | None = None,
) -> CrmLeadActivity:
    lead = await _get_lead_or_404(
        session, workspace_id=user.workspace_id, lead_id=lead_id
    )
    activity = CrmLeadActivity(
        workspace_id=user.workspace_id,
        lead_id=lead.id,
        kind=CrmActivityKind(kind),
        body=body,
        actor_email=actor_email or user.email,
    )
    session.add(activity)
    # An activity is a touch — bump the lead's last_activity_at.
    lead.last_activity_at = datetime.now(UTC)
    await session.flush()
    await _write_audit(
        session,
        action="crm.activity_added",
        actor_user_id=user.id,
        actor_role=_actor_role(user),
        target_type="crm_lead",
        target_id=lead.id,
        payload={"kind": kind},
    )
    await session.commit()
    await session.refresh(activity)
    return activity


async def list_recent_activity(
    session: AsyncSession, *, workspace_id: uuid.UUID, limit: int = 8
) -> list[CrmRecentActivityOut]:
    """The workspace-wide activity feed for the CRM landing.

    Joins ``crm_lead_activities`` to ``crm_leads`` (for the lead name) scoped to
    the workspace, newest first. Projected to :class:`CrmRecentActivityOut` so
    the landing's "Recent activity" tile renders without a per-row lookup.
    """
    rows = (
        await session.execute(
            select(CrmLeadActivity, CrmLead.name)
            .join(CrmLead, CrmLead.id == CrmLeadActivity.lead_id)
            .where(CrmLeadActivity.workspace_id == workspace_id)
            .order_by(CrmLeadActivity.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        CrmRecentActivityOut(
            id=activity.id,
            lead_id=activity.lead_id,
            lead_name=lead_name,
            kind=(
                activity.kind.value
                if hasattr(activity.kind, "value")
                else str(activity.kind)
            ),
            body=activity.body,
            actor_email=activity.actor_email,
            created_at=activity.created_at,
        )
        for activity, lead_name in rows
    ]


# --------------------------------------------------------------------------- #
# Meta: limits + summary                                                       #
# --------------------------------------------------------------------------- #


async def get_limits(session: AsyncSession, *, user: User) -> CrmLimits:
    plan_name = await _resolve_plan_name(session, user)
    addon = await _crm_addon_enabled(session, user)
    cap = crm_campaign_cap(plan_name, crm_addon=addon)
    used = int(
        (
            await session.execute(
                select(func.count(CrmCampaign.id)).where(
                    CrmCampaign.workspace_id == user.workspace_id,
                    CrmCampaign.status != CrmCampaignStatus.archived,
                )
            )
        ).scalar_one()
    )
    return CrmLimits(tier=plan_name, cap=cap, used=used)


async def get_summary(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> CrmSummary:
    campaigns = int(
        (
            await session.execute(
                select(func.count(CrmCampaign.id)).where(
                    CrmCampaign.workspace_id == workspace_id
                )
            )
        ).scalar_one()
    )
    leads = int(
        (
            await session.execute(
                select(func.count(CrmLead.id)).where(
                    CrmLead.workspace_id == workspace_id
                )
            )
        ).scalar_one()
    )
    won_value = int(
        (
            await session.execute(
                select(func.coalesce(func.sum(CrmLead.value_cents), 0)).where(
                    CrmLead.workspace_id == workspace_id,
                    CrmLead.stage == CrmLeadStage.won,
                )
            )
        ).scalar_one()
    )

    by_stage: dict[str, int] = {stage.value: 0 for stage in CrmLeadStage}
    stage_rows = await session.execute(
        select(CrmLead.stage, func.count(CrmLead.id))
        .where(CrmLead.workspace_id == workspace_id)
        .group_by(CrmLead.stage)
    )
    for stage_val, cnt in stage_rows.all():
        key = stage_val.value if hasattr(stage_val, "value") else str(stage_val)
        by_stage[key] = int(cnt)

    return CrmSummary(
        campaigns=campaigns,
        leads=leads,
        won_value_cents=won_value,
        by_stage=by_stage,
    )


# --------------------------------------------------------------------------- #
# Team members (owner assignment) + per-campaign analytics                     #
# --------------------------------------------------------------------------- #


async def list_members(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[CrmMemberOut]:
    """Assignable lead owners for the workspace.

    Union of the workspace's real users (always non-empty — the caller is one)
    and any invited team-member emails, deduped case-insensitively by email and
    sorted by display name. Powers the owner dropdown in the lead drawer.
    """
    seen: dict[str, CrmMemberOut] = {}

    user_rows = (
        await session.execute(
            select(User.email, User.display_name).where(
                User.workspace_id == workspace_id
            )
        )
    ).all()
    for email, display_name in user_rows:
        key = (email or "").strip().lower()
        if key and key not in seen:
            seen[key] = CrmMemberOut(email=email, name=display_name or None)

    invite_rows = (
        await session.execute(
            select(TeamMember.invited_email).where(
                TeamMember.workspace_id == workspace_id
            )
        )
    ).scalars().all()
    for email in invite_rows:
        key = (email or "").strip().lower()
        if key and key not in seen:
            seen[key] = CrmMemberOut(email=email, name=None)

    return sorted(seen.values(), key=lambda m: (m.name or m.email).lower())


async def get_campaign_analytics(
    session: AsyncSession, *, workspace_id: uuid.UUID, campaign_id: uuid.UUID
) -> CrmCampaignAnalytics:
    """Per-campaign metrics: stage distribution, conversion, deal value, and
    open/reply rates derived from the ``email_*`` activities the sequence
    engine logs. Owner breakdown surfaces team workload."""
    await _get_campaign_or_404(
        session, workspace_id=workspace_id, campaign_id=campaign_id
    )

    leads = (
        await session.execute(
            select(CrmLead).where(
                CrmLead.workspace_id == workspace_id,
                CrmLead.campaign_id == campaign_id,
            )
        )
    ).scalars().all()

    total = len(leads)
    by_stage: dict[str, int] = {stage.value: 0 for stage in CrmLeadStage}
    won_count = 0
    won_value = 0
    pipeline_value = 0
    owner_map: dict[str | None, dict[str, int]] = {}

    for lead in leads:
        st = lead.stage.value if hasattr(lead.stage, "value") else str(lead.stage)
        by_stage[st] = by_stage.get(st, 0) + 1
        val = int(lead.value_cents or 0)
        if st == "won":
            won_count += 1
            won_value += val
        if st not in ("won", "lost"):
            pipeline_value += val
        owner = lead.owner_email or None
        bucket = owner_map.setdefault(owner, {"leads": 0, "won": 0, "value": 0})
        bucket["leads"] += 1
        if st == "won":
            bucket["won"] += 1
        bucket["value"] += val

    conversion_rate = (won_count / total * 100.0) if total else 0.0

    sent = opened = replied = 0
    lead_ids = [lead.id for lead in leads]
    if lead_ids:
        activity_rows = (
            await session.execute(
                select(CrmLeadActivity.kind, func.count(CrmLeadActivity.id))
                .where(CrmLeadActivity.lead_id.in_(lead_ids))
                .group_by(CrmLeadActivity.kind)
            )
        ).all()
        for kind, cnt in activity_rows:
            k = kind.value if hasattr(kind, "value") else str(kind)
            if k == "email_sent":
                sent = int(cnt)
            elif k == "email_opened":
                opened = int(cnt)
            elif k == "email_replied":
                replied = int(cnt)

    open_rate = (opened / sent * 100.0) if sent else 0.0
    reply_rate = (replied / sent * 100.0) if sent else 0.0

    by_owner = [
        CrmOwnerStat(
            owner_email=owner,
            leads=stats["leads"],
            won=stats["won"],
            value_cents=stats["value"],
        )
        for owner, stats in owner_map.items()
    ]
    by_owner.sort(key=lambda o: (-o.leads, (o.owner_email or "").lower()))

    return CrmCampaignAnalytics(
        campaign_id=campaign_id,
        total_leads=total,
        by_stage=by_stage,
        won_count=won_count,
        won_value_cents=won_value,
        pipeline_value_cents=pipeline_value,
        conversion_rate=round(conversion_rate, 1),
        emails_sent=sent,
        emails_opened=opened,
        emails_replied=replied,
        open_rate=round(open_rate, 1),
        reply_rate=round(reply_rate, 1),
        by_owner=by_owner,
    )
