from pydantic import BaseModel, ConfigDict


class Page[T](BaseModel):
    """One page of a list that is read newest first.

    Pass next_before as `before` to get the next (older) page; it is null on
    the last one.
    """

    # Built from a PageResult (app/services/pagination.py) by its attributes.
    model_config = ConfigDict(from_attributes=True)

    items: list[T]
    next_before: int | None
