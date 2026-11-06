"""Helpers for models that can be archived (lists and cards).

An archived item keeps its row but has archived_at set and no position, so
the active items of a board or list stay numbered 0..n-1.
"""

from datetime import datetime
from operator import attrgetter
from typing import Protocol


class Archivable(Protocol):
    position: int | None
    archived_at: datetime | None


def active[T: Archivable](items: list[T]) -> list[T]:
    """The items that aren't archived, in position order."""
    return sorted(
        (item for item in items if item.archived_at is None),
        key=lambda item: item.position or 0,
    )


def newest_archived[T: Archivable](items: list[T]) -> list[T]:
    """The archived items, most recently archived first."""
    archived = [item for item in items if item.archived_at is not None]
    return sorted(archived, key=attrgetter("archived_at"), reverse=True)
