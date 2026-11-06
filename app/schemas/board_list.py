from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.common import Name, UtcDatetime


class ListCreate(BaseModel):
    name: Name


class ListUpdate(BaseModel):
    name: Name | None = None
    position: int | None = Field(default=None, ge=0, strict=True)

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if self.name is None and self.position is None:
            raise ValueError("Give a name, a position, or both")
        return self


class ListRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    board_id: int
    name: str
    position: int | None  # None while archived
    created_at: datetime
    archived_at: UtcDatetime | None
