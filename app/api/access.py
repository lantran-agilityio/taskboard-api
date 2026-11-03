"""Load a board, list or card and check the current user's role on its board.

A user with no role gets 404, so boards they aren't on stay hidden; a member
whose role is too low gets 403, since they can already see the board.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.board_member import BoardRole
from app.models.card import Card
from app.services.permissions import allows, board_role


def check_role(board: Board, user_id: int, minimum: BoardRole, missing: str) -> None:
    role = board_role(board, user_id)
    if role is None:
        raise HTTPException(status_code=404, detail=missing)
    if not allows(role, minimum):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires the {minimum} role",
        )


def board_access(minimum: BoardRole) -> Callable[..., Board]:
    def dependency(
        board_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Board:
        board = db.get(Board, board_id)
        if board is None:
            raise HTTPException(status_code=404, detail="Board not found")
        check_role(board, user.id, minimum, "Board not found")
        return board

    return dependency


def list_access(minimum: BoardRole) -> Callable[..., BoardList]:
    def dependency(
        list_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> BoardList:
        board_list = db.get(BoardList, list_id)
        if board_list is None:
            raise HTTPException(status_code=404, detail="List not found")
        check_role(board_list.board, user.id, minimum, "List not found")
        return board_list

    return dependency


def card_access(minimum: BoardRole) -> Callable[..., Card]:
    def dependency(
        card_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Card:
        card = db.get(Card, card_id)
        if card is None:
            raise HTTPException(status_code=404, detail="Card not found")
        check_role(card.board_list.board, user.id, minimum, "Card not found")
        return card

    return dependency


ViewableBoard = Annotated[Board, Depends(board_access(BoardRole.VIEWER))]
EditableBoard = Annotated[Board, Depends(board_access(BoardRole.EDITOR))]
OwnedBoard = Annotated[Board, Depends(board_access(BoardRole.OWNER))]
ViewableList = Annotated[BoardList, Depends(list_access(BoardRole.VIEWER))]
EditableList = Annotated[BoardList, Depends(list_access(BoardRole.EDITOR))]
ViewableCard = Annotated[Card, Depends(card_access(BoardRole.VIEWER))]
EditableCard = Annotated[Card, Depends(card_access(BoardRole.EDITOR))]
