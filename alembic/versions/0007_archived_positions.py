"""archived positions

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-10 17:03:51.918264

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cards", sa.Column("archived_position", sa.Integer(), nullable=True))
    op.add_column("lists", sa.Column("archived_position", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("lists", "archived_position")
    op.drop_column("cards", "archived_position")
