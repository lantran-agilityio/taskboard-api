"""comments and activity

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-09 15:03:17.661362

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("board_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_activities_actor_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name=op.f("fk_activities_board_id_boards"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activities")),
    )
    op.create_index(
        op.f("ix_activities_actor_id"), "activities", ["actor_id"], unique=False
    )
    op.create_index(
        "ix_activities_board_id_id", "activities", ["board_id", "id"], unique=False
    )
    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["author_id"],
            ["users.id"],
            name=op.f("fk_comments_author_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["card_id"],
            ["cards.id"],
            name=op.f("fk_comments_card_id_cards"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_comments")),
    )
    op.create_index(
        op.f("ix_comments_author_id"), "comments", ["author_id"], unique=False
    )
    op.create_index(op.f("ix_comments_card_id"), "comments", ["card_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_comments_card_id"), table_name="comments")
    op.drop_index(op.f("ix_comments_author_id"), table_name="comments")
    op.drop_table("comments")
    op.drop_index("ix_activities_board_id_id", table_name="activities")
    op.drop_index(op.f("ix_activities_actor_id"), table_name="activities")
    op.drop_table("activities")
