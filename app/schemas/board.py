from typing import Self

from pydantic import BaseModel, model_validator

from app.schemas.common import Description, Name, UtcDatetime


class BoardCreate(BaseModel):
    name: Name
    description: Description | None = None


class BoardUpdate(BaseModel):
    name: Name | None = None
    # null clears the description; leaving it out keeps it (see model_fields_set).
    description: Description | None = None

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Give at least one field to change")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class BoardRead(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: UtcDatetime
    # Whether the user asking has starred it; each user has their own stars.
    starred: bool
