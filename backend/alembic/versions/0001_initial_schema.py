"""Create the initial complaints schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


category_enum = postgresql.ENUM(
    "water",
    "electricity",
    "sanitation",
    "roads",
    "streetlights",
    "other",
    name="category_enum",
)
priority_enum = postgresql.ENUM("high", "normal", "low", name="priority_enum")
status_enum = postgresql.ENUM(
    "open",
    "in_progress",
    "resolved",
    "rejected",
    name="status_enum",
)


def upgrade() -> None:
    op.create_table(
        "complaints",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("text", sa.String(length=2000), nullable=False),
        sa.Column("location", sa.String(length=200), nullable=False),
        sa.Column("reporter_contact", sa.String(), nullable=True),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("priority", priority_enum, nullable=False),
        sa.Column(
            "status",
            status_enum,
            server_default=sa.text("'open'"),
            nullable=False,
        ),
        sa.Column("ai_summary", sa.String(length=140), nullable=True),
        sa.Column("triaged_by", sa.String(), nullable=False),
        sa.Column("triage_latency_ms", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(text) BETWEEN 10 AND 2000",
            name="ck_complaints_text_length",
        ),
        sa.CheckConstraint(
            "char_length(location) BETWEEN 3 AND 200",
            name="ck_complaints_location_length",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_complaints_status_priority",
        "complaints",
        ["status", "priority"],
        unique=False,
    )
    op.create_index(
        "ix_complaints_created_at",
        "complaints",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_complaints_created_at", table_name="complaints")
    op.drop_index("ix_complaints_status_priority", table_name="complaints")
    op.drop_table("complaints")
    bind = op.get_bind()
    status_enum.drop(bind, checkfirst=True)
    priority_enum.drop(bind, checkfirst=True)
    category_enum.drop(bind, checkfirst=True)
