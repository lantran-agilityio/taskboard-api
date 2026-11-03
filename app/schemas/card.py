from datetime import datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.common import Name

Description = Annotated[str, StringConstraints(max_length=2000)]


class CardCreate(BaseModel):
    title: Name
    description: Description | None = None


class CardUpdate(BaseModel):
    title: Name | None = None
    # null clears the description; leaving it out keeps it (see model_fields_set).
    description: Description | None = None
    list_id: int | None = Field(default=None, ge=1, strict=True)
    position: int | None = Field(default=None, ge=0, strict=True)

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Give at least one field to change")
        for field in ("title", "list_id", "position"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class CardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    list_id: int
    title: str
    description: str | None
    position: int
    created_at: datetime
