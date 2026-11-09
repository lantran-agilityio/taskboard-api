"""Keyset ("cursor") pagination for lists that are read newest first.

A page is the `limit` rows with the highest ids below `before`. Unlike
OFFSET, rows added while a client pages through can't shift later pages, so
nothing is shown twice or skipped, and the query uses an index on the id.
"""

from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import Select
from sqlalchemy.orm import InstrumentedAttribute, Session


class HasId(Protocol):
    id: Any  # Mapped[int] on the models, int on their instances


@dataclass
class PageResult[T: HasId]:
    items: list[T]
    next_before: int | None


def paginate[T: HasId](
    db: Session,
    query: Select[tuple[T]],
    id_column: InstrumentedAttribute[int],
    limit: int,
    before: int | None,
) -> PageResult[T]:
    if before is not None:
        query = query.where(id_column < before)
    # One row more than asked for tells whether an older page exists.
    rows = list(db.scalars(query.order_by(id_column.desc()).limit(limit + 1)))
    if len(rows) <= limit:
        return PageResult(rows, None)
    items = rows[:limit]
    return PageResult(items, items[-1].id)
