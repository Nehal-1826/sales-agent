"""Admin request bodies for the Users routes (app/api/routes/admin.py)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class AdminRoleBody(BaseModel):
    """Body of ``POST /api/admin/users/{user_id}/role`` — the role a copy
    takes. The warmup side knows only these two."""
    role: Literal["client", "super_admin"]
