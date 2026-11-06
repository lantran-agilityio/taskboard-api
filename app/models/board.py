from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.board_list import BoardList
    from app.models.board_member import BoardMember
    from app.models.label import Label
    from app.models.user import User


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    owner: Mapped["User"] = relationship(back_populates="boards")
    lists: Mapped[list["BoardList"]] = relationship(
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="BoardList.position",
    )
    members: Mapped[list["BoardMember"]] = relationship(
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="BoardMember.created_at",
    )
    labels: Mapped[list["Label"]] = relationship(
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="Label.id",
    )
