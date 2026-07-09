"""sub_clients — Agency plan sub-client workspaces."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, created_at_col, uuid_pk


class SubClient(Base):
    __tablename__ = "sub_clients"

    id: Mapped[uuid.UUID] = uuid_pk()
    parent_workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(320), nullable=False)
    created_at: Mapped[datetime] = created_at_col()
