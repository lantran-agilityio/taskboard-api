from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.access import ViewableBoard
from app.api.deps import Pagination
from app.core.database import get_db
from app.models.activity import Activity
from app.schemas.activity import ActivityRead
from app.schemas.page import Page
from app.services.pagination import PageResult, paginate

router = APIRouter(prefix="/boards/{board_id}/activity", tags=["activity"])


@router.get("", response_model=Page[ActivityRead])
def list_activity(
    board: ViewableBoard, page: Pagination, db: Session = Depends(get_db)
) -> PageResult[Activity]:
    """Everything that happened on the board, newest first."""
    query = select(Activity).where(Activity.board_id == board.id)
    return paginate(db, query, Activity.id, page.limit, page.before)
