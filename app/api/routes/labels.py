from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.access import EditableBoard, EditableLabel, ViewableBoard, ViewableLabel
from app.core.database import get_db
from app.models.label import Label
from app.realtime.events import EventType, publish
from app.schemas.label import LabelCreate, LabelRead, LabelUpdate

# Labels are created and listed through their board...
board_labels_router = APIRouter(prefix="/boards/{board_id}/labels", tags=["labels"])
# ...and read, changed and deleted by their own id.
router = APIRouter(prefix="/labels", tags=["labels"])


def publish_label(db: Session, event_type: EventType, label: Label) -> None:
    data = {"label": LabelRead.model_validate(label).model_dump(mode="json")}
    publish(db, label.board_id, event_type, data)


@board_labels_router.post(
    "", response_model=LabelRead, status_code=status.HTTP_201_CREATED
)
def create_label(
    payload: LabelCreate, board: EditableBoard, db: Session = Depends(get_db)
) -> Label:
    label = Label(name=payload.name, color=payload.color)
    board.labels.append(label)
    db.flush()  # gives the new label its id for the event
    publish_label(db, EventType.LABEL_CREATED, label)
    db.commit()
    return label


@board_labels_router.get("", response_model=list[LabelRead])
def list_labels(board: ViewableBoard) -> Sequence[Label]:
    return board.labels


@router.get("/{label_id}", response_model=LabelRead)
def get_label(label: ViewableLabel) -> Label:
    return label


@router.patch("/{label_id}", response_model=LabelRead)
def update_label(
    payload: LabelUpdate, label: EditableLabel, db: Session = Depends(get_db)
) -> Label:
    if payload.name is not None:
        label.name = payload.name
    if payload.color is not None:
        label.color = payload.color
    db.flush()
    publish_label(db, EventType.LABEL_UPDATED, label)
    db.commit()
    return label


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(label: EditableLabel, db: Session = Depends(get_db)) -> None:
    # Also removes it from every card (its card_labels rows go with it).
    db.delete(label)
    db.flush()
    publish(db, label.board_id, EventType.LABEL_DELETED, {"label_id": label.id})
    db.commit()
