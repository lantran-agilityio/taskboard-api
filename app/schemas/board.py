from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import Name


class BoardCreate(BaseModel):
    name: Name


class BoardUpdate(BaseModel):
    name: Name


class BoardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
