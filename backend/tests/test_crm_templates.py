"""Tests for CRM email templates, personalization, and auto-outreach wiring.

Covers:
  * ``render_personalization`` — variable fill, fallbacks, unknown-token strip.
  * Built-in library + custom template CRUD (service level).
  * ``ensure_default_sequence`` seeds the Intro→Follow-up→Break-up steps and is
    idempotent; ``system_enroll_leads`` enrols + skips dupes.
  * End-to-end: a sequence step with ``{{first_name}}`` sends personalized
    subject/body through the scheduler (monkeypatched smtp_sender).
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


# --------------------------------------------------------------------------- #
# render_personalization — pure unit tests (no DB)                             #
# --------------------------------------------------------------------------- #


class _Lead:
    def __init__(self, name=None, email=None, company=None, title=None):
        self.name = name
        self.email = email
        self.company = company
        self.title = title


class _Mailbox:
    def __init__(self, email_address):
        self.email_address = email_address


def test_render_fills_known_variables() -> None:
    from app.services.crm_template_service import render_personalization

    lead = _Lead(name="Jane Doe", email="jane@acme.com", company="Acme", title="CTO")
    mailbox = _Mailbox("sales.team@us.warmpulse.app")
    out = render_personalization(
        "Hi {{first_name}} at {{company}} ({{title}}) — {{sender_name}} here",
        lead=lead,
        mailbox=mailbox,
    )
    assert out == "Hi Jane at Acme (CTO) — Sales here"


def test_render_fallbacks_when_fields_missing() -> None:
    from app.services.crm_template_service import render_personalization

    # No name → first_name derived from the email local part ("jane.doe" → Jane).
    lead = _Lead(name=None, email="jane.doe@acme.com", company=None)
    out = render_personalization(
        "Hey {{first_name}}, how's {{company}}?", lead=lead, mailbox=None
    )
    assert out == "Hey Jane, how's your company?"


def test_render_strips_unknown_tokens() -> None:
    from app.services.crm_template_service import render_personalization

    lead = _Lead(name="Bob", email="bob@x.com")
    out = render_personalization(
        "Hi {{first_name}}{{unknown_var}}!", lead=lead, mailbox=None
    )
    assert out == "Hi Bob!"


def test_render_no_name_no_email_uses_there() -> None:
    from app.services.crm_template_service import render_personalization

    lead = _Lead(name=None, email=None)
    out = render_personalization("Hello {{first_name}}", lead=lead, mailbox=None)
    assert out == "Hello there"


# --------------------------------------------------------------------------- #
# DB fixture                                                                   #
# --------------------------------------------------------------------------- #


def _dedupe_metadata_indexes(base) -> None:
    seen: set[str] = set()
    for table in base.metadata.tables.values():
        to_remove = [idx for idx in list(table.indexes) if idx.name in seen]
        for idx in table.indexes:
            seen.add(idx.name)
        for idx in to_remove:
            table.indexes.discard(idx)


@pytest_asyncio.fixture
async def maker() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.crm_campaigns import CrmCampaign
    from app.db.models.crm_email_templates import CrmEmailTemplate
    from app.db.models.crm_lead_activities import CrmLeadActivity
    from app.db.models.crm_leads import CrmLead
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.db.models.crm_sequences import CrmSequence
    from app.db.models.mailboxes import Mailbox
    from app.db.models.plans import Plan
    from app.db.models.users import User

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (
            User,
            Plan,
            AuditLog,
            CrmCampaign,
            CrmLead,
            CrmLeadActivity,
            CrmSequence,
            CrmSequenceStep,
            CrmSequenceEnrollment,
            CrmEmailTemplate,
            Mailbox,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    mk = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    yield mk
    await engine.dispose()


async def _campaign(mk, workspace_id) -> uuid.UUID:
    from app.db.models.crm_campaigns import CrmCampaign, CrmCampaignStatus

    async with mk() as s:
        c = CrmCampaign(
            workspace_id=workspace_id, name="Auto", status=CrmCampaignStatus.active
        )
        s.add(c)
        await s.commit()
        await s.refresh(c)
        return c.id


async def _lead(mk, workspace_id, campaign_id, *, name, email, company=None) -> uuid.UUID:
    from app.db.models.crm_leads import CrmLead, CrmLeadStage

    async with mk() as s:
        ld = CrmLead(
            workspace_id=workspace_id,
            campaign_id=campaign_id,
            name=name,
            email=email,
            company=company,
            stage=CrmLeadStage.new,
        )
        s.add(ld)
        await s.commit()
        await s.refresh(ld)
        return ld.id


# --------------------------------------------------------------------------- #
# Template service CRUD                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_templates_includes_builtins_then_custom(maker) -> None:
    from app.services import crm_template_service as svc

    ws = uuid.uuid4()
    async with maker() as s:
        rows = await svc.list_templates(s, workspace_id=ws)
    assert len(rows) == len(svc.BUILTIN_TEMPLATES)
    assert all(r["is_builtin"] for r in rows)
    assert rows[0]["id"].startswith("builtin:")

    async with maker() as s:
        created = await svc.create_template(
            s,
            workspace_id=ws,
            name="My template",
            subject="Hi {{first_name}}",
            body="Body",
            category="Custom",
        )
    assert created["is_builtin"] is False

    async with maker() as s:
        rows = await svc.list_templates(s, workspace_id=ws)
    assert len(rows) == len(svc.BUILTIN_TEMPLATES) + 1
    assert rows[-1]["name"] == "My template"


@pytest.mark.asyncio
async def test_update_and_delete_custom_template(maker) -> None:
    from app.services import crm_template_service as svc

    ws = uuid.uuid4()
    async with maker() as s:
        created = await svc.create_template(
            s, workspace_id=ws, name="T", subject="S", body="B"
        )
    tid = uuid.UUID(created["id"])

    async with maker() as s:
        updated = await svc.update_template(
            s, workspace_id=ws, template_id=tid, fields={"name": "T2"}
        )
    assert updated is not None and updated["name"] == "T2"

    async with maker() as s:
        ok = await svc.delete_template(s, workspace_id=ws, template_id=tid)
    assert ok is True
    async with maker() as s:
        gone = await svc.delete_template(s, workspace_id=ws, template_id=tid)
    assert gone is False


@pytest.mark.asyncio
async def test_update_template_wrong_workspace_returns_none(maker) -> None:
    from app.services import crm_template_service as svc

    ws = uuid.uuid4()
    async with maker() as s:
        created = await svc.create_template(
            s, workspace_id=ws, name="T", subject="S", body="B"
        )
    async with maker() as s:
        res = await svc.update_template(
            s,
            workspace_id=uuid.uuid4(),  # different workspace
            template_id=uuid.UUID(created["id"]),
            fields={"name": "X"},
        )
    assert res is None


# --------------------------------------------------------------------------- #
# Default sequence + system enroll                                            #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ensure_default_sequence_seeds_steps_and_is_idempotent(maker) -> None:
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.services import crm_sequence_service as seq_svc
    from app.services import crm_template_service as tpl_svc

    ws = uuid.uuid4()
    campaign_id = await _campaign(maker, ws)

    async with maker() as s:
        seq_id = await seq_svc.ensure_default_sequence(
            s, workspace_id=ws, campaign_id=campaign_id
        )
    async with maker() as s:
        steps = (
            await s.execute(
                select(CrmSequenceStep)
                .where(CrmSequenceStep.sequence_id == seq_id)
                .order_by(CrmSequenceStep.step_order)
            )
        ).scalars().all()
    assert len(steps) == len(tpl_svc.DEFAULT_SEQUENCE_STEPS)
    assert steps[0].delay_days == 0
    assert steps[1].delay_days == 3
    assert "{{first_name}}" in steps[0].subject  # templated, not literal

    # Idempotent: same sequence id, no duplicate steps.
    async with maker() as s:
        seq_id2 = await seq_svc.ensure_default_sequence(
            s, workspace_id=ws, campaign_id=campaign_id
        )
    assert seq_id2 == seq_id
    async with maker() as s:
        count = len(
            (
                await s.execute(
                    select(CrmSequenceStep).where(
                        CrmSequenceStep.sequence_id == seq_id
                    )
                )
            ).scalars().all()
        )
    assert count == len(tpl_svc.DEFAULT_SEQUENCE_STEPS)


@pytest.mark.asyncio
async def test_system_enroll_skips_already_enrolled(maker) -> None:
    from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment
    from app.services import crm_sequence_service as seq_svc

    ws = uuid.uuid4()
    campaign_id = await _campaign(maker, ws)
    async with maker() as s:
        seq_id = await seq_svc.ensure_default_sequence(
            s, workspace_id=ws, campaign_id=campaign_id
        )
    lead_id = await _lead(maker, ws, campaign_id, name="A", email="a@x.com")

    async with maker() as s:
        n1 = await seq_svc.system_enroll_leads(
            s, workspace_id=ws, sequence_id=seq_id, lead_ids=[lead_id]
        )
    assert n1 == 1
    # Re-enroll same lead → skipped.
    async with maker() as s:
        n2 = await seq_svc.system_enroll_leads(
            s, workspace_id=ws, sequence_id=seq_id, lead_ids=[lead_id]
        )
    assert n2 == 0
    async with maker() as s:
        enrollments = (
            await s.execute(
                select(CrmSequenceEnrollment).where(
                    CrmSequenceEnrollment.sequence_id == seq_id
                )
            )
        ).scalars().all()
    assert len(enrollments) == 1
    assert enrollments[0].current_step == 0
    assert enrollments[0].next_send_at is not None  # step0 delay 0 → due now


# --------------------------------------------------------------------------- #
# End-to-end: personalized send through the scheduler                          #
# --------------------------------------------------------------------------- #


async def _seed_mailbox(mk, workspace_id, user_id, email):
    from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus

    async with mk() as s:
        mb = Mailbox(
            workspace_id=workspace_id,
            user_id=user_id,
            email_address=email,
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.active,
            is_paused=False,
            smtp_host="smtp.test",
            smtp_port=587,
            smtp_username=email,
            smtp_password_encrypted=b"x",
        )
        s.add(mb)
        await s.commit()


@pytest.mark.asyncio
async def test_scheduler_sends_personalized_subject_and_body(maker, monkeypatch) -> None:
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.services import crm_sequence_service as seq_svc
    from app.services.warmup import smtp_sender

    ws = uuid.uuid4()
    user_id = uuid.uuid4()
    campaign_id = await _campaign(maker, ws)
    await _seed_mailbox(maker, ws, user_id, "sara.jones@warmpulse.app")

    # A sequence with one step that uses {{first_name}} / {{company}}.
    async with maker() as s:
        seq_id = await seq_svc.ensure_default_sequence(
            s, workspace_id=ws, campaign_id=campaign_id
        )
        # Replace step 0 body/subject with known variable content.
        step0 = (
            await s.execute(
                select(CrmSequenceStep)
                .where(CrmSequenceStep.sequence_id == seq_id)
                .order_by(CrmSequenceStep.step_order)
            )
        ).scalars().first()
        step0.subject = "Hi {{first_name}}"
        step0.body = "Hello {{first_name}} at {{company}}, from {{sender_name}}."
        await s.commit()

    lead_id = await _lead(
        maker, ws, campaign_id, name="Jane Doe", email="jane@acme.com", company="Acme"
    )
    async with maker() as s:
        await seq_svc.system_enroll_leads(
            s, workspace_id=ws, sequence_id=seq_id, lead_ids=[lead_id]
        )

    calls: list[dict] = []

    async def _fake_send(mailbox, peer, subject, body, is_html, fernet, **kw):
        calls.append({"to": peer.email_address, "subject": subject, "body": body})
        return {"message_id": "<x@warmpulse>", "smtp_response": "250 OK"}

    monkeypatch.setattr(smtp_sender, "send_email", _fake_send)

    now = datetime.now(UTC) + timedelta(minutes=1)
    async with maker() as db:
        result = await seq_svc.process_due_enrollments(db, now)

    assert result.processed == 1
    assert len(calls) == 1
    assert calls[0]["to"] == "jane@acme.com"
    assert calls[0]["subject"] == "Hi Jane"
    assert "Hello Jane at Acme, from Sara." in calls[0]["body"]
    assert "{{" not in calls[0]["body"]  # no raw tokens leaked


# --------------------------------------------------------------------------- #
# content_mode: HTML designer + AI send paths                                  #
# --------------------------------------------------------------------------- #


def test_inject_open_pixel_before_body_close() -> None:
    from app.services.crm_tracking import inject_open_pixel

    out = inject_open_pixel("<html><body><p>Hi</p></body></html>", "http://px/1.gif")
    assert "<p>Hi</p>" in out
    assert out.index("http://px/1.gif") < out.index("</body>")
    # No </body> → appended at the end.
    out2 = inject_open_pixel("<p>Hi</p>", "http://px/1.gif")
    assert out2.startswith("<p>Hi</p>")
    assert "http://px/1.gif" in out2


def test_ai_parse_subject_body() -> None:
    from app.services.crm_ai_service import _parse_subject_body

    s, b = _parse_subject_body("Subject: Hello there\n\nThis is the body.\nLine 2")
    assert s == "Hello there"
    assert b == "This is the body.\nLine 2"
    # No subject line → whole thing is body.
    s2, b2 = _parse_subject_body("just a body")
    assert s2 == ""
    assert b2 == "just a body"


@pytest.mark.asyncio
async def test_generate_email_returns_none_without_provider() -> None:
    """No GEMINI/ANTHROPIC key configured (test env) → None, never raises."""
    from app.config import get_settings
    from app.services import crm_ai_service

    class _Lead:
        name, email, company, title = "Jane", "jane@acme.com", "Acme", None

    out = await crm_ai_service.generate_email(
        prompt="Write a hello",
        variables={"first_name": "Jane", "company": "Acme"},
        settings=get_settings(),
    )
    assert out is None


async def _single_step_sequence(maker, ws, campaign_id, *, mode, subject, body, ai_prompt=None):
    from app.db.models.crm_sequence_steps import CrmSequenceStep
    from app.services import crm_sequence_service as seq_svc

    async with maker() as s:
        seq_id = await seq_svc.ensure_default_sequence(
            s, workspace_id=ws, campaign_id=campaign_id
        )
        step0 = (
            await s.execute(
                select(CrmSequenceStep)
                .where(CrmSequenceStep.sequence_id == seq_id)
                .order_by(CrmSequenceStep.step_order)
            )
        ).scalars().first()
        step0.content_mode = mode
        step0.subject = subject
        step0.body = body
        step0.ai_prompt = ai_prompt
        await s.commit()
    return seq_id


@pytest.mark.asyncio
async def test_html_mode_sends_designed_html_personalized(maker, monkeypatch) -> None:
    from app.services import crm_sequence_service as seq_svc
    from app.services.warmup import smtp_sender

    ws = uuid.uuid4()
    campaign_id = await _campaign(maker, ws)
    await _seed_mailbox(maker, ws, uuid.uuid4(), "sender@warmpulse.app")
    seq_id = await _single_step_sequence(
        maker, ws, campaign_id,
        mode="html",
        subject="Hi {{first_name}}",
        body="<html><body><p>Hi {{first_name}} at {{company}}</p></body></html>",
    )
    lead_id = await _lead(maker, ws, campaign_id, name="Jane Doe", email="jane@acme.com", company="Acme")
    async with maker() as s:
        await seq_svc.system_enroll_leads(s, workspace_id=ws, sequence_id=seq_id, lead_ids=[lead_id])

    calls = []

    async def _fake_send(mailbox, peer, subject, body, is_html, fernet, **kw):
        calls.append({"subject": subject, "body": body, "is_html": is_html})
        return {"message_id": "<x@wp>", "smtp_response": "250 OK"}

    monkeypatch.setattr(smtp_sender, "send_email", _fake_send)

    now = datetime.now(UTC) + timedelta(minutes=1)
    async with maker() as db:
        await seq_svc.process_due_enrollments(db, now)

    assert len(calls) == 1
    assert calls[0]["is_html"] is True
    # Designer HTML rendered as-is (not escaped) with vars filled + pixel.
    assert "<p>Hi Jane at Acme</p>" in calls[0]["body"]
    assert "&lt;p&gt;" not in calls[0]["body"]
    assert ".gif" in calls[0]["body"]  # open pixel injected


@pytest.mark.asyncio
async def test_ai_mode_uses_generated_then_falls_back(maker, monkeypatch) -> None:
    from app.services import crm_ai_service, crm_sequence_service as seq_svc
    from app.services.crm_ai_service import GeneratedEmail
    from app.services.warmup import smtp_sender

    ws = uuid.uuid4()
    campaign_id = await _campaign(maker, ws)
    await _seed_mailbox(maker, ws, uuid.uuid4(), "sender@warmpulse.app")
    seq_id = await _single_step_sequence(
        maker, ws, campaign_id,
        mode="ai", subject="Fallback subject", body="Fallback body",
        ai_prompt="Write a friendly intro",
    )
    lead_id = await _lead(maker, ws, campaign_id, name="Jane", email="jane@acme.com", company="Acme")
    async with maker() as s:
        await seq_svc.system_enroll_leads(s, workspace_id=ws, sequence_id=seq_id, lead_ids=[lead_id])

    calls = []

    async def _fake_send(mailbox, peer, subject, body, is_html, fernet, **kw):
        calls.append({"subject": subject, "body": body})
        return {"message_id": "<x@wp>", "smtp_response": "250 OK"}

    monkeypatch.setattr(smtp_sender, "send_email", _fake_send)

    async def _fake_gen(*, prompt, variables, settings, session=None):
        return GeneratedEmail(subject="AI subject", body="AI body for the lead", usage=None)

    monkeypatch.setattr(crm_ai_service, "generate_email", _fake_gen)

    now = datetime.now(UTC) + timedelta(minutes=1)
    async with maker() as db:
        await seq_svc.process_due_enrollments(db, now)

    assert len(calls) == 1
    assert calls[0]["subject"] == "AI subject"
    assert "AI body for the lead" in calls[0]["body"]


@pytest.mark.asyncio
async def test_ai_mode_falls_back_when_generation_unavailable(maker, monkeypatch) -> None:
    """generate_email returns None (no provider) → stored copy is sent."""
    from app.services import crm_ai_service, crm_sequence_service as seq_svc
    from app.services.warmup import smtp_sender

    ws = uuid.uuid4()
    campaign_id = await _campaign(maker, ws)
    await _seed_mailbox(maker, ws, uuid.uuid4(), "sender@warmpulse.app")
    seq_id = await _single_step_sequence(
        maker, ws, campaign_id,
        mode="ai", subject="Hi {{first_name}}", body="Stored body for {{first_name}}",
        ai_prompt="Write something",
    )
    lead_id = await _lead(maker, ws, campaign_id, name="Jane", email="jane@acme.com")
    async with maker() as s:
        await seq_svc.system_enroll_leads(s, workspace_id=ws, sequence_id=seq_id, lead_ids=[lead_id])

    calls = []

    async def _fake_send(mailbox, peer, subject, body, is_html, fernet, **kw):
        calls.append({"subject": subject, "body": body})
        return {"message_id": "<x@wp>", "smtp_response": "250 OK"}

    async def _no_gen(*, prompt, variables, settings, session=None):
        return None

    monkeypatch.setattr(smtp_sender, "send_email", _fake_send)
    monkeypatch.setattr(crm_ai_service, "generate_email", _no_gen)

    now = datetime.now(UTC) + timedelta(minutes=1)
    async with maker() as db:
        await seq_svc.process_due_enrollments(db, now)

    assert len(calls) == 1
    assert calls[0]["subject"] == "Hi Jane"
    assert "Stored body for Jane" in calls[0]["body"]
