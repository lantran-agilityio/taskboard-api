"""Load a board, list or card and check the current user's role on its board.

A user with no role gets 404, so boards they aren't on stay hidden; a member
whose role is too low gets 403, since they can already see the board.

Write access (editor or owner) also locks the board row until the request
commits, so requests that reorder the same board's lists or cards take turns.
The lock is taken before the list or card is loaded, so everything the route
reads comes after the previous request's commit.

A closed board is read-only: write access to it, or to anything on it, is a 422,
except for the few routes that use `OwnedBoardAnyState` (close, reopen, delete).
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.api.errors import validation_error
from app.core.database import get_db
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.board_member import BoardRole
from app.models.card import Card
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.comment import Comment
from app.models.label import Label
from app.services.permissions import allows, board_role


def load_board(
    db: Session,
    board_id: int | None,
    user_id: int,
    minimum: BoardRole,
    missing: str,
    allow_closed: bool = False,
) -> Board:
    """The board, checked for the user's role and locked for writes."""
    if board_id is None:
        raise HTTPException(status_code=404, detail=missing)
    query = select(Board).where(Board.id == board_id)
    if minimum is not BoardRole.VIEWER:
        # One lock per request, always on the board: a card move touching two
        # lists still needs only this one, so requests can't deadlock.
        query = query.with_for_update()
    board = db.scalar(query)
    if board is None:
        raise HTTPException(status_code=404, detail=missing)
    role = board_role(board, user_id)
    if role is None:
        raise HTTPException(status_code=404, detail=missing)
    if not allows(role, minimum):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires the {minimum} role",
        )
    # After the role check, so outsiders still get 404 and viewers 403.
    if minimum is not BoardRole.VIEWER and board.closed_at and not allow_closed:
        raise validation_error("path", "board_id", "Board is closed", board.id)
    return board


def board_access(
    minimum: BoardRole, allow_closed: bool = False
) -> Callable[..., Board]:
    def dependency(
        board_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Board:
        return load_board(
            db, board_id, user.id, minimum, "Board not found", allow_closed
        )

    return dependency


def list_access(minimum: BoardRole) -> Callable[..., BoardList]:
    def dependency(
        list_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> BoardList:
        # Only the board id first: the list itself is loaded after the lock.
        board_id = db.scalar(select(BoardList.board_id).where(BoardList.id == list_id))
        load_board(db, board_id, user.id, minimum, "List not found")
        board_list = db.get(BoardList, list_id)
        if board_list is None:  # deleted while this request waited for the lock
            raise HTTPException(status_code=404, detail="List not found")
        return board_list

    return dependency


def card_access(minimum: BoardRole) -> Callable[..., Card]:
    def dependency(
        card_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Card:
        board_id = db.scalar(
            select(BoardList.board_id).join(Card.board_list).where(Card.id == card_id)
        )
        load_board(db, board_id, user.id, minimum, "Card not found")
        card = db.get(Card, card_id)
        if card is None:  # deleted while this request waited for the lock
            raise HTTPException(status_code=404, detail="Card not found")
        return card

    return dependency


def label_access(minimum: BoardRole) -> Callable[..., Label]:
    def dependency(
        label_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Label:
        board_id = db.scalar(select(Label.board_id).where(Label.id == label_id))
        load_board(db, board_id, user.id, minimum, "Label not found")
        label = db.get(Label, label_id)
        if label is None:  # deleted while this request waited for the lock
            raise HTTPException(status_code=404, detail="Label not found")
        return label

    return dependency


def comment_access(minimum: BoardRole) -> Callable[..., Comment]:
    def dependency(
        comment_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Comment:
        board_id = db.scalar(
            select(BoardList.board_id)
            .join(Card, Card.list_id == BoardList.id)
            .join(Comment, Comment.card_id == Card.id)
            .where(Comment.id == comment_id)
        )
        load_board(db, board_id, user.id, minimum, "Comment not found")
        comment = db.get(Comment, comment_id)
        if comment is None:  # deleted while this request waited for the lock
            raise HTTPException(status_code=404, detail="Comment not found")
        return comment

    return dependency


def checklist_access(minimum: BoardRole) -> Callable[..., Checklist]:
    def dependency(
        checklist_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> Checklist:
        board_id = db.scalar(
            select(BoardList.board_id)
            .join(Card, Card.list_id == BoardList.id)
            .join(Checklist, Checklist.card_id == Card.id)
            .where(Checklist.id == checklist_id)
        )
        load_board(db, board_id, user.id, minimum, "Checklist not found")
        checklist = db.get(Checklist, checklist_id)
        if checklist is None:  # deleted while this request waited for the lock
            raise HTTPException(status_code=404, detail="Checklist not found")
        return checklist

    return dependency


def checklist_item_access(minimum: BoardRole) -> Callable[..., ChecklistItem]:
    def dependency(
        item_id: int, user: CurrentUser, db: Session = Depends(get_db)
    ) -> ChecklistItem:
        board_id = db.scalar(
            select(BoardList.board_id)
            .join(Card, Card.list_id == BoardList.id)
            .join(Checklist, Checklist.card_id == Card.id)
            .join(ChecklistItem, ChecklistItem.checklist_id == Checklist.id)
            .where(ChecklistItem.id == item_id)
        )
        load_board(db, board_id, user.id, minimum, "Checklist item not found")
        item = db.get(ChecklistItem, item_id)
        if item is None:  # deleted while this request waited for the lock
            raise HTTPException(status_code=404, detail="Checklist item not found")
        return item

    return dependency


ViewableBoard = Annotated[Board, Depends(board_access(BoardRole.VIEWER))]
EditableBoard = Annotated[Board, Depends(board_access(BoardRole.EDITOR))]
OwnedBoard = Annotated[Board, Depends(board_access(BoardRole.OWNER))]
# Open or closed: for closing, reopening and deleting the board itself.
OwnedBoardAnyState = Annotated[
    Board, Depends(board_access(BoardRole.OWNER, allow_closed=True))
]
ViewableList = Annotated[BoardList, Depends(list_access(BoardRole.VIEWER))]
EditableList = Annotated[BoardList, Depends(list_access(BoardRole.EDITOR))]
ViewableCard = Annotated[Card, Depends(card_access(BoardRole.VIEWER))]
EditableCard = Annotated[Card, Depends(card_access(BoardRole.EDITOR))]
ViewableLabel = Annotated[Label, Depends(label_access(BoardRole.VIEWER))]
EditableLabel = Annotated[Label, Depends(label_access(BoardRole.EDITOR))]
ViewableComment = Annotated[Comment, Depends(comment_access(BoardRole.VIEWER))]
EditableComment = Annotated[Comment, Depends(comment_access(BoardRole.EDITOR))]
ViewableChecklist = Annotated[Checklist, Depends(checklist_access(BoardRole.VIEWER))]
EditableChecklist = Annotated[Checklist, Depends(checklist_access(BoardRole.EDITOR))]
EditableChecklistItem = Annotated[
    ChecklistItem, Depends(checklist_item_access(BoardRole.EDITOR))
]
