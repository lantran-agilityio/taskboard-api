from collections.abc import Sequence
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import AwareDatetime
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.access import (
    EditableCard,
    EditableList,
    ViewableBoard,
    ViewableCard,
    ViewableList,
)
from app.api.errors import body_validation_error
from app.core.database import get_db
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.card import Card
from app.models.label import Label
from app.models.user import User
from app.realtime.events import EventType, card_order, publish
from app.schemas.card import CardCreate, CardRead, CardUpdate
from app.services.card_details import resolve_assignees, resolve_labels
from app.services.ordering import move_item, renumber, transfer_item

# Cards are created and listed through their list...
list_cards_router = APIRouter(prefix="/lists/{list_id}/cards", tags=["cards"])
# ...and read, changed and deleted by their own id...
router = APIRouter(prefix="/cards", tags=["cards"])
# ...and searched across a whole board.
board_cards_router = APIRouter(prefix="/boards/{board_id}/cards", tags=["cards"])


def card_details(
    db: Session,
    board: Board,
    label_ids: list[int] | None,
    assignee_ids: list[int] | None,
) -> tuple[list[Label] | None, list[User] | None]:
    """The labels and assignees to set (None: leave as is); 422 if invalid."""
    try:
        labels = None if label_ids is None else resolve_labels(board, label_ids)
    except ValueError as error:
        raise body_validation_error("label_ids", str(error), label_ids) from error
    try:
        assignees = (
            None if assignee_ids is None else resolve_assignees(db, board, assignee_ids)
        )
    except ValueError as error:
        raise body_validation_error("assignee_ids", str(error), assignee_ids) from error
    return labels, assignees


@list_cards_router.post(
    "", response_model=CardRead, status_code=status.HTTP_201_CREATED
)
def create_card(
    payload: CardCreate,
    board_list: EditableList,
    db: Session = Depends(get_db),
) -> Card:
    labels, assignees = card_details(
        db, board_list.board, payload.label_ids, payload.assignee_ids
    )
    position = max((card.position for card in board_list.cards), default=-1) + 1
    card = Card(
        title=payload.title,
        description=payload.description,
        position=position,
        due_at=payload.due_at,
        labels=labels,
        assignees=assignees,
    )
    board_list.cards.append(card)
    db.flush()  # gives the new card its id for the event
    publish_card(db, EventType.CARD_CREATED, card, [board_list])
    db.commit()
    db.refresh(card)
    return card


@list_cards_router.get("", response_model=list[CardRead])
def list_cards(board_list: ViewableList) -> Sequence[Card]:
    return board_list.cards


@router.get("/{card_id}", response_model=CardRead)
def get_card(card: ViewableCard) -> Card:
    return card


@board_cards_router.get("", response_model=list[CardRead])
def search_cards(
    board: ViewableBoard,
    label_id: Annotated[int | None, Query(ge=1)] = None,
    assignee_id: Annotated[int | None, Query(ge=1)] = None,
    due_before: AwareDatetime | None = None,
    db: Session = Depends(get_db),
) -> Sequence[Card]:
    """The board's cards in board order, narrowed by every filter given."""
    query = (
        select(Card)
        .join(Card.board_list)
        .where(BoardList.board_id == board.id)
        .order_by(BoardList.position, Card.position)
    )
    if label_id is not None:
        query = query.where(Card.labels.any(Label.id == label_id))
    if assignee_id is not None:
        query = query.where(Card.assignees.any(User.id == assignee_id))
    if due_before is not None:
        query = query.where(Card.due_at < due_before)
    return db.scalars(query).all()


def publish_card(
    db: Session, event_type: EventType, card: Card, lists: list[BoardList]
) -> None:
    publish(
        db,
        card.board_list.board_id,
        event_type,
        {
            "card": CardRead.model_validate(card).model_dump(mode="json"),
            "lists": [card_order(board_list) for board_list in lists],
        },
    )


def find_target_list(card: Card, list_id: int | None, db: Session) -> BoardList:
    """The list the card should end up in; 422 if it isn't on the card's board."""
    if list_id is None:
        return card.board_list
    target = db.get(BoardList, list_id)
    if target is None or target.board_id != card.board_list.board_id:
        raise body_validation_error(
            "list_id", "List not found on this card's board", list_id
        )
    return target


@router.patch("/{card_id}", response_model=CardRead)
def update_card(
    payload: CardUpdate,
    card: EditableCard,
    db: Session = Depends(get_db),
) -> Card:
    # Check everything before changing anything, so a 422 leaves the card as it was.
    labels, assignees = card_details(
        db, card.board_list.board, payload.label_ids, payload.assignee_ids
    )
    # Move first: if the list or position is invalid, nothing has changed yet.
    current = card.board_list
    target = find_target_list(card, payload.list_id, db)
    try:
        if target is not current:
            position = (
                payload.position if payload.position is not None else len(target.cards)
            )
            transfer_item(current.cards, target.cards, card, position)
            # back_populates also moves the card between the two `cards` lists.
            card.board_list = target
        elif payload.position is not None:
            move_item(current.cards, card, payload.position)
    except ValueError as error:
        raise body_validation_error("position", str(error), payload.position) from error
    if payload.title is not None:
        card.title = payload.title
    # Checked by name, because description=None means "clear it".
    if "description" in payload.model_fields_set:
        card.description = payload.description
    if "due_at" in payload.model_fields_set:
        card.due_at = payload.due_at
    if payload.due_complete is not None:
        card.due_complete = payload.due_complete
    if labels is not None:
        card.labels = labels
    if assignees is not None:
        card.assignees = assignees
    db.flush()
    # A cross-list move changes the order of both lists.
    affected = [current] if target is current else [current, target]
    publish_card(db, EventType.CARD_UPDATED, card, affected)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card: EditableCard, db: Session = Depends(get_db)) -> None:
    board_list = card.board_list
    board_list.cards.remove(card)  # delete-orphan deletes it on commit
    renumber(board_list.cards)
    db.flush()
    publish(
        db,
        board_list.board_id,
        EventType.CARD_DELETED,
        {"card_id": card.id, "lists": [card_order(board_list)]},
    )
    db.commit()
