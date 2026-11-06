from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.card_details import card_labels

if TYPE_CHECKING:
    from app.models.board import Board
    from app.models.card import Card


class LabelColor(StrEnum):
    GREEN = "green"
    YELLOW = "yellow"
    ORANGE = "orange"
    RED = "red"
    PURPLE = "purple"
    BLUE = "blue"


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(
        ForeignKey("boards.id", ondelete="CASCADE"), index=True
    )
    # Not unique: like Trello, two labels may share a name (with other colours).
    name: Mapped[str] = mapped_column(String(100))
    # Store the values ("red"), not the member names ("RED").
    color: Mapped[LabelColor] = mapped_column(
        Enum(
            LabelColor,
            name="label_color",
            values_callable=lambda colors: [color.value for color in colors],
        )
    )
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    board: Mapped["Board"] = relationship(back_populates="labels")
    # Deleting a label through the ORM also removes its card_labels rows.
    cards: Mapped[list["Card"]] = relationship(
        secondary=card_labels, back_populates="labels"
    )
