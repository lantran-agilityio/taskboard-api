from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.common import Name, UtcDatetime

ItemText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]


class ChecklistCreate(BaseModel):
    title: Name = "Checklist"


class ChecklistUpdate(BaseModel):
    title: Name | None = None
    position: int | None = Field(default=None, ge=0, strict=True)

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if self.title is None and self.position is None:
            raise ValueError("Give a title, a position, or both")
        return self


class ItemCreate(BaseModel):
    text: ItemText


class ItemUpdate(BaseModel):
    text: ItemText | None = None
    done: bool | None = Field(default=None, strict=True)
    position: int | None = Field(default=None, ge=0, strict=True)

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Give at least one field to change")
        for field in self.model_fields_set:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checklist_id: int
    text: str
    done: bool
    position: int
    created_at: UtcDatetime


class ChecklistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    card_id: int
    title: str
    position: int
    created_at: UtcDatetime
    items: list[ChecklistItemRead]
