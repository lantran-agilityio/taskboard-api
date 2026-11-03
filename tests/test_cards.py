import pytest
from fastapi.testclient import TestClient


def create_board(client: TestClient, name: str = "Project X") -> dict:
    response = client.post("/boards", json={"name": name})
    assert response.status_code == 201
    return response.json()


def create_list(client: TestClient, board_id: int, name: str = "To do") -> dict:
    response = client.post(f"/boards/{board_id}/lists", json={"name": name})
    assert response.status_code == 201
    return response.json()


def create_card(client: TestClient, list_id: int, title: str = "Task", **extra) -> dict:
    response = client.post(f"/lists/{list_id}/cards", json={"title": title, **extra})
    assert response.status_code == 201
    return response.json()


def cards_in(client: TestClient, list_id: int) -> list[dict]:
    response = client.get(f"/lists/{list_id}/cards")
    assert response.status_code == 200
    return response.json()


def card_titles(client: TestClient, list_id: int) -> list[str]:
    return [card["title"] for card in cards_in(client, list_id)]


def assert_positions_are_dense(client: TestClient, list_id: int) -> None:
    positions = [card["position"] for card in cards_in(client, list_id)]
    assert positions == list(range(len(positions)))


def list_with_cards(client: TestClient, *titles: str) -> tuple[int, dict]:
    board = create_board(client)
    board_list = create_list(client, board["id"])
    cards = {title: create_card(client, board_list["id"], title) for title in titles}
    return board_list["id"], cards


def two_lists(client: TestClient) -> tuple[int, int, dict]:
    """A board with list 1 holding A, B, C and list 2 holding X, Y."""
    board = create_board(client)
    first = create_list(client, board["id"], "First")
    second = create_list(client, board["id"], "Second")
    cards = {title: create_card(client, first["id"], title) for title in "ABC"}
    cards |= {title: create_card(client, second["id"], title) for title in "XY"}
    return first["id"], second["id"], cards


# Create


def test_create_card(client: TestClient) -> None:
    board = create_board(client)
    board_list = create_list(client, board["id"])

    response = client.post(
        f"/lists/{board_list['id']}/cards",
        json={"title": "Write tests", "description": "For cards"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Write tests"
    assert body["description"] == "For cards"
    assert body["list_id"] == board_list["id"]
    assert body["position"] == 0
    assert isinstance(body["id"], int)
    assert "created_at" in body


def test_create_card_description_is_optional(client: TestClient) -> None:
    list_id, _ = list_with_cards(client)

    card = create_card(client, list_id)

    assert card["description"] is None


def test_new_cards_go_to_the_end(client: TestClient) -> None:
    _, cards = list_with_cards(client, "A", "B", "C")

    assert [card["position"] for card in cards.values()] == [0, 1, 2]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 101},
        {"title": "Task", "description": "x" * 2001},
    ],
)
def test_create_card_invalid_input(client: TestClient, payload: dict) -> None:
    list_id, _ = list_with_cards(client)

    response = client.post(f"/lists/{list_id}/cards", json=payload)

    assert response.status_code == 422


def test_create_card_on_missing_list_returns_404(client: TestClient) -> None:
    response = client.post("/lists/999/cards", json={"title": "Task"})

    assert response.status_code == 404
    assert response.json() == {"detail": "List not found"}


# List


def test_list_cards_empty(client: TestClient) -> None:
    list_id, _ = list_with_cards(client)

    assert cards_in(client, list_id) == []


def test_list_cards_only_returns_that_list(client: TestClient) -> None:
    first, second, _ = two_lists(client)

    assert card_titles(client, first) == ["A", "B", "C"]
    assert card_titles(client, second) == ["X", "Y"]


def test_list_cards_on_missing_list_returns_404(client: TestClient) -> None:
    response = client.get("/lists/999/cards")

    assert response.status_code == 404


# Get


def test_get_card(client: TestClient) -> None:
    _, cards = list_with_cards(client, "A")

    response = client.get(f"/cards/{cards['A']['id']}")

    assert response.status_code == 200
    assert response.json() == cards["A"]


def test_get_missing_card_returns_404(client: TestClient) -> None:
    response = client.get("/cards/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Card not found"}


# Update fields


def test_rename_card_keeps_position(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B")

    response = client.patch(f"/cards/{cards['B']['id']}", json={"title": "Done"})

    assert response.status_code == 200
    assert response.json()["position"] == 1
    assert card_titles(client, list_id) == ["A", "Done"]


def test_set_and_clear_description(client: TestClient) -> None:
    _, cards = list_with_cards(client, "A")
    url = f"/cards/{cards['A']['id']}"

    response = client.patch(url, json={"description": "Details"})
    assert response.status_code == 200
    assert response.json()["description"] == "Details"

    response = client.patch(url, json={"description": None})
    assert response.status_code == 200
    assert response.json()["description"] is None


def test_leaving_out_description_keeps_it(client: TestClient) -> None:
    list_id, _ = list_with_cards(client)
    card = create_card(client, list_id, "A", description="Details")

    response = client.patch(f"/cards/{card['id']}", json={"title": "B"})

    assert response.status_code == 200
    assert response.json()["description"] == "Details"


@pytest.mark.parametrize(
    "payload",
    [{}, {"title": None}, {"list_id": None}, {"position": None}, {"title": ""}],
)
def test_update_card_invalid_payload(client: TestClient, payload: dict) -> None:
    list_id, cards = list_with_cards(client, "A")

    response = client.patch(f"/cards/{cards['A']['id']}", json=payload)

    assert response.status_code == 422
    assert card_titles(client, list_id) == ["A"]


def test_update_missing_card_returns_404(client: TestClient) -> None:
    response = client.patch("/cards/999", json={"title": "Done"})

    assert response.status_code == 404


# Move within a list


@pytest.mark.parametrize(
    ("title", "position", "expected"),
    [
        ("B", 3, ["A", "C", "D", "B"]),
        ("D", 0, ["D", "A", "B", "C"]),
        ("B", 1, ["A", "B", "C", "D"]),
    ],
)
def test_move_card_within_list(
    client: TestClient, title: str, position: int, expected: list[str]
) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C", "D")

    response = client.patch(f"/cards/{cards[title]['id']}", json={"position": position})

    assert response.status_code == 200
    assert response.json()["position"] == position
    assert card_titles(client, list_id) == expected
    assert_positions_are_dense(client, list_id)


def test_move_card_to_its_own_list_by_id(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")

    response = client.patch(
        f"/cards/{cards['A']['id']}", json={"list_id": list_id, "position": 2}
    )

    assert response.status_code == 200
    assert card_titles(client, list_id) == ["B", "C", "A"]


@pytest.mark.parametrize("position", [-1, 4, True, 1.0, "1"])
def test_move_card_within_list_invalid_position(
    client: TestClient, position: object
) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C", "D")

    response = client.patch(f"/cards/{cards['B']['id']}", json={"position": position})

    assert response.status_code == 422
    assert card_titles(client, list_id) == ["A", "B", "C", "D"]


# Move between lists


@pytest.mark.parametrize(
    ("position", "expected"),
    [(0, ["B", "X", "Y"]), (1, ["X", "B", "Y"]), (2, ["X", "Y", "B"])],
)
def test_move_card_to_another_list(
    client: TestClient, position: int, expected: list[str]
) -> None:
    first, second, cards = two_lists(client)

    response = client.patch(
        f"/cards/{cards['B']['id']}", json={"list_id": second, "position": position}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["list_id"] == second
    assert body["position"] == position
    assert card_titles(client, first) == ["A", "C"]
    assert card_titles(client, second) == expected
    assert_positions_are_dense(client, first)
    assert_positions_are_dense(client, second)


def test_move_card_to_another_list_goes_to_the_end_by_default(
    client: TestClient,
) -> None:
    first, second, cards = two_lists(client)

    response = client.patch(f"/cards/{cards['A']['id']}", json={"list_id": second})

    assert response.status_code == 200
    assert response.json()["position"] == 2
    assert card_titles(client, first) == ["B", "C"]
    assert card_titles(client, second) == ["X", "Y", "A"]
    assert_positions_are_dense(client, first)


def test_move_card_into_empty_list(client: TestClient) -> None:
    board = create_board(client)
    first = create_list(client, board["id"], "First")
    empty = create_list(client, board["id"], "Empty")
    card = create_card(client, first["id"], "A")

    response = client.patch(
        f"/cards/{card['id']}", json={"list_id": empty["id"], "position": 0}
    )

    assert response.status_code == 200
    assert card_titles(client, first["id"]) == []
    assert card_titles(client, empty["id"]) == ["A"]


def test_move_and_rename_card(client: TestClient) -> None:
    _, second, cards = two_lists(client)

    response = client.patch(
        f"/cards/{cards['C']['id']}",
        json={"list_id": second, "position": 0, "title": "Done"},
    )

    assert response.status_code == 200
    assert card_titles(client, second) == ["Done", "X", "Y"]


def test_move_card_to_list_on_another_board(client: TestClient) -> None:
    first, _, cards = two_lists(client)
    other_board = create_board(client, "Other")
    foreign = create_list(client, other_board["id"])

    response = client.patch(
        f"/cards/{cards['A']['id']}", json={"list_id": foreign["id"]}
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "list_id"]
    assert card_titles(client, first) == ["A", "B", "C"]
    assert card_titles(client, foreign["id"]) == []


def test_move_card_to_missing_list(client: TestClient) -> None:
    first, _, cards = two_lists(client)

    response = client.patch(f"/cards/{cards['A']['id']}", json={"list_id": 999})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "list_id"]
    assert error["input"] == 999
    assert card_titles(client, first) == ["A", "B", "C"]


def test_invalid_move_to_another_list_changes_nothing(client: TestClient) -> None:
    first, second, cards = two_lists(client)

    response = client.patch(
        f"/cards/{cards['A']['id']}",
        json={"list_id": second, "position": 3, "title": "Done"},
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "position"]
    assert error["msg"] == "Position must be between 0 and 2"
    assert card_titles(client, first) == ["A", "B", "C"]
    assert card_titles(client, second) == ["X", "Y"]
    assert_positions_are_dense(client, first)
    assert_positions_are_dense(client, second)


# Delete


def test_delete_card_renumbers_the_rest(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")

    response = client.delete(f"/cards/{cards['B']['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/cards/{cards['B']['id']}").status_code == 404
    remaining = cards_in(client, list_id)
    assert [(card["title"], card["position"]) for card in remaining] == [
        ("A", 0),
        ("C", 1),
    ]


def test_create_card_after_delete_goes_to_the_end(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")
    client.delete(f"/cards/{cards['A']['id']}")

    card = create_card(client, list_id, "D")

    assert card["position"] == 2
    assert card_titles(client, list_id) == ["B", "C", "D"]


def test_delete_missing_card_returns_404(client: TestClient) -> None:
    response = client.delete("/cards/999")

    assert response.status_code == 404


def test_delete_list_deletes_its_cards(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B")

    assert client.delete(f"/lists/{list_id}").status_code == 204

    for card in cards.values():
        assert client.get(f"/cards/{card['id']}").status_code == 404


def test_delete_board_deletes_its_cards(client: TestClient) -> None:
    board = create_board(client)
    board_list = create_list(client, board["id"])
    card = create_card(client, board_list["id"], "A")

    assert client.delete(f"/boards/{board['id']}").status_code == 204

    assert client.get(f"/cards/{card['id']}").status_code == 404


# Ownership


@pytest.mark.parametrize(
    ("method", "json"),
    [("POST", {"title": "Hacked"}), ("GET", None)],
)
def test_other_users_list_cards_return_404(
    client: TestClient, other_headers: dict, method: str, json: dict | None
) -> None:
    list_id, _ = list_with_cards(client, "A")

    response = client.request(
        method, f"/lists/{list_id}/cards", json=json, headers=other_headers
    )

    assert response.status_code == 404
    assert card_titles(client, list_id) == ["A"]


@pytest.mark.parametrize(
    ("method", "json"),
    [("GET", None), ("PATCH", {"title": "Hacked"}), ("DELETE", None)],
)
def test_other_users_card_returns_404(
    client: TestClient, other_headers: dict, method: str, json: dict | None
) -> None:
    list_id, cards = list_with_cards(client, "A")

    response = client.request(
        method, f"/cards/{cards['A']['id']}", json=json, headers=other_headers
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Card not found"}
    assert card_titles(client, list_id) == ["A"]


def test_move_card_to_other_users_list_returns_422(
    client: TestClient, other_headers: dict
) -> None:
    list_id, cards = list_with_cards(client, "A")
    bob_board = client.post(
        "/boards", json={"name": "Bob's"}, headers=other_headers
    ).json()
    bob_list = client.post(
        f"/boards/{bob_board['id']}/lists",
        json={"name": "Bob's"},
        headers=other_headers,
    ).json()

    response = client.patch(
        f"/cards/{cards['A']['id']}", json={"list_id": bob_list["id"]}
    )

    assert response.status_code == 422
    assert card_titles(client, list_id) == ["A"]
    bob_cards = client.get(f"/lists/{bob_list['id']}/cards", headers=other_headers)
    assert bob_cards.json() == []
