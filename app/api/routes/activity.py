from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.access import ViewableBoard
from app.api.deps import Pagination
from app.core.database import get_db
from app.models.activity import Activity
from app.realtime.events import EventType
from app.schemas.activity import ActivityKind, ActivityRead
from app.schemas.page import Page
from app.services.activity import card_id_of
from app.services.pagination import PageResult, paginate

router = APIRouter(prefix="/boards/{board_id}/activity", tags=["activity"])

COMMENT_EVENTS = (
    EventType.COMMENT_CREATED,
    EventType.COMMENT_UPDATED,
    EventType.COMMENT_DELETED,
)


@router.get("", response_model=Page[ActivityRead])
def list_activity(
    board: ViewableBoard,
    page: Pagination,
    kind: ActivityKind = ActivityKind.ALL,
    card_id: Annotated[int | None, Query(ge=1)] = None,
    db: Session = Depends(get_db),
) -> PageResult[Activity]:
    """Everything that happened on the board, newest first.

    kind=comments keeps only comment entries; card_id keeps the entries about
    one card. card_id isn't checked against the board's cards, so a deleted
    card's history can still be read; the board scope keeps others' out.
    """
    query = select(Activity).where(Activity.board_id == board.id)
    if kind is ActivityKind.COMMENTS:
        query = query.where(Activity.type.in_(COMMENT_EVENTS))
    if card_id is not None:
        query = query.where(card_id_of(Activity.data) == card_id)
    return paginate(db, query, Activity.id, page.limit, page.before)
