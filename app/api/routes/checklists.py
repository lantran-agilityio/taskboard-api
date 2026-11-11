from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.access import (
    EditableCard,
    EditableChecklist,
    EditableChecklistItem,
    ViewableCard,
    ViewableChecklist,
)
from app.api.deps import CurrentUser
from app.api.errors import body_validation_error, check_not_frozen
from app.core.database import get_db
from app.models.card import Card
from app.models.checklist import Checklist
from app.models.checklist_item import ChecklistItem
from app.realtime.events import EventType, publish
from app.schemas.checklist import (
    ChecklistCreate,
    ChecklistItemRead,
    ChecklistRead,
    ChecklistUpdate,
    ItemCreate,
    ItemUpdate,
)
from app.services.ordering import move_item, remove_item

# Checklists are added and read through their card...
card_checklists_router = APIRouter(
    prefix="/cards/{card_id}/checklists", tags=["checklists"]
)
# ...read, changed and deleted by their own id, and items are added there...
router = APIRouter(prefix="/checklists", tags=["checklists"])
# ...and items are changed and deleted by their own id.
items_router = APIRouter(prefix="/checklist-items", tags=["checklists"])


def board_id_of(card: Card) -> int:
    return card.board_list.board_id


def checklist_ids(card: Card) -> list[int]:
    return [checklist.id for checklist in card.checklists]


def item_ids(checklist: Checklist) -> list[int]:
    return [item.id for item in checklist.items]


def publish_checklist(
    db: Session, event_type: EventType, checklist: Checklist, actor_id: int
) -> None:
    # card_id at the top level, so the card's activity filter finds the entry.
    card = checklist.card
    publish(
        db,
        board_id_of(card),
        event_type,
        {
            "card_id": card.id,
            "checklist": ChecklistRead.model_validate(checklist).model_dump(
                mode="json"
            ),
            "checklist_ids": checklist_ids(card),
        },
        actor_id=actor_id,
    )


def publish_item(
    db: Session, event_type: EventType, item: ChecklistItem, actor_id: int
) -> None:
    checklist = item.checklist
    publish(
        db,
        board_id_of(checklist.card),
        event_type,
        {
            "card_id": checklist.card_id,
            "item": ChecklistItemRead.model_validate(item).model_dump(mode="json"),
            "item_ids": item_ids(checklist),
        },
        actor_id=actor_id,
    )


# Checklists


@card_checklists_router.post(
    "", response_model=ChecklistRead, status_code=status.HTTP_201_CREATED
)
def create_checklist(
    payload: ChecklistCreate,
    card: EditableCard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Checklist:
    check_not_frozen(card, "card_id", card.id)
    checklist = Checklist(title=payload.title, position=len(card.checklists))
    card.checklists.append(checklist)
    db.flush()  # gives the new checklist its id for the event
    publish_checklist(db, EventType.CHECKLIST_CREATED, checklist, user.id)
    db.commit()
    db.refresh(checklist)
    return checklist


@card_checklists_router.get("", response_model=list[ChecklistRead])
def list_checklists(card: ViewableCard) -> list[Checklist]:
    """The card's checklists in order, each with its items in order."""
    return card.checklists


@router.get("/{checklist_id}", response_model=ChecklistRead)
def get_checklist(checklist: ViewableChecklist) -> Checklist:
    return checklist


@router.patch("/{checklist_id}", response_model=ChecklistRead)
def update_checklist(
    payload: ChecklistUpdate,
    checklist: EditableChecklist,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> Checklist:
    card = checklist.card
    check_not_frozen(card, "checklist_id", checklist.id)
    # Move first: if the position is invalid, nothing has changed yet.
    if payload.position is not None:
        try:
            move_item(card.checklists, checklist, payload.position)
        except ValueError as error:
            raise body_validation_error(
                "position", str(error), payload.position
            ) from error
        # move_item changes positions only; reorder the loaded list to match,
        # so the event's checklist_ids are in the new order.
        card.checklists.sort(key=lambda other: other.position)
    if payload.title is not None:
        checklist.title = payload.title
    db.flush()
    publish_checklist(db, EventType.CHECKLIST_UPDATED, checklist, user.id)
    db.commit()
    db.refresh(checklist)
    return checklist


@router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist(
    checklist: EditableChecklist, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    card = checklist.card
    check_not_frozen(card, "checklist_id", checklist.id)
    remove_item(card.checklists, checklist)
    card.checklists.remove(checklist)  # delete-orphan deletes it on flush
    db.flush()
    publish(
        db,
        board_id_of(card),
        EventType.CHECKLIST_DELETED,
        # The title too, so the activity log can still say what was deleted.
        {
            "card_id": card.id,
            "checklist_id": checklist.id,
            "title": checklist.title,
            "checklist_ids": checklist_ids(card),
        },
        actor_id=user.id,
    )
    db.commit()


# Items


@router.post(
    "/{checklist_id}/items",
    response_model=ChecklistItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_item(
    payload: ItemCreate,
    checklist: EditableChecklist,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> ChecklistItem:
    check_not_frozen(checklist.card, "checklist_id", checklist.id)
    item = ChecklistItem(text=payload.text, position=len(checklist.items))
    checklist.items.append(item)
    db.flush()  # gives the new item its id for the event
    publish_item(db, EventType.CHECKLIST_ITEM_CREATED, item, user.id)
    db.commit()
    db.refresh(item)
    return item


@items_router.patch("/{item_id}", response_model=ChecklistItemRead)
def update_item(
    payload: ItemUpdate,
    item: EditableChecklistItem,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> ChecklistItem:
    checklist = item.checklist
    check_not_frozen(checklist.card, "item_id", item.id)
    # Move first: if the position is invalid, nothing has changed yet.
    if payload.position is not None:
        try:
            move_item(checklist.items, item, payload.position)
        except ValueError as error:
            raise body_validation_error(
                "position", str(error), payload.position
            ) from error
        # As for checklists: so the event's item_ids are in the new order.
        checklist.items.sort(key=lambda other: other.position)
    if payload.text is not None:
        item.text = payload.text
    if payload.done is not None:
        item.done = payload.done
    db.flush()
    publish_item(db, EventType.CHECKLIST_ITEM_UPDATED, item, user.id)
    db.commit()
    db.refresh(item)
    return item


@items_router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item: EditableChecklistItem, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    checklist = item.checklist
    check_not_frozen(checklist.card, "item_id", item.id)
    remove_item(checklist.items, item)
    checklist.items.remove(item)  # delete-orphan deletes it on flush
    db.flush()
    publish(
        db,
        board_id_of(checklist.card),
        EventType.CHECKLIST_ITEM_DELETED,
        # The text too, so the activity log can still say what was deleted.
        {
            "card_id": checklist.card_id,
            "checklist_id": checklist.id,
            "item_id": item.id,
            "text": item.text,
            "item_ids": item_ids(checklist),
        },
        actor_id=user.id,
    )
    db.commit()
