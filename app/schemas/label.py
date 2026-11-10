from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

from app.models.label import LabelColor

# Unlike the shared Name, a label's name may be empty: a label can be just a colour,
# and every new board starts with six of those.
LabelName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class LabelCreate(BaseModel):
    name: LabelName = ""
    color: LabelColor


class LabelUpdate(BaseModel):
    name: LabelName | None = None
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
