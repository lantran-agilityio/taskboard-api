from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.archive import active, newest_archived

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.card import Card


class BoardList(Base):
    __tablename__ = "lists"
    # Checked at commit, not per row, so renumbering can pass through
    # duplicates mid-move; a duplicate that survives to the commit fails it.
    __table_args__ = (
        UniqueConstraint("board_id", "position", deferrable=True, initially="DEFERRED"),
        # Archived lists have no position, so active ones stay 0..n-1 (and the
        # unique constraint ignores the NULLs).
        CheckConstraint(
            "(archived_at IS NULL) = (position IS NOT NULL)", name="position_iff_active"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(100))
    position: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    archived_at: Mapped[datetime | None]

    board: Mapped["Board"] = relationship(back_populates="lists")
    cards: Mapped[list["Card"]] = relationship(
        back_populates="board_list",
        cascade="all, delete-orphan",
        order_by="Card.position",
    )

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    # Every card, archived or not, is in `cards` (so deletes cascade); ordering
    # code works on the active ones only.
    @property
    def active_cards(self) -> list["Card"]:
        return active(self.cards)

    @property
    def archived_cards(self) -> list["Card"]:
        return newest_archived(self.cards)
