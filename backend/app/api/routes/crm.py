"""Workspace-scoped CRM CRUD: campaigns, leads, lead-activity timeline, import.

Every endpoint is mounted under ``/api/crm`` and scoped by the JWT's
``workspace_id`` — a campaign / lead / activity that belongs to another
workspace 404s. Handlers are deliberately thin; all DB work, the tier-based
campaign cap, and audit writes happen in :mod:`app.services.crm_service`.
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.crm import (
    CrmActivityCreate,
    CrmActivityOut,
    CrmCampaignAnalytics,
    CrmCampaignCreate,
    CrmCampaignOut,
    CrmCampaignUpdate,
    CrmImportResult,
    CrmLeadCreate,
    CrmLeadImport,
    CrmLeadOut,
    CrmLeadUpdate,
    CrmLimits,
    CrmMemberOut,
    CrmRecentActivityOut,
    CrmAiDraftRequest,
    CrmAiDraftResponse,
    CrmSummary,
    CrmTemplateCreate,
    CrmTemplateOut,
    CrmTemplateUpdate,
    EnrollmentOut,
    EnrollRequest,
    EnrollResult,
    SequenceCreate,
    SequenceOut,
    SequenceStepCreate,
    SequenceStepOut,
    SequenceStepUpdate,
    SequenceUpdate,
)
from app.config import get_settings
from app.db.models.crm_email_templates import CrmEmailTemplate
from app.services import (
    crm_ai_service,
    crm_sequence_service,
    crm_service,
    crm_template_service,
    crm_tracking,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/crm", tags=["crm"])

# Unauthenticated sub-router. Only serves template logo images, which are
# loaded directly by recipients' mail clients — see get_template_logo_public.
public_router = APIRouter(prefix="/api/crm/public", tags=["crm-public"])


# --------------------------------------------------------------------------- #
# Open tracking pixel (PUBLIC — no auth)                                        #
# --------------------------------------------------------------------------- #


@router.get("/track/open/{token}.gif", include_in_schema=False)
async def track_open_pixel(
    token: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Public 1x1 open-tracking pixel loaded by the recipient's mail client.

    No auth: the request comes from the prospect, not a logged-in user. Token is
    HMAC-verified; a deduped ``email_opened`` activity is recorded on a hit. The
    gif is ALWAYS returned (recording is best-effort) so a forged/expired token
    never breaks the recipient's email rendering.
    """
    info = crm_tracking.parse_open_token(token)
    if info is not None:
        try:
            await crm_tracking.record_open(
                session,
                lead_id=info["lead_id"],
                enrollment_id=info["enrollment_id"],
                step=info["step"],
            )
        except Exception as exc:  # noqa: BLE001 — never break pixel delivery
            logger.warning("crm open-pixel record failed: %s", exc)
    return Response(
        content=crm_tracking.TRANSPARENT_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


# --------------------------------------------------------------------------- #
# Campaigns                                                                    #
# --------------------------------------------------------------------------- #


@router.get("/campaigns", response_model=list[CrmCampaignOut])
async def list_campaigns(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CrmCampaignOut]:
    return await crm_service.list_campaigns(session, workspace_id=user.workspace_id)


@router.post(
    "/campaigns", response_model=CrmCampaignOut, status_code=status.HTTP_201_CREATED
)
async def create_campaign(
    payload: CrmCampaignCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmCampaignOut:
    logger.info("crm.create_campaign user=%s", user.id)
    return await crm_service.create_campaign(session, user=user, payload=payload)


@router.get("/campaigns/{campaign_id}", response_model=CrmCampaignOut)
async def get_campaign(
    campaign_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmCampaignOut:
    return await crm_service.get_campaign(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )


@router.get(
    "/campaigns/{campaign_id}/analytics", response_model=CrmCampaignAnalytics
)
async def campaign_analytics(
    campaign_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmCampaignAnalytics:
    return await crm_service.get_campaign_analytics(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )


@router.patch("/campaigns/{campaign_id}", response_model=CrmCampaignOut)
async def update_campaign(
    campaign_id: uuid.UUID,
    payload: CrmCampaignUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmCampaignOut:
    return await crm_service.update_campaign(
        session, user=user, campaign_id=campaign_id, payload=payload
    )


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await crm_service.delete_campaign(session, user=user, campaign_id=campaign_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Leads                                                                        #
# --------------------------------------------------------------------------- #


@router.get("/campaigns/{campaign_id}/leads", response_model=list[CrmLeadOut])
async def list_leads(
    campaign_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CrmLeadOut]:
    return await crm_service.list_leads(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )


@router.post("/leads", response_model=CrmLeadOut, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: CrmLeadCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmLeadOut:
    return await crm_service.create_lead(session, user=user, payload=payload)


@router.patch("/leads/{lead_id}", response_model=CrmLeadOut)
async def update_lead(
    lead_id: uuid.UUID,
    payload: CrmLeadUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmLeadOut:
    return await crm_service.update_lead(
        session, user=user, lead_id=lead_id, payload=payload
    )


@router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await crm_service.delete_lead(session, user=user, lead_id=lead_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/leads/import", response_model=CrmImportResult)
async def import_leads(
    payload: CrmLeadImport,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmImportResult:
    return await crm_service.import_leads_csv(
        session,
        user=user,
        campaign_id=payload.campaign_id,
        csv_text=payload.csv,
        source=payload.source,
    )


# --------------------------------------------------------------------------- #
# Activities                                                                   #
# --------------------------------------------------------------------------- #


@router.get("/leads/{lead_id}/activities", response_model=list[CrmActivityOut])
async def list_activities(
    lead_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CrmActivityOut]:
    return await crm_service.list_activities(
        session, workspace_id=user.workspace_id, lead_id=lead_id
    )


@router.post(
    "/leads/{lead_id}/activities",
    response_model=CrmActivityOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_activity(
    lead_id: uuid.UUID,
    payload: CrmActivityCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmActivityOut:
    kind = payload.kind.value if hasattr(payload.kind, "value") else str(payload.kind)
    return await crm_service.add_activity(
        session, user=user, lead_id=lead_id, kind=kind, body=payload.body
    )


@router.get("/activity", response_model=list[CrmRecentActivityOut])
async def list_recent_activity(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CrmRecentActivityOut]:
    return await crm_service.list_recent_activity(
        session, workspace_id=user.workspace_id
    )


# --------------------------------------------------------------------------- #
# Meta                                                                         #
# --------------------------------------------------------------------------- #


@router.get("/limits", response_model=CrmLimits)
async def get_limits(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmLimits:
    return await crm_service.get_limits(session, user=user)


@router.get("/summary", response_model=CrmSummary)
async def get_summary(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmSummary:
    return await crm_service.get_summary(session, workspace_id=user.workspace_id)


@router.get("/members", response_model=list[CrmMemberOut])
async def list_members(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CrmMemberOut]:
    return await crm_service.list_members(session, workspace_id=user.workspace_id)


# --------------------------------------------------------------------------- #
# Sequences (email follow-up automation)                                       #
# --------------------------------------------------------------------------- #


@router.get("/sequences", response_model=list[SequenceOut])
async def list_sequences(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    campaign_id: Annotated[uuid.UUID | None, Query()] = None,
) -> list[SequenceOut]:
    return await crm_sequence_service.list_sequences(
        session, workspace_id=user.workspace_id, campaign_id=campaign_id
    )


@router.post(
    "/sequences", response_model=SequenceOut, status_code=status.HTTP_201_CREATED
)
async def create_sequence(
    payload: SequenceCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SequenceOut:
    return await crm_sequence_service.create_sequence(
        session, user=user, payload=payload
    )


@router.get("/sequences/{sequence_id}", response_model=SequenceOut)
async def get_sequence(
    sequence_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SequenceOut:
    return await crm_sequence_service.get_sequence(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )


@router.patch("/sequences/{sequence_id}", response_model=SequenceOut)
async def update_sequence(
    sequence_id: uuid.UUID,
    payload: SequenceUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SequenceOut:
    return await crm_sequence_service.update_sequence(
        session, user=user, sequence_id=sequence_id, payload=payload
    )


@router.delete("/sequences/{sequence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sequence(
    sequence_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await crm_sequence_service.delete_sequence(
        session, user=user, sequence_id=sequence_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- Steps ---------------------------------------------------------------- #


@router.get(
    "/sequences/{sequence_id}/steps", response_model=list[SequenceStepOut]
)
async def list_sequence_steps(
    sequence_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[SequenceStepOut]:
    return await crm_sequence_service.list_steps(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )


@router.post(
    "/sequences/{sequence_id}/steps",
    response_model=SequenceStepOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_sequence_step(
    sequence_id: uuid.UUID,
    payload: SequenceStepCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SequenceStepOut:
    return await crm_sequence_service.add_step(
        session, user=user, sequence_id=sequence_id, payload=payload
    )


@router.patch("/sequence-steps/{step_id}", response_model=SequenceStepOut)
async def update_sequence_step(
    step_id: uuid.UUID,
    payload: SequenceStepUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SequenceStepOut:
    return await crm_sequence_service.update_step(
        session, user=user, step_id=step_id, payload=payload
    )


@router.delete(
    "/sequence-steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_sequence_step(
    step_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await crm_sequence_service.delete_step(session, user=user, step_id=step_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- Enrollments ---------------------------------------------------------- #


@router.post("/sequences/{sequence_id}/enroll", response_model=EnrollResult)
async def enroll_leads(
    sequence_id: uuid.UUID,
    payload: EnrollRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> EnrollResult:
    return await crm_sequence_service.enroll_leads(
        session, user=user, sequence_id=sequence_id, lead_ids=payload.lead_ids
    )


@router.get(
    "/sequences/{sequence_id}/enrollments", response_model=list[EnrollmentOut]
)
async def list_enrollments(
    sequence_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[EnrollmentOut]:
    return await crm_sequence_service.list_enrollments(
        session, workspace_id=user.workspace_id, sequence_id=sequence_id
    )


@router.post(
    "/enrollments/{enrollment_id}/stop", status_code=status.HTTP_204_NO_CONTENT
)
async def stop_enrollment(
    enrollment_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await crm_sequence_service.stop_enrollment(
        session, user=user, enrollment_id=enrollment_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Email templates (sequence-step library)                                      #
# --------------------------------------------------------------------------- #


@router.get("/templates", response_model=list[CrmTemplateOut])
async def list_templates(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[CrmTemplateOut]:
    rows = await crm_template_service.list_templates(
        session, workspace_id=user.workspace_id
    )
    return [CrmTemplateOut(**r) for r in rows]


@router.post(
    "/templates",
    response_model=CrmTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    payload: CrmTemplateCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmTemplateOut:
    row = await crm_template_service.create_template(
        session,
        workspace_id=user.workspace_id,
        name=payload.name,
        subject=payload.subject,
        body=payload.body,
        category=payload.category,
    )
    return CrmTemplateOut(**row)


@router.patch("/templates/{template_id}", response_model=CrmTemplateOut)
async def update_template(
    template_id: uuid.UUID,
    payload: CrmTemplateUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmTemplateOut:
    row = await crm_template_service.update_template(
        session,
        workspace_id=user.workspace_id,
        template_id=template_id,
        fields=payload.model_dump(exclude_unset=True),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return CrmTemplateOut(**row)


@router.delete(
    "/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_template(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    ok = await crm_template_service.delete_template(
        session, workspace_id=user.workspace_id, template_id=template_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Import templates + .eml import                                               #
# --------------------------------------------------------------------------- #


@router.get("/leads/import-template")
async def download_import_template(
    user: Annotated[User, Depends(get_current_user)],
    source: Annotated[str, Query(pattern="^(csv|linkedin)$")] = "csv",
) -> Response:
    """Download a ready-to-fill CSV for the lead importer.

    Generated from the same column definitions the importer reads, so the file
    a user fills in can never drift from what the parser accepts.
    """
    body = crm_service.build_import_template(source)
    filename = f"warmpulse-leads-{source}-template.csv"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/templates/from-eml",
    response_model=CrmTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_template_from_eml(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
    name: Annotated[str | None, Query(max_length=200)] = None,
) -> CrmTemplateOut:
    """Create an email template from an uploaded .eml file.

    Designers export campaign emails from a mail client as .eml; re-typing that
    into the form loses the markup. The HTML part is preferred over plain text,
    matching how the message would actually render.
    """
    parsed = crm_template_service.parse_eml(await file.read())
    fallback = (file.filename or "Imported template").rsplit(".", 1)[0]
    row = await crm_template_service.create_template(
        session,
        workspace_id=user.workspace_id,
        payload=CrmTemplateCreate(
            name=(name or parsed["subject"] or fallback)[:200],
            subject=(parsed["subject"] or fallback)[:300],
            body=parsed["body"],
        ),
    )
    await session.commit()
    return CrmTemplateOut(**row)


# --------------------------------------------------------------------------- #
# Template logo                                                                #
# --------------------------------------------------------------------------- #


@router.post("/templates/{template_id}/logo")
async def upload_template_logo(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: Annotated[UploadFile, File()],
) -> dict[str, Any]:
    """Upload/replace the brand logo embedded in this template's emails."""
    data = await file.read()
    mime = crm_template_service.validate_logo(
        content_type=file.content_type, data=data
    )
    await crm_template_service.set_template_logo(
        session,
        workspace_id=user.workspace_id,
        template_id=template_id,
        data=data,
        mime=mime,
    )
    await session.commit()
    return {
        "has_logo": True,
        "logo_url": crm_template_service.logo_public_url(
            template_id, base_url=get_settings().app_base_url
        ),
    }


@router.delete(
    "/templates/{template_id}/logo", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_template_logo(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await crm_template_service.clear_template_logo(
        session, workspace_id=user.workspace_id, template_id=template_id
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/templates/{template_id}/logo")
async def get_template_logo_public(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Serve a template logo with NO authentication. Intentional.

    This URL is placed in outbound email. The image is fetched by the
    recipient's mail client (or Gmail's image proxy) which has no session and
    no bearer token, so requiring auth would leave a broken image in every
    message. Gmail also strips base64 data: URIs, so inlining is not an
    alternative.

    Exposure is limited to the logo bytes of a template whose UUID the caller
    already knows; no workspace data is reachable through it.
    """
    tpl = await session.get(CrmEmailTemplate, template_id)
    if tpl is None or not tpl.logo_image:
        raise HTTPException(status_code=404, detail="No logo")
    return Response(
        content=tpl.logo_image,
        media_type=tpl.logo_mime or "application/octet-stream",
        # Public and immutable-ish: mail clients and Gmail's proxy cache
        # aggressively, and a re-upload changes nothing about this URL, so keep
        # the window modest.
        headers={"Cache-Control": "public, max-age=3600"},
    )


# --------------------------------------------------------------------------- #
# AI draft — the "Generate with AI" button in the step editor                   #
# --------------------------------------------------------------------------- #


@router.post("/ai/draft", response_model=CrmAiDraftResponse)
async def ai_draft(
    payload: CrmAiDraftRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> CrmAiDraftResponse:
    """Draft a subject + body from a prompt. ``generated=false`` when no LLM
    provider is configured (the UI shows a hint rather than an error)."""
    settings = get_settings()
    # Use the caller's own name as the sample sender so the preview reads right.
    sample_vars = {
        "first_name": "there",
        "name": "there",
        "company": "your company",
        "title": "",
        "sender_name": (user.email.split("@", 1)[0] if user.email else "the team"),
    }
    gen = await crm_ai_service.generate_email(
        prompt=payload.prompt, variables=sample_vars, settings=settings, session=session
    )
    if gen is None:
        return CrmAiDraftResponse(
            subject="",
            body="",
            generated=False,
        )
    if gen.usage is not None:
        try:
            from app.services.llm.usage_tracker import record_usage

            await record_usage(
                session,
                user_id=user.id,
                mailbox_id=None,
                mode="crm_ai_draft",
                usage=gen.usage,
                settings=settings,
            )
            await session.commit()
        except Exception:  # noqa: BLE001
            pass
    return CrmAiDraftResponse(subject=gen.subject, body=gen.body, generated=True)
