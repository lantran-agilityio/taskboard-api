from collections.abc import Sequence
from typing import Protocol


class Positioned(Protocol):
    position: int


def renumber(items: Sequence[Positioned]) -> None:
    """Number items 0..n-1, keeping their current order."""
    for index, item in enumerate(sorted(items, key=lambda item: item.position)):
        item.position = index


def move_item[T: Positioned](items: Sequence[T], item: T, new_position: int) -> None:
    """Move item to new_position and shift the others to make room."""
    if not any(other is item for other in items):
        raise ValueError("Item is not in this sequence")
    if not 0 <= new_position < len(items):
        raise ValueError(f"Position must be between 0 and {len(items) - 1}")
    others = sorted(
        (other for other in items if other is not item),
        key=lambda other: other.position,
    )
    others.insert(new_position, item)
    for index, other in enumerate(others):
        other.position = index
