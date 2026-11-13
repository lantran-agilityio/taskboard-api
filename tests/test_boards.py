import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session


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
        "role": "owner",
        "list_count": 0,
        "card_count": 0,
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

    entries = client.get(f"/boards/{board['id']}/activity").json()["items"]
    assert [entry["type"] for entry in entries] == ["board.created"]


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


# Snapshot


def test_snapshot_of_empty_board(client: TestClient) -> None:
    board = create_board(client)

    response = client.get(f"/boards/{board['id']}/snapshot")

    assert response.status_code == 200
    assert response.json() == {"board": board, "lists": []}


def test_snapshot_has_active_lists_and_cards_in_order(client: TestClient) -> None:
    board = create_board(client)
    board_id = board["id"]
    lists = [
        client.post(f"/boards/{board_id}/lists", json={"name": n}).json()
        for n in ("A", "B", "Gone")
    ]
    a, b, gone = (item["id"] for item in lists)
    client.post(f"/lists/{gone}/archive")
    client.patch(f"/lists/{b}", json={"position": 0})
    label = client.get(f"/boards/{board_id}/labels").json()[0]["id"]
    me = client.get("/users/me").json()["id"]
    first = client.post(
        f"/lists/{a}/cards",
        json={"title": "First", "label_ids": [label], "assignee_ids": [me]},
    ).json()
    old = client.post(f"/lists/{a}/cards", json={"title": "Old"}).json()
    second = client.post(f"/lists/{a}/cards", json={"title": "Second"}).json()
    client.post(f"/cards/{old['id']}/archive")
    client.post(f"/cards/{first['id']}/comments", json={"body": "Hi"})
    client.put(f"/boards/{board_id}/star")

    body = client.get(f"/boards/{board_id}/snapshot").json()

    # Lists A and B (Gone is archived); First and Second (Old is archived).
    assert body["board"] == {**board, "starred": True, "list_count": 2, "card_count": 2}
    assert [item["name"] for item in body["lists"]] == ["B", "A"]
    assert body["lists"][0]["cards"] == []
    assert body["lists"][1] == {
        **client.get(f"/lists/{a}").json(),
        "cards": client.get(f"/lists/{a}/cards").json(),
    }
    cards = body["lists"][1]["cards"]
    assert [card["id"] for card in cards] == [first["id"], second["id"]]
    assert cards[0]["label_ids"] == [label]
    assert cards[0]["assignee_ids"] == [me]
    assert cards[0]["comment_count"] == 1


def test_viewer_can_read_snapshot(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    client.post(
        f"/boards/{board['id']}/members",
        json={"email": "bob@example.com", "role": "viewer"},
    )

    response = client.get(f"/boards/{board['id']}/snapshot", headers=other_headers)

    assert response.status_code == 200


def test_snapshot_of_closed_board(client: TestClient) -> None:
    board = create_board(client)
    client.post(f"/boards/{board['id']}/close")

    assert client.get(f"/boards/{board['id']}/snapshot").status_code == 200


def test_snapshot_of_someone_elses_board_returns_404(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)

    response = client.get(f"/boards/{board['id']}/snapshot", headers=other_headers)

    assert response.status_code == 404


def count_snapshot_queries(client: TestClient, db: Session, board_id: int) -> int:
    statements = []

    def record(*args: object) -> None:
        statements.append(args)

    connection = db.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        assert client.get(f"/boards/{board_id}/snapshot").status_code == 200
    finally:
        event.remove(connection, "before_cursor_execute", record)
    return len(statements)


def test_snapshot_query_count_does_not_grow_with_the_board(
    client: TestClient, db: Session
) -> None:
    board_id = create_board(client)["id"]

    def add_list_with_cards() -> None:
        board_list = client.post(f"/boards/{board_id}/lists", json={"name": "L"}).json()
        for title in ("A", "B"):
            client.post(f"/lists/{board_list['id']}/cards", json={"title": title})

    add_list_with_cards()
    small = count_snapshot_queries(client, db, board_id)
    for _ in range(4):
        add_list_with_cards()

    assert count_snapshot_queries(client, db, board_id) == small


# Role and counts, for the home screen


def share_with_bob(client: TestClient, board_id: int, role: str) -> None:
    response = client.post(
        f"/boards/{board_id}/members",
        json={"email": "bob@example.com", "role": role},
    )
    assert response.status_code == 201


@pytest.mark.parametrize("role", ["editor", "viewer"])
def test_board_has_the_callers_role(
    client: TestClient, other_headers: dict, role: str
) -> None:
    board = create_board(client)
    share_with_bob(client, board["id"], role)

    assert client.get(f"/boards/{board['id']}").json()["role"] == "owner"
    bobs = client.get(f"/boards/{board['id']}", headers=other_headers).json()
    assert bobs["role"] == role
    listed = client.get("/boards", headers=other_headers).json()
    assert [item["role"] for item in listed] == [role]


def test_counts_leave_out_archived_lists_and_cards(client: TestClient) -> None:
    board_id = create_board(client)["id"]
    a, b, gone = (
        client.post(f"/boards/{board_id}/lists", json={"name": n}).json()["id"]
        for n in ("A", "B", "Gone")
    )
    for list_id, titles in ((a, "123"), (b, "4"), (gone, "56")):
        for title in titles:
            client.post(f"/lists/{list_id}/cards", json={"title": title})
    old = client.get(f"/lists/{a}/cards").json()[0]
    client.post(f"/cards/{old['id']}/archive")
    client.post(f"/lists/{gone}/archive")

    body = client.get(f"/boards/{board_id}").json()

    assert (body["list_count"], body["card_count"]) == (2, 3)
    listed = client.get("/boards").json()[0]
    assert (listed["list_count"], listed["card_count"]) == (2, 3)
    snapshot = client.get(f"/boards/{board_id}/snapshot").json()["board"]
    assert (snapshot["list_count"], snapshot["card_count"]) == (2, 3)


def test_counts_of_a_board_with_empty_lists(client: TestClient) -> None:
    board_id = create_board(client)["id"]
    client.post(f"/boards/{board_id}/lists", json={"name": "A"})

    body = client.get(f"/boards/{board_id}").json()

    assert (body["list_count"], body["card_count"]) == (1, 0)


def test_closed_boards_have_role_and_counts(client: TestClient) -> None:
    board_id = create_board(client)["id"]
    client.post(f"/boards/{board_id}/lists", json={"name": "A"})
    closed = client.post(f"/boards/{board_id}/close").json()

    listed = client.get("/boards", params={"closed": True}).json()

    assert listed == [closed]
    assert (closed["role"], closed["list_count"]) == ("owner", 1)


def count_list_queries(client: TestClient, db: Session, headers: dict) -> int:
    statements = []

    def record(*args: object) -> None:
        statements.append(args)

    connection = db.connection()
    event.listen(connection, "before_cursor_execute", record)
    try:
        assert client.get("/boards", headers=headers).status_code == 200
    finally:
        event.remove(connection, "before_cursor_execute", record)
    return len(statements)


def test_list_boards_query_count_does_not_grow(
    client: TestClient, db: Session, other_headers: dict
) -> None:
    def add_board() -> None:
        board_id = create_board(client)["id"]
        share_with_bob(client, board_id, "editor")
        client.post(f"/boards/{board_id}/lists", json={"name": "A"})

    add_board()
    small = count_list_queries(client, db, other_headers)
    for _ in range(4):
        add_board()

    assert count_list_queries(client, db, other_headers) == small
