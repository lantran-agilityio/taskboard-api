"""archive lists and cards

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-06 16:22:52.515542

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = {"lists": "board_id", "cards": "list_id"}  # table: parent column
ACTIVE = "(archived_at IS NULL) = (position IS NOT NULL)"


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table, sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
        )
        op.alter_column(table, "position", existing_type=sa.INTEGER(), nullable=True)
        # Autogenerate doesn't detect CHECK constraints: added by hand.
        op.create_check_constraint(
            op.f(f"ck_{table}_position_iff_active"), table, ACTIVE
        )


def downgrade() -> None:
    for table, parent in TABLES.items():
        op.drop_constraint(
            op.f(f"ck_{table}_position_iff_active"), table, type_="check"
        )
        # position is NOT NULL again below: bring archived items back as active
        # ones at the end of their board or list, oldest archived first, so a
        # downgrade loses nothing.
        op.execute(
            f"""
            UPDATE {table} AS item SET position = moved.position
            FROM (
                SELECT archived.id,
                    (SELECT count(*) FROM {table} AS kept
                     WHERE kept.{parent} = archived.{parent}
                       AND kept.archived_at IS NULL)
                    + row_number() OVER (
                        PARTITION BY archived.{parent}
                        ORDER BY archived.archived_at, archived.id
                    ) - 1 AS position
                FROM {table} AS archived
                WHERE archived.archived_at IS NOT NULL
            ) AS moved
            WHERE item.id = moved.id
            """
        )
        op.alter_column(table, "position", existing_type=sa.INTEGER(), nullable=False)
        op.drop_column(table, "archived_at")
