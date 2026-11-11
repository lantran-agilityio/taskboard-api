"""Which card an activity entry is about, worked out from its event data."""

from typing import Any

from sqlalchemy import ColumnElement, Integer, cast, func
from sqlalchemy.orm import InstrumentedAttribute


def card_id_of(data: InstrumentedAttribute[dict[str, Any]]) -> ColumnElement[int]:
    """The card id an entry's data refers to, or NULL for entries about no card.

    Events keep it in one of three places: `card.id` (card created, updated,
    archived, restored), `card_id` (card and comment deleted, every checklist event) and
    `comment.card_id` (comment created, updated). List, label, member and
    board events have none of these, so they never match a card.
    """
    return cast(
        func.coalesce(
            data["card"]["id"].astext,
            data["card_id"].astext,
            data["comment"]["card_id"].astext,
        ),
        Integer,
    )
