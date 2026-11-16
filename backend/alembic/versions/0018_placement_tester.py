"""placement_test_seeds + peer_inboxes.is_seed + placement_tests.status/workspace_id

Revision ID: 0018_placement_tester
Revises: 0017_domain_reputation
Create Date: 2026-05-15

Adds the schema for the Pro Plus Placement Tester feature:
  - placement_test_seeds: one row per (test, seed_peer); tracks status/landed_folder.
  - peer_inboxes.is_seed: bool flag, partial index on is_seed=true.
  - placement_tests.status, placement_tests.workspace_id (denormalised for fast
    monthly-quota scans without joining mailboxes).
  - Data step: tag up to 30 active peers as seeds, balanced across providers.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_placement_tester"
down_revision: str | None = "0017_domain_reputation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    cols = [c["name"] for c in insp.get_columns(table)]
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # ---- peer_inboxes.is_seed --------------------------------------------------
    if not _has_column(bind, "peer_inboxes", "is_seed"):
        op.add_column(
            "peer_inboxes",
            sa.Column(
                "is_seed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
    # Partial index on is_seed=true for Postgres; plain index on SQLite (tests).
    if dialect == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_peer_inboxes_is_seed "
            "ON peer_inboxes (is_seed) WHERE is_seed = true"
        )
    else:
        op.create_index(
            "ix_peer_inboxes_is_seed", "peer_inboxes", ["is_seed"]
        )

    # ---- placement_tests.status + workspace_id ---------------------------------
    if not _has_column(bind, "placement_tests", "status"):
        op.add_column(
            "placement_tests",
            sa.Column(
                "status",
                sa.String(32),
                nullable=False,
                server_default=sa.text("'created'"),
            ),
        )
    if not _has_column(bind, "placement_tests", "workspace_id"):
        op.add_column(
            "placement_tests",
            sa.Column(
                "workspace_id",
                postgresql.UUID(as_uuid=True).with_variant(
                    sa.String(36), "sqlite"
                ),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_placement_tests_workspace_id",
            "placement_tests",
            ["workspace_id"],
        )

    # ---- placement_test_seeds --------------------------------------------------
    op.create_table(
        "placement_test_seeds",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite"),
            primary_key=True,
        ),
        sa.Column(
            "test_id",
            postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite"),
            sa.ForeignKey("placement_tests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "seed_peer_id",
            postgresql.UUID(as_uuid=True).with_variant(sa.String(36), "sqlite"),
            sa.ForeignKey("peer_inboxes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message_id", sa.String(512), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("landed_folder", sa.String(128), nullable=True),
        sa.Column(
            "landed_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_placement_test_seeds_test_id",
        "placement_test_seeds",
        ["test_id"],
    )
    op.create_index(
        "ix_placement_test_seeds_test_status",
        "placement_test_seeds",
        ["test_id", "status"],
    )

    # ---- Data step: tag up to 30 peers per-provider as seeds -------------------
    # Postgres uses a CTE with ROW_NUMBER for the per-provider top-N.
    # SQLite (tests) uses a simpler ordered UPDATE — tests don't rely on
    # this data step, they tag peers directly.
    if dialect == "postgresql":
        op.execute(
            """
            WITH ranked AS (
                SELECT id,
                       row_number() OVER (
                           PARTITION BY provider
                           ORDER BY reputation_score DESC NULLS LAST, created_at ASC
                       ) AS rn
                FROM peer_inboxes
                WHERE is_active = true
            )
            UPDATE peer_inboxes p
            SET is_seed = true
            FROM ranked
            WHERE p.id = ranked.id AND ranked.rn <= 10
            """
        )


def downgrade() -> None:
    op.drop_index(
        "ix_placement_test_seeds_test_status",
        table_name="placement_test_seeds",
    )
    op.drop_index(
        "ix_placement_test_seeds_test_id",
        table_name="placement_test_seeds",
    )
    op.drop_table("placement_test_seeds")

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_peer_inboxes_is_seed")
    else:
        op.drop_index("ix_peer_inboxes_is_seed", table_name="peer_inboxes")

    op.drop_column("peer_inboxes", "is_seed")

    op.drop_index(
        "ix_placement_tests_workspace_id", table_name="placement_tests"
    )
    op.drop_column("placement_tests", "workspace_id")
    op.drop_column("placement_tests", "status")
