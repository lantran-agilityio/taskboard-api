from typing import Any

from pydantic import BaseModel, ConfigDict

from app.realtime.events import EventType
from app.schemas.common import UtcDatetime


class ActivityRead(BaseModel):
    """A logged event: the same type and data its WebSocket event carried."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    type: EventType
    actor_id: int
    data: dict[str, Any]
    created_at: UtcDatetime
