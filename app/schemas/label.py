from typing import Self

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.label import LabelColor
from app.schemas.common import Name


class LabelCreate(BaseModel):
    name: Name
    color: LabelColor


class LabelUpdate(BaseModel):
    name: Name | None = None
    color: LabelColor | None = None

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Give at least one field to change")
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class LabelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    board_id: int
    name: str
    color: LabelColor
