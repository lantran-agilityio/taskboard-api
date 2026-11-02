from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

BoardName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class BoardCreate(BaseModel):
    name: BoardName


class BoardUpdate(BaseModel):
    name: BoardName


class BoardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
