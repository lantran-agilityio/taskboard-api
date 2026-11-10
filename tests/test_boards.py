import pytest
from fastapi.testclient import TestClient


def create_board(client: TestClient, name: str = "Project X") -> dict:
    response = client.post("/boards", json={"name": name})
    assert response.status_code == 201
    return response.json()


# Create


def test_create_board(client: TestClient) -> None:
    response = client.post("/boards", json={"name": "Project X"})

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "Project X",
        "description": None,
        "created_at": body["created_at"],
        "closed_at": None,
        "starred": False,
    }


def test_create_board_strips_whitespace(client: TestClient) -> None:
    board = create_board(client, "  Project X  ")

    assert board["name"] == "Project X"


@pytest.mark.parametrize(
    "payload",
    [{}, {"name": ""}, {"name": "   "}, {"name": "x" * 101}, {"name": 123}],
)
def test_create_board_invalid_name(client: TestClient, payload: dict) -> None:
    response = client.post("/boards", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize("description", ["", "What this board is for", "x" * 2000])
def test_create_board_with_description(client: TestClient, description: str) -> None:
    response = client.post(
        "/boards", json={"name": "Project X", "description": description}
    )

    assert response.status_code == 201
    assert response.json()["description"] == description


def test_create_board_description_too_long(client: TestClient) -> None:
    response = client.post("/boards", json={"name": "X", "description": "x" * 2001})

    assert response.status_code == 422
    assert client.get("/boards").json() == []


# List


def test_list_boards_empty(client: TestClient) -> None:
    response = client.get("/boards")

    assert response.status_code == 200
    assert response.json() == []


def test_list_boards_in_creation_order(client: TestClient) -> None:
    create_board(client, "First")
    create_board(client, "Second")

    response = client.get("/boards")

    assert response.status_code == 200
    assert [board["name"] for board in response.json()] == ["First", "Second"]


# Get


def test_get_board(client: TestClient) -> None:
    board = create_board(client)

    response = client.get(f"/boards/{board['id']}")

    assert response.status_code == 200
    assert response.json() == board


def test_get_missing_board_returns_404(client: TestClient) -> None:
    response = client.get("/boards/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Board not found"}


def test_get_board_with_non_integer_id_returns_422(client: TestClient) -> None:
    response = client.get("/boards/abc")

    assert response.status_code == 422


# Rename


def test_rename_board(client: TestClient) -> None:
    board = create_board(client, "Old name")

    response = client.patch(f"/boards/{board['id']}", json={"name": "New name"})

    assert response.status_code == 200
    assert response.json()["name"] == "New name"
    assert response.json()["id"] == board["id"]
    assert client.get(f"/boards/{board['id']}").json()["name"] == "New name"


@pytest.mark.parametrize(
    ("payload", "name", "description"),
    [
        ({"description": "New"}, "Old name", "New"),
        ({"description": None}, "Old name", None),
        ({"description": ""}, "Old name", ""),
        ({"name": "New name", "description": "New"}, "New name", "New"),
        # Leaving description out keeps it.
        ({"name": "New name"}, "New name", "About"),
    ],
)
def test_update_board(
    client: TestClient, payload: dict, name: str, description: str | None
) -> None:
    board = client.post(
        "/boards", json={"name": "Old name", "description": "About"}
    ).json()

    response = client.patch(f"/boards/{board['id']}", json=payload)

    assert response.status_code == 200
    expected = {**board, "name": name, "description": description}
    assert response.json() == expected
    assert client.get(f"/boards/{board['id']}").json() == expected


@pytest.mark.parametrize(
    "payload",
    [{}, {"name": None}, {"name": ""}, {"description": "x" * 2001}],
)
def test_update_board_invalid_payload(client: TestClient, payload: dict) -> None:
    board = client.post("/boards", json={"name": "Old", "description": "About"}).json()

    response = client.patch(f"/boards/{board['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/boards/{board['id']}").json() == board


def test_rename_missing_board_returns_404(client: TestClient) -> None:
    response = client.patch("/boards/999", json={"name": "New name"})

    assert response.status_code == 404


def test_rename_board_invalid_name(client: TestClient) -> None:
    board = create_board(client, "Old name")

    response = client.patch(f"/boards/{board['id']}", json={"name": ""})

    assert response.status_code == 422
    assert client.get(f"/boards/{board['id']}").json()["name"] == "Old name"


# Delete


def test_delete_board(client: TestClient) -> None:
    board = create_board(client)

    response = client.delete(f"/boards/{board['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/boards/{board['id']}").status_code == 404
    assert client.get("/boards").json() == []


def test_delete_missing_board_returns_404(client: TestClient) -> None:
    response = client.delete("/boards/999")

    assert response.status_code == 404


# Stars


def test_star_and_unstar_board(client: TestClient) -> None:
    board = create_board(client)
    path = f"/boards/{board['id']}/star"

    starred = client.put(path)
    # Starring twice is fine, like unstarring a board that isn't starred.
    again = client.put(path)

    assert (starred.status_code, again.status_code) == (204, 204)
    assert starred.content == b""
    assert client.get(f"/boards/{board['id']}").json()["starred"] is True
    assert [item["starred"] for item in client.get("/boards").json()] == [True]

    assert client.delete(path).status_code == 204
    assert client.delete(path).status_code == 204
    assert client.get(f"/boards/{board['id']}").json() == board


def test_list_boards_shows_which_are_starred(client: TestClient) -> None:
    first = create_board(client, "First")
    second = create_board(client, "Second")
    create_board(client, "Third")
    client.put(f"/boards/{first['id']}/star")
    client.put(f"/boards/{second['id']}/star")
    client.delete(f"/boards/{second['id']}/star")

    boards = client.get("/boards").json()

    assert [(item["name"], item["starred"]) for item in boards] == [
        ("First", True),
        ("Second", False),
        ("Third", False),
    ]


def test_stars_are_per_user(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    client.post(
        f"/boards/{board['id']}/members",
        json={"email": "bob@example.com", "role": "viewer"},
    )

    client.put(f"/boards/{board['id']}/star", headers=other_headers)

    assert client.get(f"/boards/{board['id']}").json()["starred"] is False
    bobs = client.get(f"/boards/{board['id']}", headers=other_headers).json()
    assert bobs["starred"] is True


def test_starring_is_not_logged(client: TestClient) -> None:
    board = create_board(client)

    client.put(f"/boards/{board['id']}/star")
    client.delete(f"/boards/{board['id']}/star")

    assert client.get(f"/boards/{board['id']}/activity").json()["items"] == []


def test_star_missing_board_returns_404(client: TestClient) -> None:
    assert client.put("/boards/999/star").status_code == 404
    assert client.delete("/boards/999/star").status_code == 404


def test_delete_starred_board(client: TestClient) -> None:
    board = create_board(client)
    client.put(f"/boards/{board['id']}/star")

    assert client.delete(f"/boards/{board['id']}").status_code == 204
    assert client.get("/boards").json() == []


# Ownership


def test_list_boards_only_returns_your_own(
    client: TestClient, other_headers: dict
) -> None:
    create_board(client, "Alice's")
    client.post("/boards", json={"name": "Bob's"}, headers=other_headers)

    response = client.get("/boards")

    assert [board["name"] for board in response.json()] == ["Alice's"]


@pytest.mark.parametrize(
    ("method", "suffix", "json"),
    [
        ("GET", "", None),
        ("PATCH", "", {"name": "Hacked"}),
        ("PATCH", "", {"description": "Hacked"}),
        ("DELETE", "", None),
        ("PUT", "/star", None),
        ("DELETE", "/star", None),
    ],
)
def test_other_users_board_returns_404(
    client: TestClient,
    other_headers: dict,
    method: str,
    suffix: str,
    json: dict | None,
) -> None:
    board = create_board(client)

    response = client.request(
        method, f"/boards/{board['id']}{suffix}", json=json, headers=other_headers
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Board not found"}
    assert client.get(f"/boards/{board['id']}").json() == board


def test_timestamps_are_in_utc(client: TestClient) -> None:
    # Postgres returns timestamptz in the connection's time zone; the API
    # answers in UTC everywhere, as it already did for due_at and archived_at.
    board = client.post("/boards", json={"name": "UTC"}).json()
    board_list = client.post(f"/boards/{board['id']}/lists", json={"name": "L"}).json()
    card = client.post(f"/lists/{board_list['id']}/cards", json={"title": "C"}).json()
    responses = [
        client.get("/users/me").json(),
        client.get(f"/boards/{board['id']}").json(),
        client.get(f"/lists/{board_list['id']}").json(),
        client.get(f"/cards/{card['id']}").json(),
    ]

    assert [item["created_at"][-1] for item in responses] == ["Z"] * 4
