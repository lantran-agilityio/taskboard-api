from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated, Any

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
from app.api.deps import CurrentUser
from app.api.errors import body_validation_error, validation_error
from app.core.database import get_db
from app.models.board import Board
from app.models.board_list import BoardList
from app.models.card import Card
from app.models.label import Label
from app.models.user import User
from app.realtime.events import EventType, card_order, changes_from, publish
from app.schemas.card import CardCreate, CardRead, CardUpdate
from app.services.card_details import resolve_assignees, resolve_labels
from app.services.ordering import insert_item, move_item, remove_item, transfer_item

# Cards are created and listed through their list...
list_cards_router = APIRouter(prefix="/lists/{list_id}/cards", tags=["cards"])
# ...and read, changed, archived and deleted by their own id...
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
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Card:
    if board_list.is_archived:
        raise validation_error(
            "path", "list_id", "List is archived; restore it first", board_list.id
        )
    check_dates(payload.start_at, payload.due_at, "start_at")
    labels, assignees = card_details(
        db, board_list.board, payload.label_ids, payload.assignee_ids
    )
    card = Card(
        title=payload.title,
        description=payload.description,
        position=len(board_list.active_cards),
        start_at=payload.start_at,
        due_at=payload.due_at,
        labels=labels,
        assignees=assignees,
    )
    board_list.cards.append(card)
    db.flush()  # gives the new card its id for the event
    publish_card(db, EventType.CARD_CREATED, card, [board_list], user.id)
    db.commit()
    db.refresh(card)
    return card


@list_cards_router.get("", response_model=list[CardRead])
def list_cards(
    board_list: ViewableList, archived: Annotated[bool, Query()] = False
) -> Sequence[Card]:
    """Active cards in position order, or archived ones newest first."""
    return board_list.archived_cards if archived else board_list.active_cards


@router.get("/{card_id}", response_model=CardRead)
def get_card(card: ViewableCard) -> Card:
    return card


@board_cards_router.get("", response_model=list[CardRead])
def search_cards(
    board: ViewableBoard,
    label_id: Annotated[int | None, Query(ge=1)] = None,
    assignee_id: Annotated[int | None, Query(ge=1)] = None,
    due_before: AwareDatetime | None = None,
    archived: Annotated[bool, Query()] = False,
    db: Session = Depends(get_db),
) -> Sequence[Card]:
    """The board's cards narrowed by every filter given.

    Active cards come in board order; archived=true gives the archived cards
    instead, newest first. Cards of archived lists are left out of both.
    """
    query = (
        select(Card)
        .join(Card.board_list)
        .where(BoardList.board_id == board.id, BoardList.archived_at.is_(None))
    )
    if archived:
        query = query.where(Card.archived_at.is_not(None)).order_by(
            Card.archived_at.desc()
        )
    else:
        query = query.where(Card.archived_at.is_(None)).order_by(
            BoardList.position, Card.position
        )
    if label_id is not None:
        query = query.where(Card.labels.any(Label.id == label_id))
    if assignee_id is not None:
        query = query.where(Card.assignees.any(User.id == assignee_id))
    if due_before is not None:
        query = query.where(Card.due_at < due_before)
    return db.scalars(query).all()


def check_dates(start_at: datetime | None, due_at: datetime | None, field: str) -> None:
    """A 422 on `field` (the date the request changed) if the start is after the due date."""
    if start_at is not None and due_at is not None and start_at > due_at:
        value = start_at if field == "start_at" else due_at
        raise body_validation_error(
            field, "The start date can't be after the due date", value.isoformat()
        )


def card_data(card: Card) -> dict[str, Any]:
    return CardRead.model_validate(card).model_dump(mode="json")


def publish_card(
    db: Session,
    event_type: EventType,
    card: Card,
    lists: list[BoardList],
    actor_id: int,
    before: dict[str, Any] | None = None,
) -> None:
    data: dict[str, Any] = {
        "card": card_data(card),
        "lists": [card_order(board_list) for board_list in lists],
    }
    if before is not None:
        data["previous"] = changes_from(before, data["card"])
    publish(db, card.board_list.board_id, event_type, data, actor_id=actor_id)


def find_target_list(card: Card, list_id: int | None, db: Session) -> BoardList:
    """The list the card should end up in; 422 if it isn't on the card's board."""
    if list_id is None:
        return card.board_list
    target = db.get(BoardList, list_id)
    if target is None or target.board_id != card.board_list.board_id:
        raise body_validation_error(
            "list_id", "List not found on this card's board", list_id
        )
    if target.is_archived:
        raise body_validation_error("list_id", "List is archived", list_id)
    return target


@router.patch("/{card_id}", response_model=CardRead)
def update_card(
    payload: CardUpdate,
    card: EditableCard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Card:
    # Check everything before changing anything, so a 422 leaves the card as it was.
    if card.is_frozen:
        raise validation_error(
            "path", "card_id", "Card or its list is archived; restore it first", card.id
        )
    sent = payload.model_fields_set
    check_dates(
        payload.start_at if "start_at" in sent else card.start_at,
        payload.due_at if "due_at" in sent else card.due_at,
        # Blame the start when it was sent, else the due date that moved before it.
        "start_at" if "start_at" in sent else "due_at",
    )
    labels, assignees = card_details(
        db, card.board_list.board, payload.label_ids, payload.assignee_ids
    )
    before = card_data(card)
    # Move first: if the list or position is invalid, nothing has changed yet.
    current = card.board_list
    target = find_target_list(card, payload.list_id, db)
    try:
        if target is not current:
            position = (
                payload.position
                if payload.position is not None
                else len(target.active_cards)
            )
            transfer_item(current.active_cards, target.active_cards, card, position)
            # back_populates also moves the card between the two `cards` lists.
            card.board_list = target
        elif payload.position is not None:
            move_item(current.active_cards, card, payload.position)
    except ValueError as error:
        raise body_validation_error("position", str(error), payload.position) from error
    if payload.title is not None:
        card.title = payload.title
    # Checked by name, because description=None means "clear it".
    if "description" in sent:
        card.description = payload.description
    if "start_at" in sent:
        card.start_at = payload.start_at
    if "due_at" in sent:
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
    publish_card(db, EventType.CARD_UPDATED, card, affected, user.id, before)
    db.commit()
    db.refresh(card)
    return card


@router.post("/{card_id}/archive", response_model=CardRead)
def archive_card(
    card: EditableCard, user: CurrentUser, db: Session = Depends(get_db)
) -> Card:
    board_list = card.board_list
    if card.is_archived:
        raise validation_error("path", "card_id", "Card is already archived", card.id)
    if board_list.is_archived:
        raise validation_error("path", "card_id", "Card's list is archived", card.id)
    remove_item(board_list.active_cards, card)
    card.archived_position = card.position
    card.position = None
    card.archived_at = datetime.now(UTC)
    db.flush()
    publish_card(db, EventType.CARD_ARCHIVED, card, [board_list], user.id)
    db.commit()
    db.refresh(card)
    return card


@router.post("/{card_id}/restore", response_model=CardRead)
def restore_card(
    card: EditableCard, user: CurrentUser, db: Session = Depends(get_db)
) -> Card:
    board_list = card.board_list
    if not card.is_archived:
        raise validation_error("path", "card_id", "Card is not archived", card.id)
    if board_list.is_archived:
        raise validation_error(
            "path", "card_id", "Card's list is archived; restore it first", card.id
        )
    active_cards = board_list.active_cards
    # Back where it was, or at the end if the list has fewer cards now (or the
    # card was archived before positions were saved).
    position = card.archived_position
    insert_item(active_cards, card, len(active_cards) if position is None else position)
    card.archived_at = None
    card.archived_position = None
    db.flush()
    publish_card(db, EventType.CARD_RESTORED, card, [board_list], user.id)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    card: EditableCard, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    board_list = card.board_list
    # Only archived cards have no position; a card in an archived list still
    # does, and its list must stay dense for when the list is restored.
    if not card.is_archived:
        remove_item(board_list.active_cards, card)
    board_list.cards.remove(card)  # delete-orphan deletes it on commit
    db.flush()
    publish(
        db,
        board_list.board_id,
        EventType.CARD_DELETED,
        # The title too, so the activity log can still say what was deleted.
        {"card_id": card.id, "title": card.title, "lists": [card_order(board_list)]},
        actor_id=user.id,
    )
    db.commit()
