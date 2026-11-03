from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.access import OwnedBoard, ViewableBoard
from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models.board import Board
from app.models.board_member import BoardMember
from app.schemas.board import BoardCreate, BoardRead, BoardUpdate

router = APIRouter(prefix="/boards", tags=["boards"])


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
def create_board(
    payload: BoardCreate, user: CurrentUser, db: Session = Depends(get_db)
) -> Board:
    board = Board(name=payload.name, owner=user)
    db.add(board)
    db.commit()
    db.refresh(board)
    return board


@router.get("", response_model=list[BoardRead])
def list_boards(user: CurrentUser, db: Session = Depends(get_db)) -> Sequence[Board]:
    # Boards the user owns or is a member of.
    return db.scalars(
        select(Board)
        .where(
            or_(
                Board.owner_id == user.id,
                Board.members.any(BoardMember.user_id == user.id),
            )
        )
        .order_by(Board.id)
    ).all()


@router.get("/{board_id}", response_model=BoardRead)
def get_board(board: ViewableBoard) -> Board:
    return board


@router.patch("/{board_id}", response_model=BoardRead)
def rename_board(
    payload: BoardUpdate,
    board: OwnedBoard,
    db: Session = Depends(get_db),
) -> Board:
    board.name = payload.name
    db.commit()
    db.refresh(board)
    return board


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board: OwnedBoard, db: Session = Depends(get_db)) -> None:
    db.delete(board)
    db.commit()
