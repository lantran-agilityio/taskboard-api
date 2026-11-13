"""checklist item assignees and due dates

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-13 16:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "checklist_items", sa.Column("assignee_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "checklist_items",
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_checklist_items_assignee_id_users"),
        "checklist_items",
        "users",
        ["assignee_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_checklist_items_assignee_id_users"),
        "checklist_items",
        type_="foreignkey",
    )
    op.drop_column("checklist_items", "due_at")
    op.drop_column("checklist_items", "assignee_id")
