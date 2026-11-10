"""board description and stars

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-10 15:25:57.287726

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "board_stars",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("board_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name=op.f("fk_board_stars_board_id_boards"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_board_stars_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "board_id", name=op.f("pk_board_stars")),
    )
    op.create_index(
        op.f("ix_board_stars_board_id"), "board_stars", ["board_id"], unique=False
    )
    op.add_column("boards", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("boards", "description")
    op.drop_index(op.f("ix_board_stars_board_id"), table_name="board_stars")
    op.drop_table("board_stars")
