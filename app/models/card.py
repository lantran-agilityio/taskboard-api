from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.card_details import card_assignees, card_labels

if TYPE_CHECKING:
    from app.models.board_list import BoardList
    from app.models.label import Label
    from app.models.user import User


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
    due_at: Mapped[datetime | None]
    # server_default fills in the cards that existed before the column did.
    due_complete: Mapped[bool] = mapped_column(default=False, server_default=false())

    board_list: Mapped["BoardList"] = relationship(back_populates="cards")
    labels: Mapped[list["Label"]] = relationship(
        secondary=card_labels, back_populates="cards", order_by="Label.id"
    )
    assignees: Mapped[list["User"]] = relationship(
        secondary=card_assignees, order_by="User.id"
    )

    # Read by CardRead: cards carry ids, and clients look the rest up in the
    # board's labels and members.
    @property
    def label_ids(self) -> list[int]:
        return [label.id for label in self.labels]

    @property
    def assignee_ids(self) -> list[int]:
        return [user.id for user in self.assignees]
