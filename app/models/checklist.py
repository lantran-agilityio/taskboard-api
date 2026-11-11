from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.card import Card
    from app.models.checklist_item import ChecklistItem


class Checklist(Base):
    __tablename__ = "checklists"
    # Deferred for the same reason as on lists (see BoardList).
    __table_args__ = (
        UniqueConstraint("card_id", "position", deferrable=True, initially="DEFERRED"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # No index of its own: the unique constraint's index starts with it.
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    # Checklists aren't archived, so every one has a position.
    position: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    card: Mapped["Card"] = relationship(back_populates="checklists")
    # passive_deletes: the database's cascade deletes the items.
    items: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="checklist",
        order_by="ChecklistItem.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
