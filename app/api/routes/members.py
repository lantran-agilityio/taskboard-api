from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.access import OwnedBoard, ViewableBoard
from app.api.deps import CurrentUser
from app.api.errors import body_validation_error, validation_error
from app.core.database import get_db
from app.models.board import Board
from app.models.board_member import BoardMember, BoardRole
from app.models.user import User
from app.realtime.events import EventType, publish
from app.schemas.board_member import MemberCreate, MemberRead, MemberUpdate
from app.services.card_details import unassign_from_board
from app.services.permissions import board_role

router = APIRouter(prefix="/boards/{board_id}/members", tags=["members"])


def member_read(member: BoardMember) -> MemberRead:
    return MemberRead(user_id=member.user_id, email=member.user.email, role=member.role)


def publish_member(
    db: Session,
    board: Board,
    event_type: EventType,
    member: BoardMember,
    actor_id: int,
) -> None:
    data = {"member": member_read(member).model_dump(mode="json")}
    publish(db, board.id, event_type, data, actor_id=actor_id)


def find_member(board: Board, user_id: int) -> BoardMember:
    """The membership of user_id; 422 for the owner, 404 for anyone else."""
    if user_id == board.owner_id:
        raise validation_error(
            "path", "user_id", "The owner's membership can't be changed", user_id
        )
    for member in board.members:
        if member.user_id == user_id:
            return member
    raise HTTPException(status_code=404, detail="Member not found")


@router.get("", response_model=list[MemberRead])
def list_members(board: ViewableBoard) -> list[MemberRead]:
    owner = MemberRead(
        user_id=board.owner_id, email=board.owner.email, role=BoardRole.OWNER
    )
    return [owner, *(member_read(member) for member in board.members)]


@router.post("", response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def add_member(
    payload: MemberCreate,
    board: OwnedBoard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> MemberRead:
    new_user = db.scalar(select(User).where(User.email == payload.email))
    if new_user is None:
        raise body_validation_error("email", "No user with this email", payload.email)
    if board_role(board, new_user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already on this board",
        )
    member = BoardMember(user=new_user, role=payload.role)
    board.members.append(member)
    db.flush()
    publish_member(db, board, EventType.MEMBER_ADDED, member, user.id)
    db.commit()
    return member_read(member)


@router.patch("/{user_id}", response_model=MemberRead)
def change_role(
    user_id: int,
    payload: MemberUpdate,
    board: OwnedBoard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> MemberRead:
    member = find_member(board, user_id)
    member.role = payload.role
    db.flush()
    publish_member(db, board, EventType.MEMBER_UPDATED, member, user.id)
    db.commit()
    return member_read(member)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    user_id: int,
    board: ViewableBoard,
    user: CurrentUser,
    db: Session = Depends(get_db),
) -> None:
    # The owner can remove anyone; other members can only remove themselves.
    if user_id == board.owner_id:
        raise validation_error(
            "path", "user_id", "The owner can't leave the board", user_id
        )
    if user_id != user.id and user.id != board.owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Requires the owner role"
        )
    board.members.remove(find_member(board, user_id))  # delete-orphan deletes it
    unassign_from_board(db, board.id, user_id)
    db.flush()
    # Also closes that user's sockets on this board.
    publish(
        db, board.id, EventType.MEMBER_REMOVED, {"user_id": user_id}, actor_id=user.id
    )
    db.commit()
