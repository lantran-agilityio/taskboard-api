import json
from enum import StrEnum
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.board import Board
from app.models.board_list import BoardList

CHANNEL = "board_events"


class EventType(StrEnum):
    BOARD_UPDATED = "board.updated"
    BOARD_DELETED = "board.deleted"
    LIST_CREATED = "list.created"
    LIST_UPDATED = "list.updated"
    LIST_DELETED = "list.deleted"
    CARD_CREATED = "card.created"
    CARD_UPDATED = "card.updated"
    CARD_DELETED = "card.deleted"
    LABEL_CREATED = "label.created"
    LABEL_UPDATED = "label.updated"
    LABEL_DELETED = "label.deleted"
    MEMBER_ADDED = "member.added"
    MEMBER_UPDATED = "member.updated"
    MEMBER_REMOVED = "member.removed"


def publish(
    db: Session, board_id: int, event_type: EventType, data: dict[str, Any]
) -> None:
    """Queue an event for everyone watching the board.

    Call it inside the request's transaction, after flush and before commit:
    Postgres delivers a NOTIFY only when its transaction commits, so a request
    that fails or rolls back never announces a change that didn't happen.
    """
    payload = json.dumps({"type": event_type, "board_id": board_id, "data": data})
    db.execute(select(func.pg_notify(CHANNEL, payload)))


def list_order(board: Board) -> list[int]:
    """The board's list ids in position order."""
    return [item.id for item in sorted(board.lists, key=lambda item: item.position)]


def card_order(board_list: BoardList) -> dict[str, Any]:
    """One list's card ids in position order."""
    cards = sorted(board_list.cards, key=lambda card: card.position)
    return {"list_id": board_list.id, "card_ids": [card.id for card in cards]}
