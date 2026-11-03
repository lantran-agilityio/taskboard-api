from typing import Literal

from pydantic import BaseModel

from app.models.board_member import BoardRole
from app.schemas.user import Email

# The owner is set when the board is created, so it can't be given out here.
MemberRole = Literal[BoardRole.EDITOR, BoardRole.VIEWER]


class MemberCreate(BaseModel):
    email: Email
    role: MemberRole


class MemberUpdate(BaseModel):
    role: MemberRole


class MemberRead(BaseModel):
    user_id: int
    email: str
    role: BoardRole
