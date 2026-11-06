# Import every model so SQLAlchemy can resolve relationships by class name.
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.board_member import BoardMember
from app.models.card import Card
from app.models.card_details import card_assignees, card_labels
from app.models.label import Label
from app.models.user import User

__all__ = [
    "Board",
    "BoardList",
    "BoardMember",
    "Card",
    "Label",
    "User",
    "card_assignees",
    "card_labels",
]
