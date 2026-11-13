"""Check and apply a card's labels and assignees."""

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.board import Board
from app.models.board_list import BoardList
from app.models.card import Card
from app.models.card_details import card_assignees
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.models.label import Label
from app.models.user import User
from app.services.permissions import board_role


def resolve_labels(board: Board, ids: list[int]) -> list[Label]:
    """The board's labels with these ids; ValueError if any isn't on the board."""
    by_id = {label.id: label for label in board.labels}
    missing = [label_id for label_id in ids if label_id not in by_id]
    if missing:
        raise ValueError(f"Labels not found on this board: {missing}")
    return [by_id[label_id] for label_id in ids]


def resolve_assignees(db: Session, board: Board, ids: list[int]) -> list[User]:
    """The users with these ids; ValueError unless each is on the board."""
    users = {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids)))}
    missing = [
        user_id
        for user_id in ids
        if user_id not in users or board_role(board, user_id) is None
    ]
    if missing:
        raise ValueError(f"Users not on this board: {missing}")
    return [users[user_id] for user_id in ids]


def unassign_from_board(db: Session, board_id: int, user_id: int) -> None:
    """Remove the user from every card and checklist item on the board (they're
    leaving it)."""
    board_cards = select(Card.id).join(BoardList).where(BoardList.board_id == board_id)
    db.execute(
        delete(card_assignees).where(
            card_assignees.c.user_id == user_id,
            card_assignees.c.card_id.in_(board_cards),
        )
    )
    board_checklists = select(Checklist.id).where(Checklist.card_id.in_(board_cards))
    db.execute(
        update(ChecklistItem)
        .where(
            ChecklistItem.assignee_id == user_id,
            ChecklistItem.checklist_id.in_(board_checklists),
        )
        .values(assignee_id=None)
        # The items aren't loaded here, so there's nothing in the session to sync.
        .execution_options(synchronize_session=False)
    )
