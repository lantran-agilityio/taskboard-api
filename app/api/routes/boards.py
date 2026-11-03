from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.database import get_db
from app.models.board import Board
from app.schemas.board import BoardCreate, BoardRead, BoardUpdate

router = APIRouter(prefix="/boards", tags=["boards"])


def get_board_or_404(
    board_id: int, user: CurrentUser, db: Session = Depends(get_db)
) -> Board:
    board = db.get(Board, board_id)
    # Someone else's board is reported as missing, so its existence stays hidden.
    if board is None or board.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


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
    return db.scalars(
        select(Board).where(Board.owner_id == user.id).order_by(Board.id)
    ).all()


@router.get("/{board_id}", response_model=BoardRead)
def get_board(board: Board = Depends(get_board_or_404)) -> Board:
    return board


@router.patch("/{board_id}", response_model=BoardRead)
def rename_board(
    payload: BoardUpdate,
    board: Board = Depends(get_board_or_404),
    db: Session = Depends(get_db),
) -> Board:
    board.name = payload.name
    db.commit()
    db.refresh(board)
    return board


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    board: Board = Depends(get_board_or_404), db: Session = Depends(get_db)
) -> None:
    db.delete(board)
    db.commit()
