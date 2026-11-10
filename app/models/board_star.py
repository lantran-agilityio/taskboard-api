"""Which users starred which boards.

A plain table, not a model, like card_details.py: a row only links a user to a
board. No relationship on Board either; the database cascade removes a deleted
board's stars, and app/services/stars.py reads and writes rows directly.
"""

from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Table

from app.core.database import Base

board_stars = Table(
    "board_stars",
    Base.metadata,
    # user_id first: GET /boards looks up one user's stars.
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "board_id",
        ForeignKey("boards.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    ),
)
