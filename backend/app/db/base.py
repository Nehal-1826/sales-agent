"""SQLAlchemy 2.0 async declarative base and shared column helpers."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Project-wide declarative base. All models inherit from this."""


def uuid_pk() -> Mapped[uuid.UUID]:
    """Convenience: UUID primary key column generated client-side via uuid4."""
    return mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )


def created_at_col() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


def updated_at_col() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
