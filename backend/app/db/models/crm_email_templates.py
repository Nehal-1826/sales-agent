"""crm_email_templates — reusable subject/body templates for CRM outreach.

These are the *custom* templates a workspace saves (or uploads). They sit
alongside a set of read-only **built-in** templates defined in code
(:mod:`app.services.crm_template_service`) — the API merges both so the step
editor can offer a library to pick from.

Picking a template **copies** its subject/body into the sequence step; the step
then owns that text. Editing or deleting a template later never rewrites a live
sequence. ``body`` is capped at 4000 to match ``crm_sequence_steps.body`` so a
template always fits the step it fills.

Bodies may contain ``{{first_name}}`` / ``{{company}}`` style variables; they
are rendered per-lead at send time by ``crm_template_service.render_personalization``.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class CrmEmailTemplate(Base):
    __tablename__ = "crm_email_templates"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(String(4000), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
