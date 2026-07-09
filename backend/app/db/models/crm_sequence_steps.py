"""crm_sequence_steps — one ordered step of a CRM follow-up sequence.

``delay_days`` is the wait before this step fires: measured from enrollment for
step 0, and from the moment the previous step was sent for every later step. The
composite ``(sequence_id, step_order)`` index keeps "load the step at index N"
cheap for the scheduler.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, updated_at_col, uuid_pk


class CrmSequenceStep(Base):
    __tablename__ = "crm_sequence_steps"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    sequence_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crm_sequences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    delay_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(String(4000), nullable=False)
    # How the body is sent: "text" (plain, escaped + wrapped), "html" (a
    # designer template's HTML, sent as-is + personalized), or "ai" (Gemini
    # writes a fresh email per lead from ``ai_prompt``; subject/body are the
    # fallback if generation fails).
    content_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="text", server_default="text"
    )
    ai_prompt: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    __table_args__ = (
        Index(
            "ix_crm_sequence_steps_sequence_order", "sequence_id", "step_order"
        ),
    )
