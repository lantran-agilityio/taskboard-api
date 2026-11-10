from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

BOB = "bob@example.com"


def create_board(client: TestClient, name: str = "Project X") -> dict:
    response = client.post("/boards", json={"name": name})
    assert response.status_code == 201
    return response.json()


def close(client: TestClient, board_id: int) -> dict:
    response = client.post(f"/boards/{board_id}/close")
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def closed_board(client: TestClient, other_headers: dict) -> dict:
    """A closed board with Bob as an editor, lists A and B, and card C in A."""
    # other_headers registers Bob, so he can be invited.
    board = create_board(client)
    bob = client.post(
        f"/boards/{board['id']}/members", json={"email": BOB, "role": "editor"}
    ).json()
    lists = {
        name: client.post(f"/boards/{board['id']}/lists", json={"name": name}).json()
        for name in "AB"
    }
    card = client.post(f"/lists/{lists['A']['id']}/cards", json={"title": "C"}).json()
    comment = client.post(f"/cards/{card['id']}/comments", json={"body": "Hi"}).json()
    label = client.get(f"/boards/{board['id']}/labels").json()[0]
    return {
        "board": close(client, board["id"]),
        "bob": bob,
        "lists": lists,
        "card": card,
        "comment": comment,
        "label": label,
    }


def snapshot(client: TestClient, ids: dict) -> dict:
    board_id = ids["board"]["id"]
    lists = client.get(f"/boards/{board_id}/lists").json()
    return {
        "board": client.get(f"/boards/{board_id}").json(),
        "lists": lists,
        "cards": [client.get(f"/lists/{item['id']}/cards").json() for item in lists],
        "labels": client.get(f"/boards/{board_id}/labels").json(),
        "members": client.get(f"/boards/{board_id}/members").json(),
        "comments": client.get(f"/cards/{ids['card']['id']}/comments").json(),
        "activity": client.get(f"/boards/{board_id}/activity").json(),
    }


# Close and reopen


def test_close_board(client: TestClient) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/close")

    assert response.status_code == 200
    body = response.json()
    assert body == {**board, "closed_at": body["closed_at"]}
    assert body["closed_at"].endswith("Z")
    # Still readable.
    assert client.get(f"/boards/{board['id']}").json() == body


def test_reopen_board(client: TestClient) -> None:
    board = create_board(client)
    close(client, board["id"])

    response = client.post(f"/boards/{board['id']}/reopen")

    assert response.status_code == 200
    assert response.json() == board
    assert (
        client.post(f"/boards/{board['id']}/lists", json={"name": "A"}).status_code
        == 201
    )


def test_close_closed_board_returns_422(client: TestClient) -> None:
    board = close(client, create_board(client)["id"])

    response = client.post(f"/boards/{board['id']}/close")

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Board is already closed"
    assert client.get(f"/boards/{board['id']}").json() == board


def test_reopen_open_board_returns_422(client: TestClient) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/reopen")

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Board is not closed"


@pytest.mark.parametrize("action", ["close", "reopen"])
def test_close_missing_board_returns_404(client: TestClient, action: str) -> None:
    assert client.post(f"/boards/999/{action}").status_code == 404


@pytest.mark.parametrize("action", ["close", "reopen"])
def test_other_users_board_close_returns_404(
    client: TestClient, other_headers: dict, action: str
) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/{action}", headers=other_headers)

    assert response.status_code == 404


def test_delete_closed_board(client: TestClient) -> None:
    board = close(client, create_board(client)["id"])

    assert client.delete(f"/boards/{board['id']}").status_code == 204
    assert client.get(f"/boards/{board['id']}").status_code == 404
    assert client.get("/boards", params={"closed": True}).json() == []


# Listing


def test_list_boards_leaves_out_closed_ones(client: TestClient) -> None:
    first = create_board(client, "First")
    create_board(client, "Second")
    third = create_board(client, "Third")
    close(client, first["id"])
    close(client, third["id"])

    open_boards = client.get("/boards").json()
    closed_boards = client.get("/boards", params={"closed": True}).json()

    assert [board["name"] for board in open_boards] == ["Second"]
    # Most recently closed first.
    assert [board["name"] for board in closed_boards] == ["Third", "First"]


def test_closed_boards_show_their_star(client: TestClient) -> None:
    board = create_board(client)
    client.put(f"/boards/{board['id']}/star")
    close(client, board["id"])

    [closed] = client.get("/boards", params={"closed": True}).json()

    assert closed["starred"] is True


def test_members_see_closed_boards(
    client: TestClient, other_headers: dict, closed_board: dict
) -> None:
    boards = client.get("/boards", params={"closed": True}, headers=other_headers)

    assert [board["id"] for board in boards.json()] == [closed_board["board"]["id"]]
    assert client.get("/boards", headers=other_headers).json() == []


# A closed board is read-only

Request = Callable[[dict], tuple[str, str, dict | None]]

WRITES: dict[str, Request] = {
    "rename board": lambda s: ("PATCH", f"/boards/{s['board']['id']}", {"name": "N"}),
    "describe board": lambda s: (
        "PATCH",
        f"/boards/{s['board']['id']}",
        {"description": "N"},
    ),
    "create list": lambda s: (
        "POST",
        f"/boards/{s['board']['id']}/lists",
        {"name": "N"},
    ),
    "rename list": lambda s: (
        "PATCH",
        f"/lists/{s['lists']['A']['id']}",
        {"name": "N"},
    ),
    "sort list": lambda s: (
        "POST",
        f"/lists/{s['lists']['A']['id']}/sort",
        {"by": "title"},
    ),
    "delete list": lambda s: ("DELETE", f"/lists/{s['lists']['B']['id']}", None),
    "archive list": lambda s: ("POST", f"/lists/{s['lists']['B']['id']}/archive", None),
    "create card": lambda s: (
        "POST",
        f"/lists/{s['lists']['A']['id']}/cards",
        {"title": "N"},
    ),
    "change card": lambda s: ("PATCH", f"/cards/{s['card']['id']}", {"title": "N"}),
    "move card": lambda s: (
        "PATCH",
        f"/cards/{s['card']['id']}",
        {"list_id": s["lists"]["B"]["id"]},
    ),
    "delete card": lambda s: ("DELETE", f"/cards/{s['card']['id']}", None),
    "archive card": lambda s: ("POST", f"/cards/{s['card']['id']}/archive", None),
    "create label": lambda s: (
        "POST",
        f"/boards/{s['board']['id']}/labels",
        {"color": "red"},
    ),
    "change label": lambda s: ("PATCH", f"/labels/{s['label']['id']}", {"name": "N"}),
    "delete label": lambda s: ("DELETE", f"/labels/{s['label']['id']}", None),
    "comment": lambda s: ("POST", f"/cards/{s['card']['id']}/comments", {"body": "N"}),
    "edit comment": lambda s: (
        "PATCH",
        f"/comments/{s['comment']['id']}",
        {"body": "N"},
    ),
    "delete comment": lambda s: ("DELETE", f"/comments/{s['comment']['id']}", None),
    "add member": lambda s: (
        "POST",
        f"/boards/{s['board']['id']}/members",
        {"email": "carol@example.com", "role": "viewer"},
    ),
    "change role": lambda s: (
        "PATCH",
        f"/boards/{s['board']['id']}/members/{s['bob']['user_id']}",
        {"role": "viewer"},
    ),
    "remove member": lambda s: (
        "DELETE",
        f"/boards/{s['board']['id']}/members/{s['bob']['user_id']}",
        None,
    ),
}


@pytest.mark.parametrize("action", WRITES)
def test_closed_board_is_read_only(
    client: TestClient, closed_board: dict, action: str
) -> None:
    before = snapshot(client, closed_board)
    method, path, json = WRITES[action](closed_board)

    response = client.request(method, path, json=json)

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Board is closed"
    assert snapshot(client, closed_board) == before


def test_viewers_get_403_before_422(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    client.post(f"/boards/{board['id']}/members", json={"email": BOB, "role": "viewer"})
    close(client, board["id"])

    response = client.post(
        f"/boards/{board['id']}/lists", json={"name": "N"}, headers=other_headers
    )

    assert response.status_code == 403


def test_closed_board_can_still_be_read(
    client: TestClient, other_headers: dict, closed_board: dict
) -> None:
    card_id = closed_board["card"]["id"]

    assert client.get(f"/cards/{card_id}", headers=other_headers).status_code == 200
    response = client.get(f"/cards/{card_id}/comments", headers=other_headers)
    assert response.status_code == 200


def test_member_can_leave_closed_board(
    client: TestClient, other_headers: dict, closed_board: dict
) -> None:
    board_id = closed_board["board"]["id"]
    bob = closed_board["bob"]["user_id"]

    response = client.delete(f"/boards/{board_id}/members/{bob}", headers=other_headers)

    assert response.status_code == 204
    assert client.get(f"/boards/{board_id}", headers=other_headers).status_code == 404


def test_star_closed_board(client: TestClient, closed_board: dict) -> None:
    board_id = closed_board["board"]["id"]

    # Stars are the user's own, not part of the board.
    assert client.put(f"/boards/{board_id}/star").status_code == 204
    assert client.get(f"/boards/{board_id}").json()["starred"] is True


def test_closing_is_logged(client: TestClient, closed_board: dict) -> None:
    board_id = closed_board["board"]["id"]
    client.post(f"/boards/{board_id}/reopen")

    items = client.get(f"/boards/{board_id}/activity").json()["items"]

    assert [item["type"] for item in items[:2]] == ["board.reopened", "board.closed"]
