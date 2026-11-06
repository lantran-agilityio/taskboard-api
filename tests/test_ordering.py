from dataclasses import dataclass

import pytest

from app.services.ordering import move_item, remove_item, renumber, transfer_item


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


@pytest.mark.parametrize(
    ("new_position", "expected_target"),
    [
        (0, ["B", "X", "Y"]),
        (1, ["X", "B", "Y"]),
        (2, ["X", "Y", "B"]),
    ],
)
def test_transfer_item(new_position: int, expected_target: list[str]) -> None:
    source = make_items("A", "B", "C")
    target = make_items("X", "Y")
    item = source[1]

    transfer_item(source, target, item, new_position)

    remaining = [other for other in source if other is not item]
    assert names_in_order(remaining) == ["A", "C"]
    assert sorted(other.position for other in remaining) == [0, 1]
    assert names_in_order([*target, item]) == expected_target
    assert sorted(other.position for other in [*target, item]) == [0, 1, 2]


def test_transfer_item_into_empty_target() -> None:
    source = make_items("A")

    transfer_item(source, [], source[0], 0)

    assert source[0].position == 0


@pytest.mark.parametrize("new_position", [-1, 3])
def test_transfer_item_out_of_range(new_position: int) -> None:
    source = make_items("A", "B", "C")
    target = make_items("X", "Y")

    with pytest.raises(ValueError):
        transfer_item(source, target, source[0], new_position)

    assert names_in_order(source) == ["A", "B", "C"]
    assert [item.position for item in source] == [0, 1, 2]
    assert [item.position for item in target] == [0, 1]


def test_transfer_item_not_in_source() -> None:
    source = make_items("A")
    target = make_items("X")

    with pytest.raises(ValueError):
        transfer_item(source, target, target[0], 0)

    assert [item.position for item in source + target] == [0, 0]


def test_remove_item_renumbers_the_rest() -> None:
    items = make_items("A", "B", "C", "D")
    removed = items[1]

    remove_item(items, removed)

    assert [item.position for item in items if item is not removed] == [0, 1, 2]
    assert names_in_order([item for item in items if item is not removed]) == [
        "A",
        "C",
        "D",
    ]


def test_remove_item_not_in_sequence() -> None:
    with pytest.raises(ValueError, match="not in this sequence"):
        remove_item(make_items("A"), Item("X", 0))
