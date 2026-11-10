"""Per-user board stars. Each user sees only their own, so nothing is published."""

from collections.abc import Iterable

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models.board_star import board_stars


def star(db: Session, board_id: int, user_id: int) -> None:
    # ON CONFLICT DO NOTHING: starring twice, even from two requests at once,
    # leaves one row instead of failing on the primary key.
    db.execute(
        insert(board_stars)
        .values(board_id=board_id, user_id=user_id)
        .on_conflict_do_nothing()
    )


def unstar(db: Session, board_id: int, user_id: int) -> None:
    db.execute(
        delete(board_stars).where(
            board_stars.c.board_id == board_id, board_stars.c.user_id == user_id
        )
    )


def starred_ids(db: Session, user_id: int, board_ids: Iterable[int]) -> set[int]:
    """The ids, out of board_ids, of the boards the user has starred."""
    return set(
        db.scalars(
            select(board_stars.c.board_id).where(
                board_stars.c.user_id == user_id,
                board_stars.c.board_id.in_(list(board_ids)),
            )
        )
    )


def is_starred(db: Session, board_id: int, user_id: int) -> bool:
    return board_id in starred_ids(db, user_id, [board_id])
