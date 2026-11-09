from datetime import UTC, datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Activity(Base):
    """One entry in a board's activity log: an event and who caused it.

    Written by publish() (app/realtime/events.py), so every change that is
    announced over WebSocket is also logged, in the same transaction.
    """

    __tablename__ = "activities"
    # Pages are read newest first within one board: (board_id, id DESC).
    __table_args__ = (Index("ix_activities_board_id_id", "board_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # No relationship on Board: the database's cascade deletes a board's log,
    # so the ORM never loads it just to delete it.
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(50))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
