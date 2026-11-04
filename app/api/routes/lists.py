from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.access import EditableBoard, EditableList, ViewableBoard, ViewableList
from app.api.errors import body_validation_error
from app.core.database import get_db
from app.models.board_list import BoardList
from app.realtime.events import EventType, list_order, publish
from app.schemas.board_list import ListCreate, ListRead, ListUpdate
from app.services.ordering import move_item, renumber

# Lists are created and listed through their board...
board_lists_router = APIRouter(prefix="/boards/{board_id}/lists", tags=["lists"])
# ...and read, changed and deleted by their own id.
router = APIRouter(prefix="/lists", tags=["lists"])


def publish_list(db: Session, event_type: EventType, board_list: BoardList) -> None:
    publish(
        db,
        board_list.board_id,
        event_type,
        {
            "list": ListRead.model_validate(board_list).model_dump(mode="json"),
            "list_ids": list_order(board_list.board),
        },
    )


@board_lists_router.post(
    "", response_model=ListRead, status_code=status.HTTP_201_CREATED
)
def create_list(
    payload: ListCreate,
    board: EditableBoard,
    db: Session = Depends(get_db),
) -> BoardList:
    position = max((item.position for item in board.lists), default=-1) + 1
    board_list = BoardList(name=payload.name, position=position)
    board.lists.append(board_list)
    db.flush()  # gives the new list its id for the event
    publish_list(db, EventType.LIST_CREATED, board_list)
    db.commit()
    db.refresh(board_list)
    return board_list


@board_lists_router.get("", response_model=list[ListRead])
def list_lists(board: ViewableBoard) -> Sequence[BoardList]:
    return board.lists


@router.get("/{list_id}", response_model=ListRead)
def get_list(board_list: ViewableList) -> BoardList:
    return board_list


@router.patch("/{list_id}", response_model=ListRead)
def update_list(
    payload: ListUpdate,
    board_list: EditableList,
    db: Session = Depends(get_db),
) -> BoardList:
    # Move first: if the position is invalid, nothing has changed yet.
    if payload.position is not None:
        try:
            move_item(board_list.board.lists, board_list, payload.position)
        except ValueError as error:
            raise body_validation_error(
                "position", str(error), payload.position
            ) from error
    if payload.name is not None:
        board_list.name = payload.name
    db.flush()
    publish_list(db, EventType.LIST_UPDATED, board_list)
    db.commit()
    db.refresh(board_list)
    return board_list


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(board_list: EditableList, db: Session = Depends(get_db)) -> None:
    board = board_list.board
    board.lists.remove(board_list)  # delete-orphan deletes it on commit
    renumber(board.lists)
    db.flush()
    publish(
        db,
        board.id,
        EventType.LIST_DELETED,
        {"list_id": board_list.id, "list_ids": list_order(board)},
    )
    db.commit()
