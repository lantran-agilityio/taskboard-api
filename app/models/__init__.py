# Import every model so SQLAlchemy can resolve relationships by class name.
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.card import Card
from app.models.user import User

__all__ = ["Board", "BoardList", "Card", "User"]
