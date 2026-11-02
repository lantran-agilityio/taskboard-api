# Import every model so SQLAlchemy can resolve relationships by class name.
from app.models.board import Board
from app.models.board_list import BoardList

__all__ = ["Board", "BoardList"]
