# Import every model so SQLAlchemy can resolve relationships by class name.
from app.models.activity import Activity
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.board_member import BoardMember
from app.models.board_star import board_stars
from app.models.card import Card
from app.models.card_details import card_assignees, card_labels
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.comment import Comment
from app.models.label import Label
from app.models.user import User

__all__ = [
    "Activity",
    "Board",
    "BoardList",
    "BoardMember",
    "Card",
    "Checklist",
    "ChecklistItem",
    "Comment",
    "Label",
    "User",
    "board_stars",
    "card_assignees",
    "card_labels",
]
