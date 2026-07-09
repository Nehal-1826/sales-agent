"""schedule_windows — warmup time-window configs (feature 4)."""
from __future__ import annotations

import uuid

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk


class ScheduleWindow(Base):
    __tablename__ = "schedule_windows"

    id: Mapped[uuid.UUID] = uuid_pk()
    workspace_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    tz: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    # weekday_mask: bit 0 = Mon … bit 6 = Sun. Default 31 = Mon–Fri (0b0011111).
    weekday_mask: Mapped[int] = mapped_column(Integer, nullable=False, default=31)
    start_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=9)
    end_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=17)
