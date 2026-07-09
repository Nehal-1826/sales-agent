"""email_templates — LLM-assisted designer outputs (mode D)."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    html: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_with_llm: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
