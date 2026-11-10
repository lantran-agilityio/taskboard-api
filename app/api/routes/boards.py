from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.access import EditableBoard, OwnedBoard, ViewableBoard
from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models.board import Board
from app.models.board_member import BoardMember, BoardRole
from app.models.label import Label, LabelColor
from app.realtime.events import EventType, publish
from app.schemas.board import BoardCreate, BoardRead, BoardUpdate
from app.services.permissions import board_role
from app.services.stars import is_starred, star, starred_ids, unstar

router = APIRouter(prefix="/boards", tags=["boards"])


def board_read(board: Board, starred: bool) -> BoardRead:
    # Built by hand because `starred` depends on who asks, not on the board row.
    return BoardRead(
        id=board.id,
        name=board.name,
        description=board.description,
        created_at=board.created_at,
        starred=starred,
    )


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
def create_board(
    payload: BoardCreate, user: CurrentUser, db: Session = Depends(get_db)
) -> BoardRead:
    board = Board(name=payload.name, description=payload.description, owner=user)
    # One unnamed label per colour, in the enum's order, so cards can be tagged at once.
    # No events: nobody can be watching a board that doesn't exist yet.
    board.labels = [Label(name="", color=color) for color in LabelColor]
    db.add(board)
    db.commit()
    db.refresh(board)
    return board_read(board, starred=False)


@router.get("", response_model=list[BoardRead])
def list_boards(user: CurrentUser, db: Session = Depends(get_db)) -> list[BoardRead]:
    # Boards the user owns or is a member of.
    boards = db.scalars(
        select(Board)
        .where(
            or_(
                Board.owner_id == user.id,
                Board.members.any(BoardMember.user_id == user.id),
            )
        )
        .order_by(Board.id)
    ).all()
    # One query for all the stars, not one per board.
    starred = starred_ids(db, user.id, [board.id for board in boards])
    return [board_read(board, board.id in starred) for board in boards]


@router.get("/{board_id}", response_model=BoardRead)
def get_board(
    board: ViewableBoard, user: CurrentUser, db: Session = Depends(get_db)
) -> BoardRead:
    return board_read(board, is_starred(db, board.id, user.id))


@router.patch("/{board_id}", response_model=BoardRead)
def update_board(
    payload: BoardUpdate,
    board: EditableBoard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> BoardRead:
    # Editors can change the description; only the owner renames.
    if "name" in payload.model_fields_set and board_role(board, user.id) != (
        BoardRole.OWNER
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires the {BoardRole.OWNER} role",
        )
    if payload.name is not None:
        board.name = payload.name
    # Checked by name, because description=None means "clear it".
    if "description" in payload.model_fields_set:
        board.description = payload.description
    db.flush()
    publish(
        db,
        board.id,
        EventType.BOARD_UPDATED,
        # Without `starred`: the event goes to everyone, and stars are per user.
        {
            "board": board_read(board, starred=False).model_dump(
                mode="json", exclude={"starred"}
            )
        },
        actor_id=user.id,
    )
    db.commit()
    db.refresh(board)
    return board_read(board, is_starred(db, board.id, user.id))


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    board: OwnedBoard, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    # Before deleting, so watchers learn why their sockets are about to close.
    publish(db, board.id, EventType.BOARD_DELETED, {}, actor_id=user.id)
    db.delete(board)
    db.commit()


# Anyone on the board can star it, viewers included. No event: stars are per user,
# and nobody else's view of the board changes.
@router.put("/{board_id}/star", status_code=status.HTTP_204_NO_CONTENT)
def star_board(
    board: ViewableBoard, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    star(db, board.id, user.id)
    db.commit()


@router.delete("/{board_id}/star", status_code=status.HTTP_204_NO_CONTENT)
def unstar_board(
    board: ViewableBoard, user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    unstar(db, board.id, user.id)
    db.commit()
