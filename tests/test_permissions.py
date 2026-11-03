import pytest

from app.models.board import Board
from app.models.board_member import BoardMember, BoardRole
from app.services.permissions import allows, board_role


def make_board() -> Board:
    # Transient objects, never added to a session: the rules need no database.
    return Board(
        name="X",
        owner_id=1,
        members=[
            BoardMember(user_id=2, role=BoardRole.EDITOR),
            BoardMember(user_id=3, role=BoardRole.VIEWER),
        ],
    )


@pytest.mark.parametrize(
    ("user_id", "expected"),
    [
        (1, BoardRole.OWNER),
        (2, BoardRole.EDITOR),
        (3, BoardRole.VIEWER),
        (4, None),
    ],
)
def test_board_role(user_id: int, expected: BoardRole | None) -> None:
    assert board_role(make_board(), user_id) == expected


@pytest.mark.parametrize(
    ("role", "minimum", "expected"),
    [
        (BoardRole.VIEWER, BoardRole.VIEWER, True),
        (BoardRole.VIEWER, BoardRole.EDITOR, False),
        (BoardRole.EDITOR, BoardRole.EDITOR, True),
        (BoardRole.EDITOR, BoardRole.OWNER, False),
        (BoardRole.OWNER, BoardRole.VIEWER, True),
        (BoardRole.OWNER, BoardRole.OWNER, True),
    ],
)
def test_allows(role: BoardRole, minimum: BoardRole, expected: bool) -> None:
    assert allows(role, minimum) is expected
