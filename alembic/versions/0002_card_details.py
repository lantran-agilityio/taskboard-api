"""card details: due dates, labels and assignees

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-06 14:57:59.101801

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "labels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("board_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "color",
            sa.Enum(
                "green", "yellow", "orange", "red", "purple", "blue", name="label_color"
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name=op.f("fk_labels_board_id_boards"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_labels")),
    )
    op.create_index(op.f("ix_labels_board_id"), "labels", ["board_id"], unique=False)
    op.create_table(
        "card_assignees",
        sa.Column("card_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_id"],
            ["cards.id"],
            name=op.f("fk_card_assignees_card_id_cards"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_card_assignees_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("card_id", "user_id", name=op.f("pk_card_assignees")),
    )
    op.create_index(
        op.f("ix_card_assignees_user_id"), "card_assignees", ["user_id"], unique=False
    )
    op.create_table(
        "card_labels",
        sa.Column("card_id", sa.Integer(), nullable=False),
        sa.Column("label_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_id"],
            ["cards.id"],
            name=op.f("fk_card_labels_card_id_cards"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["label_id"],
            ["labels.id"],
            name=op.f("fk_card_labels_label_id_labels"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("card_id", "label_id", name=op.f("pk_card_labels")),
    )
    op.create_index(
        op.f("ix_card_labels_label_id"), "card_labels", ["label_id"], unique=False
    )
    op.add_column(
        "cards", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "cards",
        sa.Column(
            "due_complete",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("cards", "due_complete")
    op.drop_column("cards", "due_at")
    op.drop_index(op.f("ix_card_labels_label_id"), table_name="card_labels")
    op.drop_table("card_labels")
    op.drop_index(op.f("ix_card_assignees_user_id"), table_name="card_assignees")
    op.drop_table("card_assignees")
    op.drop_index(op.f("ix_labels_board_id"), table_name="labels")
    op.drop_table("labels")
    # drop_table doesn't remove the Postgres enum type that create_table made;
    # without this, upgrading again fails with "type label_color already exists".
    sa.Enum(name="label_color").drop(op.get_bind(), checkfirst=True)
