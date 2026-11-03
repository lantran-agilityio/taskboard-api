from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.user import User


class BoardRole(StrEnum):
    VIEWER = "viewer"
    EDITOR = "editor"
    # Never stored in board_members: the owner is Board.owner_id.
    OWNER = "owner"


class BoardMember(Base):
    __tablename__ = "board_members"

    # One row per (board, user), so a user can't be added twice.
    board_id: Mapped[int] = mapped_column(
        ForeignKey("boards.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[BoardRole]
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    board: Mapped["Board"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")
