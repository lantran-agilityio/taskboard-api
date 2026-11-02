from collections.abc import Sequence

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.board import Board
from app.schemas.board import BoardCreate, BoardRead, BoardUpdate

router = APIRouter(prefix="/boards", tags=["boards"])


def get_board_or_404(board_id: int, db: Session = Depends(get_db)) -> Board:
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.post("", response_model=BoardRead, status_code=status.HTTP_201_CREATED)
def create_board(payload: BoardCreate, db: Session = Depends(get_db)) -> Board:
    board = Board(name=payload.name)
    db.add(board)
    db.commit()
    db.refresh(board)
    return board


@router.get("", response_model=list[BoardRead])
def list_boards(db: Session = Depends(get_db)) -> Sequence[Board]:
    return db.scalars(select(Board).order_by(Board.id)).all()


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
