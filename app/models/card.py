from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
    select,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.core.database import Base
from app.models.card_details import card_assignees, card_labels

# Imported at runtime (not only for type checking) because the count
# subqueries need these tables; each imports Card only for type checking.
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.comment import Comment

if TYPE_CHECKING:
    from app.models.board_list import BoardList
    from app.models.label import Label
    from app.models.user import User


class Card(Base):
    __tablename__ = "cards"
    # Deferred for the same reason as on lists (see BoardList).
    __table_args__ = (
        UniqueConstraint("list_id", "position", deferrable=True, initially="DEFERRED"),
        # Archived cards have no position (see BoardList).
        CheckConstraint(
            "(archived_at IS NULL) = (position IS NOT NULL)", name="position_iff_active"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("lists.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    due_at: Mapped[datetime | None]
    # server_default fills in the cards that existed before the column did.
    due_complete: Mapped[bool] = mapped_column(default=False, server_default=false())
    archived_at: Mapped[datetime | None]
    # Where it was when archived, so restoring puts it back there.
    archived_position: Mapped[int | None]
    # Loaded in the same SELECT as the card, so a list of cards gets its counts
    # without one query per card. Read-only: it changes as comments do.
    comment_count: Mapped[int] = column_property(
        select(func.count(Comment.id))
        .where(Comment.card_id == id)
        .correlate_except(Comment)
        .scalar_subquery()
    )
    # Checklist progress for the card front, loaded the same way.
    checklist_total: Mapped[int] = column_property(
        select(func.count(ChecklistItem.id))
        .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
        .where(Checklist.card_id == id)
        .correlate_except(Checklist, ChecklistItem)
        .scalar_subquery()
    )
    checklist_done: Mapped[int] = column_property(
        select(func.count(ChecklistItem.id))
        .join(Checklist, ChecklistItem.checklist_id == Checklist.id)
        .where(Checklist.card_id == id, ChecklistItem.done)
        .correlate_except(Checklist, ChecklistItem)
        .scalar_subquery()
    )

    board_list: Mapped["BoardList"] = relationship(back_populates="cards")
    labels: Mapped[list["Label"]] = relationship(
        secondary=card_labels, back_populates="cards", order_by="Label.id"
    )
    assignees: Mapped[list["User"]] = relationship(
        secondary=card_assignees, order_by="User.id"
    )
    # passive_deletes: the database's cascade deletes a card's comments, so
    # deleting a card (or its list or board) doesn't load them first.
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="card", cascade="all, delete-orphan", passive_deletes=True
    )
    # passive_deletes for the same reason as comments.
    checklists: Mapped[list["Checklist"]] = relationship(
        back_populates="card",
        order_by="Checklist.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    @property
    def is_frozen(self) -> bool:
        """Archived, or in an archived list: read-only until restored."""
        return self.is_archived or self.board_list.is_archived

    # Read by CardRead: cards carry ids, and clients look the rest up in the
    # board's labels and members.
    @property
    def label_ids(self) -> list[int]:
        return [label.id for label in self.labels]

    @property
    def assignee_ids(self) -> list[int]:
        return [user.id for user in self.assignees]
