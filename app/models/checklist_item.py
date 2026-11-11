from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.checklist import Checklist


class ChecklistItem(Base):
    __tablename__ = "checklist_items"
    # Deferred for the same reason as on lists (see BoardList).
    __table_args__ = (
        UniqueConstraint(
            "checklist_id", "position", deferrable=True, initially="DEFERRED"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # No index of its own: the unique constraint's index starts with it.
    checklist_id: Mapped[int] = mapped_column(
        ForeignKey("checklists.id", ondelete="CASCADE")
    )
    text: Mapped[str] = mapped_column(String(500))
    done: Mapped[bool] = mapped_column(default=False, server_default=false())
    position: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    checklist: Mapped["Checklist"] = relationship(back_populates="items")
