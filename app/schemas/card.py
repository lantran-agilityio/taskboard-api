from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.schemas.common import Name, UtcDatetime

Description = Annotated[str, StringConstraints(max_length=2000)]
# A set of ids sent as a list: repeats are dropped and the order is fixed.
IdSet = Annotated[
    list[Annotated[int, Field(ge=1, strict=True)]],
    AfterValidator(lambda ids: sorted(set(ids))),
]


class CardCreate(BaseModel):
    title: Name
    description: Description | None = None
    due_at: AwareDatetime | None = None
    label_ids: IdSet = []
    assignee_ids: IdSet = []


class CardUpdate(BaseModel):
    title: Name | None = None
    # null clears the description; leaving it out keeps it (see model_fields_set).
    description: Description | None = None
    list_id: int | None = Field(default=None, ge=1, strict=True)
    position: int | None = Field(default=None, ge=0, strict=True)
    # null clears the due date; leaving it out keeps it, like description.
    due_at: AwareDatetime | None = None
    due_complete: bool | None = Field(default=None, strict=True)
    # Each replaces the card's whole set; [] clears it.
    label_ids: IdSet | None = None
    assignee_ids: IdSet | None = None

    @model_validator(mode="after")
    def check_has_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Give at least one field to change")
        for field in (
            "title",
            "list_id",
            "position",
            "due_complete",
            "label_ids",
            "assignee_ids",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class CardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    list_id: int
    title: str
    description: str | None
    position: int | None  # None while archived
    created_at: UtcDatetime
    archived_at: UtcDatetime | None
    due_at: UtcDatetime | None
    due_complete: bool
    label_ids: list[int]
    assignee_ids: list[int]
