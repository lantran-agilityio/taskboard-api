import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.pagination import paginate


@pytest.fixture
def user_ids(db: Session) -> list[int]:
    users = [User(email=f"user{n}@example.com", hashed_password="x") for n in range(5)]
    db.add_all(users)
    db.flush()
    return [user.id for user in users]


def page(db: Session, limit: int, before: int | None = None) -> tuple[list, int | None]:
    result = paginate(db, select(User), User.id, limit, before)
    return [user.id for user in result.items], result.next_before


def test_first_page_is_the_newest(db: Session, user_ids: list[int]) -> None:
    assert page(db, 2) == ([user_ids[4], user_ids[3]], user_ids[3])


def test_before_continues_after_the_cursor(db: Session, user_ids: list[int]) -> None:
    assert page(db, 2, before=user_ids[3]) == ([user_ids[2], user_ids[1]], user_ids[1])


def test_last_page_has_no_cursor(db: Session, user_ids: list[int]) -> None:
    assert page(db, 2, before=user_ids[1]) == ([user_ids[0]], None)


def test_exactly_full_last_page_has_no_cursor(db: Session, user_ids: list[int]) -> None:
    assert page(db, 5) == (list(reversed(user_ids)), None)


def test_cursor_past_the_start_is_empty(db: Session, user_ids: list[int]) -> None:
    assert page(db, 2, before=user_ids[0]) == ([], None)
