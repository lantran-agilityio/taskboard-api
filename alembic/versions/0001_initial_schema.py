"""initial schema: users, boards, members, lists and cards

Revision ID: 0001
Revises:
Create Date: 2026-11-04 16:02:20.633670

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "boards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_boards_owner_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_boards")),
    )
    op.create_index(op.f("ix_boards_owner_id"), "boards", ["owner_id"], unique=False)
    op.create_table(
        "board_members",
        sa.Column("board_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("viewer", "editor", "owner", name="board_role"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name=op.f("fk_board_members_board_id_boards"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_board_members_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("board_id", "user_id", name=op.f("pk_board_members")),
    )
    op.create_index(
        op.f("ix_board_members_user_id"), "board_members", ["user_id"], unique=False
    )
    op.create_table(
        "lists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("board_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name=op.f("fk_lists_board_id_boards"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lists")),
        sa.UniqueConstraint(
            "board_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_lists_board_id_position"),
        ),
    )
    op.create_table(
        "cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["list_id"],
            ["lists.id"],
            name=op.f("fk_cards_list_id_lists"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cards")),
        sa.UniqueConstraint(
            "list_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name=op.f("uq_cards_list_id_position"),
        ),
    )


def downgrade() -> None:
    op.drop_table("cards")
    op.drop_table("lists")
    op.drop_index(op.f("ix_board_members_user_id"), table_name="board_members")
    op.drop_table("board_members")
    op.drop_index(op.f("ix_boards_owner_id"), table_name="boards")
    op.drop_table("boards")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    # drop_table doesn't remove the Postgres enum type that create_table made;
    # without this, upgrading again fails with "type board_role already exists".
    sa.Enum(name="board_role").drop(op.get_bind(), checkfirst=True)
