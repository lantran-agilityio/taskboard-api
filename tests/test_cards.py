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


# Details: due date, labels, assignees

DUE = "2026-11-20T17:00:00+07:00"
DUE_UTC = "2026-11-20T10:00:00Z"


def create_label(client: TestClient, board_id: int, name: str = "Bug") -> int:
    response = client.post(
        f"/boards/{board_id}/labels", json={"name": name, "color": "red"}
    )
    assert response.status_code == 201
    return response.json()["id"]


def me(client: TestClient, headers: dict | None = None) -> int:
    return client.get("/users/me", headers=headers).json()["id"]


def share_with_bob(
    client: TestClient, board_id: int, headers: dict, role: str = "editor"
) -> int:
    response = client.post(
        f"/boards/{board_id}/members",
        json={"email": "bob@example.com", "role": role},
    )
    assert response.status_code == 201
    return me(client, headers)


def card_board(client: TestClient) -> tuple[int, int]:
    """A board with one list; returns (board_id, list_id)."""
    board = create_board(client)
    return board["id"], create_list(client, board["id"])["id"]


def test_new_card_has_no_details(client: TestClient) -> None:
    _, list_id = card_board(client)

    card = create_card(client, list_id)

    assert card["due_at"] is None
    assert card["due_complete"] is False
    assert card["label_ids"] == []
    assert card["assignee_ids"] == []


def test_create_card_with_details(client: TestClient, other_headers: dict) -> None:
    board_id, list_id = card_board(client)
    bug = create_label(client, board_id, "Bug")
    urgent = create_label(client, board_id, "Urgent")
    bob = share_with_bob(client, board_id, other_headers)

    card = create_card(
        client,
        list_id,
        due_at=DUE,
        label_ids=[urgent, bug, urgent],
        assignee_ids=[bob, me(client)],
    )

    assert card["due_at"] == DUE_UTC
    assert card["label_ids"] == sorted([bug, urgent])
    assert card["assignee_ids"] == sorted([bob, me(client)])
    assert client.get(f"/cards/{card['id']}").json() == card


@pytest.mark.parametrize(
    "payload",
    [
        {"due_at": "2026-11-20T17:00:00"},
        {"due_at": "next friday"},
        {"label_ids": None},
        {"label_ids": ["one"]},
        {"assignee_ids": None},
    ],
)
def test_create_card_invalid_details(client: TestClient, payload: dict) -> None:
    _, list_id = card_board(client)

    response = client.post(f"/lists/{list_id}/cards", json={"title": "C", **payload})

    assert response.status_code == 422
    assert cards_in(client, list_id) == []


def test_create_card_with_label_from_another_board(client: TestClient) -> None:
    _, list_id = card_board(client)
    other_board = create_board(client, "Other")
    foreign = create_label(client, other_board["id"])

    response = client.post(
        f"/lists/{list_id}/cards", json={"title": "C", "label_ids": [foreign]}
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "label_ids"]
    assert cards_in(client, list_id) == []


def test_create_card_assigned_to_someone_off_the_board(
    client: TestClient, other_headers: dict
) -> None:
    _, list_id = card_board(client)
    bob = me(client, other_headers)  # registered, but not on this board

    for assignee in (bob, 999):
        response = client.post(
            f"/lists/{list_id}/cards", json={"title": "C", "assignee_ids": [assignee]}
        )

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "assignee_ids"]
    assert cards_in(client, list_id) == []


def test_update_card_details(client: TestClient, other_headers: dict) -> None:
    board_id, list_id = card_board(client)
    bug = create_label(client, board_id, "Bug")
    urgent = create_label(client, board_id, "Urgent")
    bob = share_with_bob(client, board_id, other_headers)
    card = create_card(client, list_id, label_ids=[bug], assignee_ids=[me(client)])

    response = client.patch(
        f"/cards/{card['id']}",
        json={
            "due_at": DUE,
            "due_complete": True,
            "label_ids": [urgent],
            "assignee_ids": [bob],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["due_at"] == DUE_UTC
    assert body["due_complete"] is True
    assert body["label_ids"] == [urgent]
    assert body["assignee_ids"] == [bob]


def test_clear_card_details(client: TestClient) -> None:
    board_id, list_id = card_board(client)
    bug = create_label(client, board_id)
    card = create_card(
        client, list_id, due_at=DUE, label_ids=[bug], assignee_ids=[me(client)]
    )

    response = client.patch(
        f"/cards/{card['id']}",
        json={"due_at": None, "label_ids": [], "assignee_ids": []},
    )

    body = response.json()
    assert body["due_at"] is None
    assert body["label_ids"] == []
    assert body["assignee_ids"] == []


def test_leaving_out_details_keeps_them(client: TestClient) -> None:
    board_id, list_id = card_board(client)
    bug = create_label(client, board_id)
    card = create_card(
        client, list_id, due_at=DUE, label_ids=[bug], assignee_ids=[me(client)]
    )
    client.patch(f"/cards/{card['id']}", json={"due_complete": True})

    response = client.patch(f"/cards/{card['id']}", json={"title": "Renamed"})

    assert response.json() == {**card, "title": "Renamed", "due_complete": True}


@pytest.mark.parametrize(
    "payload",
    [
        {"due_at": "2026-11-20"},
        {"due_complete": None},
        {"due_complete": "yes"},
        {"label_ids": None},
        {"assignee_ids": None},
    ],
)
def test_update_card_invalid_details(client: TestClient, payload: dict) -> None:
    _, list_id = card_board(client)
    card = create_card(client, list_id)

    response = client.patch(f"/cards/{card['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/cards/{card['id']}").json() == card


def test_invalid_details_cancel_the_whole_update(client: TestClient) -> None:
    first, second, cards = two_lists(client)
    other_board = create_board(client, "Other")
    foreign = create_label(client, other_board["id"])

    response = client.patch(
        f"/cards/{cards['A']['id']}",
        json={"title": "Moved", "list_id": second, "label_ids": [foreign]},
    )

    assert response.status_code == 422
    assert card_titles(client, first) == ["A", "B", "C"]
    assert card_titles(client, second) == ["X", "Y"]


def test_moving_a_card_keeps_its_details(client: TestClient) -> None:
    first, second, cards = two_lists(client)
    board_id = client.get(f"/lists/{first}").json()["board_id"]
    bug = create_label(client, board_id)
    client.patch(f"/cards/{cards['A']['id']}", json={"label_ids": [bug]})

    response = client.patch(f"/cards/{cards['A']['id']}", json={"list_id": second})

    assert response.json()["label_ids"] == [bug]


# Search a board's cards


def search(client: TestClient, board_id: int, **params) -> list[str]:
    response = client.get(f"/boards/{board_id}/cards", params=params)
    assert response.status_code == 200
    return [card["title"] for card in response.json()]


@pytest.fixture
def searchable(client: TestClient, other_headers: dict) -> dict:
    """Lists First (A, B) and Second (C, D), with labels, assignees and due dates."""
    board = create_board(client)
    first = create_list(client, board["id"], "First")
    second = create_list(client, board["id"], "Second")
    bug = create_label(client, board["id"], "Bug")
    alice = me(client)
    bob = share_with_bob(client, board["id"], other_headers)
    create_card(
        client, first["id"], "A", label_ids=[bug], due_at="2026-11-10T00:00:00Z"
    )
    create_card(client, first["id"], "B", assignee_ids=[bob])
    create_card(
        client,
        second["id"],
        "C",
        label_ids=[bug],
        assignee_ids=[alice, bob],
        due_at="2026-11-30T00:00:00Z",
    )
    create_card(client, second["id"], "D", assignee_ids=[alice])
    return {"board": board["id"], "bug": bug, "alice": alice, "bob": bob}


def test_search_without_filters_returns_every_card_in_order(
    client: TestClient, searchable: dict
) -> None:
    board_id = searchable["board"]
    lists = client.get(f"/boards/{board_id}/lists").json()
    # Board order is list position, then card position.
    client.patch(f"/lists/{lists[1]['id']}", json={"position": 0})

    assert search(client, board_id) == ["C", "D", "A", "B"]


def test_search_filters(client: TestClient, searchable: dict) -> None:
    board_id = searchable["board"]

    assert search(client, board_id, label_id=searchable["bug"]) == ["A", "C"]
    assert search(client, board_id, assignee_id=searchable["bob"]) == ["B", "C"]
    assert search(client, board_id, due_before="2026-11-20T00:00:00Z") == ["A"]
    assert search(
        client, board_id, label_id=searchable["bug"], assignee_id=searchable["alice"]
    ) == ["C"]


def test_search_with_ids_from_elsewhere_finds_nothing(
    client: TestClient, searchable: dict
) -> None:
    assert search(client, searchable["board"], label_id=999) == []
    assert search(client, searchable["board"], assignee_id=999) == []


@pytest.mark.parametrize(
    "params",
    [
        {"due_before": "2026-11-20T00:00:00"},
        {"due_before": "soon"},
        {"label_id": 0},
        {"assignee_id": "bob"},
    ],
)
def test_search_invalid_filters(
    client: TestClient, searchable: dict, params: dict
) -> None:
    response = client.get(f"/boards/{searchable['board']}/cards", params=params)

    assert response.status_code == 422


def test_search_only_returns_that_boards_cards(client: TestClient) -> None:
    _, list_id = card_board(client)
    create_card(client, list_id, "Elsewhere")
    empty = create_board(client, "Empty")

    assert search(client, empty["id"]) == []


def test_viewer_can_search(
    client: TestClient, other_headers: dict, searchable: dict
) -> None:
    board_id = searchable["board"]
    client.patch(
        f"/boards/{board_id}/members/{searchable['bob']}", json={"role": "viewer"}
    )

    response = client.get(f"/boards/{board_id}/cards", headers=other_headers)

    assert response.status_code == 200
    assert len(response.json()) == 4


def test_other_users_search_returns_404(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)

    response = client.get(f"/boards/{board['id']}/cards", headers=other_headers)

    assert response.status_code == 404


# Archive and restore


def card_action(client: TestClient, card_id: int, action: str = "archive") -> dict:
    response = client.post(f"/cards/{card_id}/{action}")
    assert response.status_code == 200
    return response.json()


def list_action(client: TestClient, list_id: int, action: str = "archive") -> None:
    assert client.post(f"/lists/{list_id}/{action}").status_code == 200


def archived_titles(client: TestClient, list_id: int) -> list[str]:
    response = client.get(f"/lists/{list_id}/cards", params={"archived": True})
    assert response.status_code == 200
    return [card["title"] for card in response.json()]


def test_archive_card_hides_it_and_renumbers_the_rest(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")

    body = card_action(client, cards["B"]["id"])

    assert body["archived_at"] is not None
    assert body["position"] is None
    assert card_titles(client, list_id) == ["A", "C"]
    assert_positions_are_dense(client, list_id)
    assert archived_titles(client, list_id) == ["B"]
    assert client.get(f"/cards/{cards['B']['id']}").json() == body


def test_archived_cards_newest_first(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")
    for title in "BCA":
        card_action(client, cards[title]["id"])

    assert archived_titles(client, list_id) == ["A", "C", "B"]


def test_archived_card_keeps_its_details(client: TestClient) -> None:
    board_id, list_id = card_board(client)
    bug = create_label(client, board_id)
    card = create_card(
        client, list_id, due_at=DUE, label_ids=[bug], assignee_ids=[me(client)]
    )

    card_action(client, card["id"])
    restored = card_action(client, card["id"], "restore")

    assert restored == {**card, "archived_at": None}


def test_restore_card_puts_it_back_where_it_was(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")
    card_action(client, cards["A"]["id"])

    body = card_action(client, cards["A"]["id"], "restore")

    assert body["position"] == 0
    assert card_titles(client, list_id) == ["A", "B", "C"]
    assert archived_titles(client, list_id) == []


def test_restore_card_after_others_changed(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C", "D")
    card_action(client, cards["B"]["id"])  # was at 1
    client.patch(f"/cards/{cards['D']['id']}", json={"position": 0})  # D A C
    create_card(client, list_id, "E")  # D A C E

    card_action(client, cards["B"]["id"], "restore")

    assert card_titles(client, list_id) == ["D", "B", "A", "C", "E"]


def test_restore_card_goes_at_the_end_if_the_list_got_shorter(
    client: TestClient,
) -> None:
    list_id, cards = list_with_cards(client, "A", "B", "C")
    card_action(client, cards["C"]["id"])  # was at 2
    client.delete(f"/cards/{cards['A']['id']}")
    client.delete(f"/cards/{cards['B']['id']}")

    body = card_action(client, cards["C"]["id"], "restore")

    assert body["position"] == 0
    assert card_titles(client, list_id) == ["C"]


def test_new_card_after_archive_goes_to_the_end(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B")
    card_action(client, cards["B"]["id"])

    assert create_card(client, list_id, "C")["position"] == 1


@pytest.mark.parametrize(
    ("first", "again"), [("archive", "archive"), (None, "restore")]
)
def test_archive_or_restore_card_twice_returns_422(
    client: TestClient, first: str | None, again: str
) -> None:
    _, cards = list_with_cards(client, "A")
    if first:
        card_action(client, cards["A"]["id"], first)

    response = client.post(f"/cards/{cards['A']['id']}/{again}")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["path", "card_id"]


@pytest.mark.parametrize(
    "payload", [{"title": "New"}, {"position": 0}, {"label_ids": []}]
)
def test_change_archived_card_returns_422(client: TestClient, payload: dict) -> None:
    _, cards = list_with_cards(client, "A", "B")
    archived = card_action(client, cards["A"]["id"])

    response = client.patch(f"/cards/{cards['A']['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/cards/{cards['A']['id']}").json() == archived


def test_delete_archived_card(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B")
    card_action(client, cards["A"]["id"])

    assert client.delete(f"/cards/{cards['A']['id']}").status_code == 204

    assert archived_titles(client, list_id) == []
    assert card_titles(client, list_id) == ["B"]
    assert_positions_are_dense(client, list_id)


# Cards of an archived list are frozen


def test_archived_list_keeps_its_cards(client: TestClient) -> None:
    first, _, cards = two_lists(client)
    card_action(client, cards["B"]["id"])

    list_action(client, first)
    list_action(client, first, "restore")

    assert card_titles(client, first) == ["A", "C"]
    assert archived_titles(client, first) == ["B"]


@pytest.mark.parametrize(
    "payload", [{"title": "New"}, {"position": 1}, {"due_complete": True}]
)
def test_change_card_in_archived_list_returns_422(
    client: TestClient, payload: dict
) -> None:
    first, _, cards = two_lists(client)
    list_action(client, first)

    response = client.patch(f"/cards/{cards['A']['id']}", json=payload)

    assert response.status_code == 422
    assert card_titles(client, first) == ["A", "B", "C"]


def test_move_card_out_of_archived_list_returns_422(client: TestClient) -> None:
    first, second, cards = two_lists(client)
    list_action(client, first)

    response = client.patch(f"/cards/{cards['A']['id']}", json={"list_id": second})

    assert response.status_code == 422
    assert card_titles(client, first) == ["A", "B", "C"]
    assert card_titles(client, second) == ["X", "Y"]


def test_move_card_into_archived_list_returns_422(client: TestClient) -> None:
    first, second, cards = two_lists(client)
    list_action(client, second)

    response = client.patch(f"/cards/{cards['A']['id']}", json={"list_id": second})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "list_id"]
    assert card_titles(client, first) == ["A", "B", "C"]
    assert card_titles(client, second) == ["X", "Y"]


def test_create_card_in_archived_list_returns_422(client: TestClient) -> None:
    list_id, _ = list_with_cards(client, "A")
    list_action(client, list_id)

    response = client.post(f"/lists/{list_id}/cards", json={"title": "New"})

    assert response.status_code == 422
    assert card_titles(client, list_id) == ["A"]


@pytest.mark.parametrize("action", ["archive", "restore"])
def test_archive_or_restore_card_in_archived_list_returns_422(
    client: TestClient, action: str
) -> None:
    list_id, cards = list_with_cards(client, "A", "B")
    card_action(client, cards["B"]["id"])
    list_action(client, list_id)
    card = cards["A"] if action == "archive" else cards["B"]

    response = client.post(f"/cards/{card['id']}/{action}")

    assert response.status_code == 422


def test_delete_card_in_archived_list(client: TestClient) -> None:
    list_id, cards = list_with_cards(client, "A", "B")
    list_action(client, list_id)

    assert client.delete(f"/cards/{cards['A']['id']}").status_code == 204

    list_action(client, list_id, "restore")
    assert card_titles(client, list_id) == ["B"]
    assert_positions_are_dense(client, list_id)


# Search and archived items


def test_search_leaves_out_archived_cards_and_lists(client: TestClient) -> None:
    first, second, cards = two_lists(client)
    board_id = client.get(f"/lists/{first}").json()["board_id"]
    card_action(client, cards["B"]["id"])
    list_action(client, second)

    assert search(client, board_id) == ["A", "C"]
    assert search(client, board_id, archived=True) == ["B"]


def test_search_archived_cards_newest_first_with_filters(client: TestClient) -> None:
    board_id, list_id = card_board(client)
    bug = create_label(client, board_id)
    for title in ("A", "B", "C"):
        card = create_card(
            client, list_id, title, label_ids=[bug] if title != "B" else []
        )
        card_action(client, card["id"])

    assert search(client, board_id, archived=True) == ["C", "B", "A"]
    assert search(client, board_id, archived=True, label_id=bug) == ["C", "A"]


@pytest.mark.parametrize("action", ["archive", "restore"])
def test_other_users_card_archive_returns_404(
    client: TestClient, other_headers: dict, action: str
) -> None:
    _, cards = list_with_cards(client, "A")
    if action == "restore":
        card_action(client, cards["A"]["id"])

    response = client.post(f"/cards/{cards['A']['id']}/{action}", headers=other_headers)

    assert response.status_code == 404


# Done and comment counts, for the card front


def test_mark_done_without_a_due_date(client: TestClient) -> None:
    _, list_id = card_board(client)
    card = create_card(client, list_id)

    response = client.patch(f"/cards/{card['id']}", json={"due_complete": True})

    assert response.status_code == 200
    assert response.json()["due_complete"] is True
    assert response.json()["due_at"] is None
    # Setting a due date later keeps it done: it's one flag.
    later = client.patch(f"/cards/{card['id']}", json={"due_at": DUE}).json()
    assert later["due_complete"] is True


def test_new_card_has_no_comments(client: TestClient) -> None:
    _, list_id = card_board(client)

    assert create_card(client, list_id)["comment_count"] == 0


def test_comment_count_follows_comments(client: TestClient) -> None:
    board_id, list_id = card_board(client)
    card = create_card(client, list_id)
    other = create_card(client, list_id, "Other")
    comments = [
        client.post(f"/cards/{card['id']}/comments", json={"body": body}).json()
        for body in ("One", "Two")
    ]
    client.delete(f"/comments/{comments[0]['id']}")

    assert client.get(f"/cards/{card['id']}").json()["comment_count"] == 1
    counts = {c["id"]: c["comment_count"] for c in cards_in(client, list_id)}
    assert counts == {card["id"]: 1, other["id"]: 0}
    search = client.get(f"/boards/{board_id}/cards").json()
    assert {c["id"]: c["comment_count"] for c in search} == counts


def test_checklist_counts_follow_items(client: TestClient) -> None:
    board_id, list_id = card_board(client)
    card = create_card(client, list_id)
    assert (card["checklist_done"], card["checklist_total"]) == (0, 0)
    first = client.post(f"/cards/{card['id']}/checklists", json={}).json()
    second = client.post(f"/cards/{card['id']}/checklists", json={}).json()
    items = [
        client.post(f"/checklists/{checklist['id']}/items", json={"text": t}).json()
        for checklist, t in ((first, "A"), (first, "B"), (second, "C"))
    ]
    for item in items:
        client.patch(f"/checklist-items/{item['id']}", json={"done": True})
    client.patch(f"/checklist-items/{items[1]['id']}", json={"done": False})
    client.delete(f"/checklist-items/{items[0]['id']}")

    def counts(found: dict) -> tuple[int, int]:
        return found["checklist_done"], found["checklist_total"]

    assert counts(client.get(f"/cards/{card['id']}").json()) == (1, 2)
    assert counts(cards_in(client, list_id)[0]) == (1, 2)
    assert counts(client.get(f"/boards/{board_id}/cards").json()[0]) == (1, 2)
    snapshot = client.get(f"/boards/{board_id}/snapshot").json()
    assert counts(snapshot["lists"][0]["cards"][0]) == (1, 2)
    client.delete(f"/checklists/{second['id']}")
    assert counts(client.get(f"/cards/{card['id']}").json()) == (0, 1)


def test_card_carries_its_board_id(client: TestClient) -> None:
    board = create_board(client)
    board_list = create_list(client, board["id"])
    card = create_card(client, board_list["id"])

    assert card["board_id"] == board["id"]
    assert client.get(f"/cards/{card['id']}").json()["board_id"] == board["id"]
    assert cards_in(client, board_list["id"])[0]["board_id"] == board["id"]
    snapshot = client.get(f"/boards/{board['id']}/snapshot").json()
    assert snapshot["lists"][0]["cards"][0]["board_id"] == board["id"]
