from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.access import EditableBoard, EditableList, ViewableBoard, ViewableList
from app.api.deps import CurrentUser
from app.api.errors import body_validation_error, validation_error
from app.core.database import get_db
from app.models.board_list import BoardList
from app.models.card import Card
from app.realtime.events import (
    EventType,
    card_order,
    changes_from,
    list_order,
    publish,
)
from app.schemas.board_list import ListCreate, ListRead, ListSort, ListUpdate, SortBy
from app.schemas.card import CardRead
from app.services.ordering import insert_item, move_item, remove_item, sort_items

# Lists are created and listed through their board...
board_lists_router = APIRouter(prefix="/boards/{board_id}/lists", tags=["lists"])
# ...and read, changed, archived and deleted by their own id.
router = APIRouter(prefix="/lists", tags=["lists"])


def list_data(board_list: BoardList) -> dict[str, Any]:
    return ListRead.model_validate(board_list).model_dump(mode="json")


def publish_list(
    db: Session,
    event_type: EventType,
    board_list: BoardList,
    actor_id: int,
    before: dict[str, Any] | None = None,
) -> None:
    data: dict[str, Any] = {
        "list": list_data(board_list),
        "list_ids": list_order(board_list.board),
    }
    if before is not None:
        data["previous"] = changes_from(before, data["list"])
    publish(db, board_list.board_id, event_type, data, actor_id=actor_id)


def check_archived(board_list: BoardList, archived: bool, message: str) -> None:
    """422 on the path's list_id unless the list's archived state is `archived`."""
    if board_list.is_archived != archived:
        raise validation_error("path", "list_id", message, board_list.id)


@board_lists_router.post(
    "", response_model=ListRead, status_code=status.HTTP_201_CREATED
)
def create_list(
    payload: ListCreate,
    board: EditableBoard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> BoardList:
    board_list = BoardList(name=payload.name, position=len(board.active_lists))
    board.lists.append(board_list)
    db.flush()  # gives the new list its id for the event
    publish_list(db, EventType.LIST_CREATED, board_list, user.id)
    db.commit()
    db.refresh(board_list)
    return board_list


@board_lists_router.get("", response_model=list[ListRead])
def list_lists(
    board: ViewableBoard, archived: Annotated[bool, Query()] = False
) -> Sequence[BoardList]:
    """Active lists in position order, or archived ones newest first."""
    return board.archived_lists if archived else board.active_lists


@router.get("/{list_id}", response_model=ListRead)
def get_list(board_list: ViewableList) -> BoardList:
    return board_list


@router.patch("/{list_id}", response_model=ListRead)
def update_list(
    payload: ListUpdate,
    board_list: EditableList,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> BoardList:
    check_archived(board_list, False, "List is archived; restore it first")
    before = list_data(board_list)
    # Move first: if the position is invalid, nothing has changed yet.
    if payload.position is not None:
        try:
            move_item(board_list.board.active_lists, board_list, payload.position)
        except ValueError as error:
            raise body_validation_error(
                "position", str(error), payload.position
            ) from error
    if payload.name is not None:
        board_list.name = payload.name
    db.flush()
    publish_list(db, EventType.LIST_UPDATED, board_list, user.id, before)
    db.commit()
    db.refresh(board_list)
    return board_list


@router.post("/{list_id}/archive", response_model=ListRead)
def archive_list(
    board_list: EditableList, user: CurrentUser, db: Session = Depends(get_db)
) -> BoardList:
    check_archived(board_list, False, "List is already archived")
    remove_item(board_list.board.active_lists, board_list)
    board_list.archived_position = board_list.position
    board_list.position = None
    board_list.archived_at = datetime.now(UTC)
    db.flush()
    publish_list(db, EventType.LIST_ARCHIVED, board_list, user.id)
    db.commit()
    db.refresh(board_list)
    return board_list


@router.post("/{list_id}/restore", response_model=ListRead)
def restore_list(
    board_list: EditableList, user: CurrentUser, db: Session = Depends(get_db)
) -> BoardList:
    check_archived(board_list, True, "List is not archived")
    active_lists = board_list.board.active_lists
    # Back where it was, or at the end if the board has fewer lists now. Lists
    # archived before positions were saved have none, so they go at the end.
    position = board_list.archived_position
    insert_item(
        active_lists, board_list, len(active_lists) if position is None else position
    )
    board_list.archived_at = None
    board_list.archived_position = None
    db.flush()
    publish_list(db, EventType.LIST_RESTORED, board_list, user.id)
    db.commit()
    db.refresh(board_list)
    return board_list


SORT_KEYS: dict[SortBy, Callable[[Card], Any]] = {
    # Ties (same time or title) fall back to the id, so a sort is repeatable.
    SortBy.CREATED_DESC: lambda card: (-card.created_at.timestamp(), -card.id),
    SortBy.CREATED_ASC: lambda card: (card.created_at, card.id),
    SortBy.TITLE: lambda card: (card.title.casefold(), card.id),
}


@router.post("/{list_id}/sort", response_model=list[CardRead])
def sort_list(
    payload: ListSort,
    board_list: EditableList,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> list[Card]:
    """Reorder the list's cards once; cards added later still go at the end."""
    check_archived(board_list, False, "List is archived; restore it first")
    sort_items(board_list.active_cards, SORT_KEYS[payload.by])
    db.flush()
    publish(
        db,
        board_list.board_id,
        EventType.LIST_SORTED,
        {
            "list": ListRead.model_validate(board_list).model_dump(mode="json"),
            "by": payload.by,
            "lists": [card_order(board_list)],
        },
        actor_id=user.id,
    )
    db.commit()
    return board_list.active_cards


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(
    board_list: EditableList, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    board = board_list.board
    if not board_list.is_archived:
        remove_item(board.active_lists, board_list)
    board.lists.remove(board_list)  # delete-orphan deletes it on commit
    db.flush()
    publish(
        db,
        board.id,
        EventType.LIST_DELETED,
        # The name too, so the activity log can still say what was deleted.
        {
            "list_id": board_list.id,
            "name": board_list.name,
            "list_ids": list_order(board),
        },
        actor_id=user.id,
    )
    db.commit()
