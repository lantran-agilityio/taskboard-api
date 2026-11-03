from app.models.board import Board
from app.models.board_member import BoardRole

RANK = {BoardRole.VIEWER: 0, BoardRole.EDITOR: 1, BoardRole.OWNER: 2}


def board_role(board: Board, user_id: int) -> BoardRole | None:
    """The user's role on the board, or None if they are not on it."""
    if board.owner_id == user_id:
        return BoardRole.OWNER
    for member in board.members:
        if member.user_id == user_id:
            return member.role
    return None


def allows(role: BoardRole, minimum: BoardRole) -> bool:
    return RANK[role] >= RANK[minimum]
