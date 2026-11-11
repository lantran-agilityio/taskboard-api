from sqlalchemy import and_, distinct, func, select
from sqlalchemy.orm import Session

from app.models.board_list import BoardList
from app.models.card import Card


def board_counts(db: Session, board_ids: list[int]) -> dict[int, tuple[int, int]]:
    """Active lists and the active cards in them, per board, in one query.

    Boards with no active lists are left out; callers read them as (0, 0).
    """
    if not board_ids:
        return {}
    rows = db.execute(
        select(
            BoardList.board_id,
            func.count(distinct(BoardList.id)),
            func.count(Card.id),
        )
        # Outer join, so a list with no active cards still counts as a list.
        .outerjoin(Card, and_(Card.list_id == BoardList.id, Card.archived_at.is_(None)))
        .where(BoardList.board_id.in_(board_ids), BoardList.archived_at.is_(None))
        .group_by(BoardList.board_id)
    )
    return {board_id: (lists, cards) for board_id, lists, cards in rows}
