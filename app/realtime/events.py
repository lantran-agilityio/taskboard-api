import json
from enum import StrEnum
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.board import Board
from app.models.board_list import BoardList

CHANNEL = "board_events"


class EventType(StrEnum):
    BOARD_CREATED = "board.created"
    BOARD_UPDATED = "board.updated"
    BOARD_DELETED = "board.deleted"
    BOARD_CLOSED = "board.closed"
    BOARD_REOPENED = "board.reopened"
    LIST_CREATED = "list.created"
    LIST_UPDATED = "list.updated"
    LIST_DELETED = "list.deleted"
    LIST_ARCHIVED = "list.archived"
    LIST_RESTORED = "list.restored"
    LIST_SORTED = "list.sorted"
    CARD_CREATED = "card.created"
    CARD_UPDATED = "card.updated"
    CARD_DELETED = "card.deleted"
    CARD_ARCHIVED = "card.archived"
    CARD_RESTORED = "card.restored"
    LABEL_CREATED = "label.created"
    LABEL_UPDATED = "label.updated"
    LABEL_DELETED = "label.deleted"
    MEMBER_ADDED = "member.added"
    MEMBER_UPDATED = "member.updated"
    MEMBER_REMOVED = "member.removed"
    COMMENT_CREATED = "comment.created"
    COMMENT_UPDATED = "comment.updated"
    COMMENT_DELETED = "comment.deleted"
    CHECKLIST_CREATED = "checklist.created"
    CHECKLIST_UPDATED = "checklist.updated"
    CHECKLIST_DELETED = "checklist.deleted"
    CHECKLIST_ITEM_CREATED = "checklist_item.created"
    CHECKLIST_ITEM_UPDATED = "checklist_item.updated"
    CHECKLIST_ITEM_DELETED = "checklist_item.deleted"


def publish(
    db: Session,
    board_id: int,
    event_type: EventType,
    data: dict[str, Any],
    *,
    actor_id: int,
) -> None:
    """Log an event in the board's activity and queue it for everyone watching.

    Call it inside the request's transaction, after flush and before commit:
    Postgres delivers a NOTIFY only when its transaction commits, and the log
    entry is written in the same transaction, so a request that fails or rolls
    back neither announces nor logs a change that didn't happen.
    """
    # A deleted board's log is deleted with it (by the database's cascade).
    if event_type is not EventType.BOARD_DELETED:
        db.add(
            Activity(board_id=board_id, actor_id=actor_id, type=event_type, data=data)
        )
    payload = json.dumps(
        {"type": event_type, "board_id": board_id, "actor_id": actor_id, "data": data}
    )
    db.execute(select(func.pg_notify(CHANNEL, payload)))


def changes_from(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """The old values of the fields that changed, for an update event's `previous`.

    Update events carry the new state; with the old values too, the activity log
    can say what something changed from without finding the entry before it.
    """
    return {key: value for key, value in before.items() if after.get(key) != value}


def list_order(board: Board) -> list[int]:
    """The board's active list ids in position order."""
    return [item.id for item in board.active_lists]


def card_order(board_list: BoardList) -> dict[str, Any]:
    """One list's active card ids in position order."""
    return {
        "list_id": board_list.id,
        "card_ids": [card.id for card in board_list.active_cards],
    }
