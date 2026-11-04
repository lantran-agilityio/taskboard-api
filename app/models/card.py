from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.board_list import BoardList


class Card(Base):
    __tablename__ = "cards"
    # Deferred for the same reason as on lists (see BoardList).
    __table_args__ = (
        UniqueConstraint("list_id", "position", deferrable=True, initially="DEFERRED"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("lists.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    board_list: Mapped["BoardList"] = relationship(back_populates="cards")
