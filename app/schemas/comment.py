from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.common import UtcDatetime

Body = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]


class CommentCreate(BaseModel):
    body: Body


class CommentUpdate(BaseModel):
    body: Body


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    card_id: int
    author_id: int
    body: str
    created_at: UtcDatetime
    edited_at: UtcDatetime | None
