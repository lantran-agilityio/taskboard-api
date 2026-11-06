"""Association tables for a card's labels and assignees (many-to-many).

Plain tables, not models: a row only links two ids and carries nothing else.
"""

from sqlalchemy import Column, ForeignKey, Table

from app.core.database import Base

card_labels = Table(
    "card_labels",
    Base.metadata,
    Column("card_id", ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True),
    # Indexed for filtering a board's cards by label.
    Column(
        "label_id",
        ForeignKey("labels.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)

card_assignees = Table(
    "card_assignees",
    Base.metadata,
    Column("card_id", ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "user_id",
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)
