from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.schemas.board_list import ListRead
from app.schemas.card import CardRead
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
    closed_at: UtcDatetime | None
    # Whether the user asking has starred it; each user has their own stars.
    starred: bool


class ListWithCards(ListRead):
    # Read from BoardList.active_cards: the cards relationship has archived ones too.
    cards: list[CardRead] = Field(validation_alias="active_cards")


class BoardSnapshot(BaseModel):
    """A board with its active lists and their active cards, in board order."""

    board: BoardRead
    lists: list[ListWithCards]
