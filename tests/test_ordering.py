from dataclasses import dataclass

import pytest

from app.services.ordering import move_item, renumber


@dataclass
class Item:
    name: str
    position: int


def make_items(*names: str) -> list[Item]:
    return [Item(name, position) for position, name in enumerate(names)]


def names_in_order(items: list[Item]) -> list[str]:
    return [item.name for item in sorted(items, key=lambda item: item.position)]


@pytest.mark.parametrize(
    ("name", "new_position", "expected"),
    [
        ("B", 3, ["A", "C", "D", "B"]),
        ("D", 0, ["D", "A", "B", "C"]),
        ("C", 1, ["A", "C", "B", "D"]),
        ("B", 1, ["A", "B", "C", "D"]),
    ],
)
def test_move_item(name: str, new_position: int, expected: list[str]) -> None:
    items = make_items("A", "B", "C", "D")
    item = next(item for item in items if item.name == name)

    move_item(items, item, new_position)

    assert names_in_order(items) == expected
    assert sorted(item.position for item in items) == [0, 1, 2, 3]


def test_move_item_ignores_the_list_order() -> None:
    items = make_items("A", "B", "C")
    items.reverse()

    move_item(items, items[0], 0)  # C to the front

    assert names_in_order(items) == ["C", "A", "B"]


@pytest.mark.parametrize("new_position", [-1, 4])
def test_move_item_out_of_range(new_position: int) -> None:
    items = make_items("A", "B", "C", "D")

    with pytest.raises(ValueError):
        move_item(items, items[1], new_position)

    assert names_in_order(items) == ["A", "B", "C", "D"]


def test_renumber_closes_gaps_and_keeps_order() -> None:
    items = [Item("A", 0), Item("C", 5), Item("B", 2)]

    renumber(items)

    assert names_in_order(items) == ["A", "B", "C"]
    assert sorted(item.position for item in items) == [0, 1, 2]


def test_move_item_not_in_items() -> None:
    items = make_items("A", "B")
    stranger = Item("X", 0)

    with pytest.raises(ValueError):
        move_item(items, stranger, 0)

    assert names_in_order(items) == ["A", "B"]
