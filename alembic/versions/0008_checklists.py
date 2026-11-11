"""checklists

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-11 14:20:35.173015

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "checklists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_id"],
            ["cards.id"],
            name=op.f("fk_checklists_card_id_cards"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_checklists")),
        sa.UniqueConstraint(
            "card_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_checklists_card_id_position"),
        ),
    )
    op.create_table(
        "checklist_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("checklist_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column(
            "done", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["checklist_id"],
            ["checklists.id"],
            name=op.f("fk_checklist_items_checklist_id_checklists"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_checklist_items")),
        sa.UniqueConstraint(
            "checklist_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_checklist_items_checklist_id_position"),
        ),
    )


def downgrade() -> None:
    op.drop_table("checklist_items")
    op.drop_table("checklists")
