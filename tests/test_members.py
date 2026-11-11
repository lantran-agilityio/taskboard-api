from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.board_member import BoardMember
from tests.conftest import auth_headers

BOB = "bob@example.com"


def create_board(client: TestClient, name: str = "Project X") -> dict:
    response = client.post("/boards", json={"name": name})
    assert response.status_code == 201
    return response.json()


def share(client: TestClient, board_id: int, email: str, role: str) -> dict:
    response = client.post(
        f"/boards/{board_id}/members", json={"email": email, "role": role}
    )
    assert response.status_code == 201
    return response.json()


def user_id(client: TestClient, headers: dict) -> int:
    return client.get("/users/me", headers=headers).json()["id"]


def members(client: TestClient, board_id: int, headers: dict | None = None) -> list:
    response = client.get(f"/boards/{board_id}/members", headers=headers)
    assert response.status_code == 200
    return [(member["email"], member["role"]) for member in response.json()]


# Add


def test_add_member(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)

    response = client.post(
        f"/boards/{board['id']}/members", json={"email": BOB, "role": "viewer"}
    )

    assert response.status_code == 201
    assert response.json() == {
        "user_id": user_id(client, other_headers),
        "email": BOB,
        "role": "viewer",
    }
    shared = client.get("/boards", headers=other_headers).json()
    assert [item["id"] for item in shared] == [board["id"]]


def test_add_member_email_is_case_insensitive(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)

    member = share(client, board["id"], "BOB@Example.com", "editor")

    assert member["email"] == BOB


def test_add_unknown_email_returns_422(client: TestClient) -> None:
    board = create_board(client)

    response = client.post(
        f"/boards/{board['id']}/members",
        json={"email": "nobody@example.com", "role": "viewer"},
    )

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "email"]


@pytest.mark.parametrize("email", [BOB, "alice@example.com"])
def test_add_someone_already_on_the_board_returns_409(
    client: TestClient, other_headers: dict, email: str
) -> None:
    board = create_board(client)
    share(client, board["id"], BOB, "viewer")

    response = client.post(
        f"/boards/{board['id']}/members", json={"email": email, "role": "editor"}
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "User is already on this board"}
    assert members(client, board["id"]) == [
        ("alice@example.com", "owner"),
        (BOB, "viewer"),
    ]


@pytest.mark.parametrize(
    "payload",
    [
        {"email": BOB, "role": "owner"},
        {"email": BOB, "role": "admin"},
        {"email": BOB},
        {"role": "viewer"},
    ],
)
def test_add_member_invalid_payload(
    client: TestClient, other_headers: dict, payload: dict
) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/members", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize("role", ["viewer", "editor"])
def test_only_the_owner_can_add_members(
    client: TestClient, other_headers: dict, role: str
) -> None:
    board = create_board(client)
    share(client, board["id"], BOB, role)
    auth_headers(client, "carol@example.com")

    response = client.post(
        f"/boards/{board['id']}/members",
        json={"email": "carol@example.com", "role": "viewer"},
        headers=other_headers,
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Requires the owner role"}


def test_non_member_adding_members_gets_404(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)

    response = client.post(
        f"/boards/{board['id']}/members",
        json={"email": BOB, "role": "editor"},
        headers=other_headers,
    )

    assert response.status_code == 404


# List


def test_list_members_owner_first(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    auth_headers(client, "carol@example.com")
    share(client, board["id"], BOB, "editor")
    share(client, board["id"], "carol@example.com", "viewer")

    expected = [
        ("alice@example.com", "owner"),
        (BOB, "editor"),
        ("carol@example.com", "viewer"),
    ]
    assert members(client, board["id"]) == expected
    assert members(client, board["id"], other_headers) == expected


def test_non_member_listing_members_gets_404(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)

    response = client.get(f"/boards/{board['id']}/members", headers=other_headers)

    assert response.status_code == 404


# Change role


def test_change_role(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    bob = share(client, board["id"], BOB, "viewer")
    create_list = {"json": {"name": "To do"}, "headers": other_headers}
    assert client.post(f"/boards/{board['id']}/lists", **create_list).status_code == 403

    response = client.patch(
        f"/boards/{board['id']}/members/{bob['user_id']}", json={"role": "editor"}
    )

    assert response.status_code == 200
    assert response.json()["role"] == "editor"
    assert client.post(f"/boards/{board['id']}/lists", **create_list).status_code == 201


def test_change_owner_role_returns_422(client: TestClient) -> None:
    board = create_board(client)
    alice_id = user_id(client, {})

    response = client.patch(
        f"/boards/{board['id']}/members/{alice_id}", json={"role": "viewer"}
    )

    assert response.status_code == 422
    assert members(client, board["id"]) == [("alice@example.com", "owner")]


def test_change_role_of_non_member_returns_404(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)

    response = client.patch(
        f"/boards/{board['id']}/members/{user_id(client, other_headers)}",
        json={"role": "editor"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Member not found"}


def test_only_the_owner_can_change_roles(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)
    bob = share(client, board["id"], BOB, "editor")

    response = client.patch(
        f"/boards/{board['id']}/members/{bob['user_id']}",
        json={"role": "viewer"},
        headers=other_headers,
    )

    assert response.status_code == 403
    assert members(client, board["id"])[1] == (BOB, "editor")


@pytest.mark.parametrize("payload", [{}, {"role": "owner"}])
def test_change_role_invalid_payload(
    client: TestClient, other_headers: dict, payload: dict
) -> None:
    board = create_board(client)
    bob = share(client, board["id"], BOB, "viewer")

    response = client.patch(
        f"/boards/{board['id']}/members/{bob['user_id']}", json=payload
    )

    assert response.status_code == 422


# Remove


def test_owner_removes_member(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    bob = share(client, board["id"], BOB, "editor")

    response = client.delete(f"/boards/{board['id']}/members/{bob['user_id']}")

    assert response.status_code == 204
    assert (
        client.get(f"/boards/{board['id']}", headers=other_headers).status_code == 404
    )
    assert client.get("/boards", headers=other_headers).json() == []


def test_member_leaves_the_board(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    bob = share(client, board["id"], BOB, "viewer")

    response = client.delete(
        f"/boards/{board['id']}/members/{bob['user_id']}", headers=other_headers
    )

    assert response.status_code == 204
    assert members(client, board["id"]) == [("alice@example.com", "owner")]


def test_removed_member_loses_their_star(
    client: TestClient, other_headers: dict
) -> None:
    board = create_board(client)
    bob = share(client, board["id"], BOB, "viewer")
    client.put(f"/boards/{board['id']}/star", headers=other_headers)
    client.delete(f"/boards/{board['id']}/members/{bob['user_id']}")

    share(client, board["id"], BOB, "viewer")

    bobs = client.get(f"/boards/{board['id']}", headers=other_headers).json()
    assert bobs["starred"] is False


def test_member_cannot_remove_others(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)
    share(client, board["id"], BOB, "editor")
    carol_headers = auth_headers(client, "carol@example.com")
    carol = share(client, board["id"], "carol@example.com", "viewer")

    response = client.delete(
        f"/boards/{board['id']}/members/{carol['user_id']}", headers=other_headers
    )

    assert response.status_code == 403
    assert (
        client.get(f"/boards/{board['id']}", headers=carol_headers).status_code == 200
    )


@pytest.mark.parametrize("as_owner", [True, False])
def test_nobody_can_remove_the_owner(
    client: TestClient, other_headers: dict, as_owner: bool
) -> None:
    board = create_board(client)
    share(client, board["id"], BOB, "editor")
    alice_id = user_id(client, {})

    response = client.delete(
        f"/boards/{board['id']}/members/{alice_id}",
        headers={} if as_owner else other_headers,
    )

    assert response.status_code == 422
    assert members(client, board["id"])[0] == ("alice@example.com", "owner")


def test_remove_non_member_returns_404(client: TestClient, other_headers: dict) -> None:
    board = create_board(client)

    response = client.delete(
        f"/boards/{board['id']}/members/{user_id(client, other_headers)}"
    )

    assert response.status_code == 404


def test_delete_board_deletes_memberships(
    client: TestClient, other_headers: dict, db: Session
) -> None:
    board = create_board(client)
    share(client, board["id"], BOB, "editor")

    assert client.delete(f"/boards/{board['id']}").status_code == 204

    assert db.scalars(select(BoardMember)).all() == []


# Removing someone unassigns them


def assigned_card(client: TestClient, board_id: int, assignees: list[int]) -> int:
    board_list = client.post(f"/boards/{board_id}/lists", json={"name": "A"}).json()
    response = client.post(
        f"/lists/{board_list['id']}/cards",
        json={"title": "C", "assignee_ids": assignees},
    )
    assert response.status_code == 201
    return response.json()["id"]


@pytest.mark.parametrize("by_owner", [True, False])
def test_leaving_a_board_unassigns_from_its_cards_only(
    client: TestClient, other_headers: dict, by_owner: bool
) -> None:
    alice = user_id(client, client.headers)
    bob = user_id(client, other_headers)
    board = create_board(client, "Shared")
    other = create_board(client, "Also shared")
    for item in (board, other):
        share(client, item["id"], BOB, "editor")
    here = assigned_card(client, board["id"], [alice, bob])
    there = assigned_card(client, other["id"], [bob])

    headers = None if by_owner else other_headers
    response = client.delete(f"/boards/{board['id']}/members/{bob}", headers=headers)

    assert response.status_code == 204
    assert client.get(f"/cards/{here}").json()["assignee_ids"] == [alice]
    assert client.get(f"/cards/{there}").json()["assignee_ids"] == [bob]


# What each role may do


@pytest.fixture
def shared_board(client: TestClient) -> dict:
    """Alice's board: lists A (card C, archived card Old), B, archived list D."""
    board = create_board(client)
    lists = {
        name: client.post(f"/boards/{board['id']}/lists", json={"name": name}).json()
        for name in "AB"
    }
    card = client.post(f"/lists/{lists['A']['id']}/cards", json={"title": "C"}).json()
    label = client.post(
        f"/boards/{board['id']}/labels", json={"name": "L", "color": "red"}
    ).json()
    archived_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "D"}
    ).json()
    client.post(f"/lists/{archived_list['id']}/archive")
    archived_card = client.post(
        f"/lists/{lists['A']['id']}/cards", json={"title": "Old"}
    ).json()
    client.post(f"/cards/{archived_card['id']}/archive")
    comment = client.post(f"/cards/{card['id']}/comments", json={"body": "Hi"}).json()
    checklist = client.post(f"/cards/{card['id']}/checklists", json={}).json()
    item = client.post(
        f"/checklists/{checklist['id']}/items", json={"text": "Step"}
    ).json()
    return {
        "checklist": checklist,
        "item": item,
        "board": board,
        "lists": lists,
        "card": card,
        "label": label,
        "archived_list": archived_list,
        "archived_card": archived_card,
        "comment": comment,
    }


def snapshot(client: TestClient, ids: dict) -> dict:
    """Everything on the board, as Alice sees it."""
    board_id = ids["board"]["id"]
    lists = client.get(f"/boards/{board_id}/lists").json()
    return {
        "board": client.get(f"/boards/{board_id}").json(),
        "lists": lists,
        "cards": [client.get(f"/lists/{item['id']}/cards").json() for item in lists],
        "labels": client.get(f"/boards/{board_id}/labels").json(),
        "archived lists": client.get(
            f"/boards/{board_id}/lists", params={"archived": True}
        ).json(),
        "archived cards": client.get(
            f"/boards/{board_id}/cards", params={"archived": True}
        ).json(),
        "comments": client.get(f"/cards/{ids['card']['id']}/comments").json(),
        "checklists": client.get(f"/cards/{ids['card']['id']}/checklists").json(),
        # A refused request must not be logged either.
        "activity": client.get(f"/boards/{board_id}/activity").json(),
    }


Request = Callable[[dict], tuple[str, str, dict | None]]

ACTIONS: dict[str, tuple[Request, int, int]] = {
    # name: (request, status for a viewer, status for an editor)
    "read board": (lambda s: ("GET", f"/boards/{s['board']['id']}", None), 200, 200),
    "rename board": (
        lambda s: ("PATCH", f"/boards/{s['board']['id']}", {"name": "New"}),
        403,
        403,
    ),
    "delete board": (
        lambda s: ("DELETE", f"/boards/{s['board']['id']}", None),
        403,
        403,
    ),
    "close board": (
        lambda s: ("POST", f"/boards/{s['board']['id']}/close", None),
        403,
        403,
    ),
    # The board is open, but the role check comes first.
    "reopen board": (
        lambda s: ("POST", f"/boards/{s['board']['id']}/reopen", None),
        403,
        403,
    ),
    "describe board": (
        lambda s: ("PATCH", f"/boards/{s['board']['id']}", {"description": "New"}),
        403,
        200,
    ),
    # A star is Bob's own, so it changes nothing Alice sees.
    "star board": (
        lambda s: ("PUT", f"/boards/{s['board']['id']}/star", None),
        204,
        204,
    ),
    "unstar board": (
        lambda s: ("DELETE", f"/boards/{s['board']['id']}/star", None),
        204,
        204,
    ),
    "read lists": (
        lambda s: ("GET", f"/boards/{s['board']['id']}/lists", None),
        200,
        200,
    ),
    "create list": (
        lambda s: ("POST", f"/boards/{s['board']['id']}/lists", {"name": "New"}),
        403,
        201,
    ),
    "read list": (lambda s: ("GET", f"/lists/{s['lists']['A']['id']}", None), 200, 200),
    "move list": (
        lambda s: ("PATCH", f"/lists/{s['lists']['A']['id']}", {"position": 1}),
        403,
        200,
    ),
    "sort list": (
        lambda s: ("POST", f"/lists/{s['lists']['A']['id']}/sort", {"by": "title"}),
        403,
        200,
    ),
    "delete list": (
        lambda s: ("DELETE", f"/lists/{s['lists']['B']['id']}", None),
        403,
        204,
    ),
    "read cards": (
        lambda s: ("GET", f"/lists/{s['lists']['A']['id']}/cards", None),
        200,
        200,
    ),
    "create card": (
        lambda s: ("POST", f"/lists/{s['lists']['A']['id']}/cards", {"title": "New"}),
        403,
        201,
    ),
    "read card": (lambda s: ("GET", f"/cards/{s['card']['id']}", None), 200, 200),
    "rename card": (
        lambda s: ("PATCH", f"/cards/{s['card']['id']}", {"title": "New"}),
        403,
        200,
    ),
    "move card": (
        lambda s: (
            "PATCH",
            f"/cards/{s['card']['id']}",
            {"list_id": s["lists"]["B"]["id"]},
        ),
        403,
        200,
    ),
    "delete card": (lambda s: ("DELETE", f"/cards/{s['card']['id']}", None), 403, 204),
    "set card details": (
        lambda s: (
            "PATCH",
            f"/cards/{s['card']['id']}",
            {"due_at": "2026-11-20T10:00:00Z", "label_ids": [s["label"]["id"]]},
        ),
        403,
        200,
    ),
    "search cards": (
        lambda s: ("GET", f"/boards/{s['board']['id']}/cards", None),
        200,
        200,
    ),
    "archive list": (
        lambda s: ("POST", f"/lists/{s['lists']['B']['id']}/archive", None),
        403,
        200,
    ),
    "restore list": (
        lambda s: ("POST", f"/lists/{s['archived_list']['id']}/restore", None),
        403,
        200,
    ),
    "archive card": (
        lambda s: ("POST", f"/cards/{s['card']['id']}/archive", None),
        403,
        200,
    ),
    "restore card": (
        lambda s: ("POST", f"/cards/{s['archived_card']['id']}/restore", None),
        403,
        200,
    ),
    "read archived lists": (
        lambda s: ("GET", f"/boards/{s['board']['id']}/lists?archived=true", None),
        200,
        200,
    ),
    "read labels": (
        lambda s: ("GET", f"/boards/{s['board']['id']}/labels", None),
        200,
        200,
    ),
    "read label": (lambda s: ("GET", f"/labels/{s['label']['id']}", None), 200, 200),
    "create label": (
        lambda s: (
            "POST",
            f"/boards/{s['board']['id']}/labels",
            {"name": "New", "color": "blue"},
        ),
        403,
        201,
    ),
    "change label": (
        lambda s: ("PATCH", f"/labels/{s['label']['id']}", {"color": "blue"}),
        403,
        200,
    ),
    "delete label": (
        lambda s: ("DELETE", f"/labels/{s['label']['id']}", None),
        403,
        204,
    ),
    "read comments": (
        lambda s: ("GET", f"/cards/{s['card']['id']}/comments", None),
        200,
        200,
    ),
    "read one comment": (
        lambda s: ("GET", f"/comments/{s['comment']['id']}", None),
        200,
        200,
    ),
    "comment": (
        lambda s: ("POST", f"/cards/{s['card']['id']}/comments", {"body": "Me too"}),
        403,
        201,
    ),
    # The comment is Alice's: only she edits it, and she or the owner deletes it.
    "edit someone's comment": (
        lambda s: ("PATCH", f"/comments/{s['comment']['id']}", {"body": "Mine"}),
        403,
        403,
    ),
    "delete someone's comment": (
        lambda s: ("DELETE", f"/comments/{s['comment']['id']}", None),
        403,
        403,
    ),
    "read activity": (
        lambda s: ("GET", f"/boards/{s['board']['id']}/activity", None),
        200,
        200,
    ),
    "read checklists": (
        lambda s: ("GET", f"/cards/{s['card']['id']}/checklists", None),
        200,
        200,
    ),
    "read checklist": (
        lambda s: ("GET", f"/checklists/{s['checklist']['id']}", None),
        200,
        200,
    ),
    "create checklist": (
        lambda s: ("POST", f"/cards/{s['card']['id']}/checklists", {}),
        403,
        201,
    ),
    "change checklist": (
        lambda s: ("PATCH", f"/checklists/{s['checklist']['id']}", {"title": "X"}),
        403,
        200,
    ),
    "delete checklist": (
        lambda s: ("DELETE", f"/checklists/{s['checklist']['id']}", None),
        403,
        204,
    ),
    "add checklist item": (
        lambda s: (
            "POST",
            f"/checklists/{s['checklist']['id']}/items",
            {"text": "More"},
        ),
        403,
        201,
    ),
    "tick checklist item": (
        lambda s: ("PATCH", f"/checklist-items/{s['item']['id']}", {"done": True}),
        403,
        200,
    ),
    "delete checklist item": (
        lambda s: ("DELETE", f"/checklist-items/{s['item']['id']}", None),
        403,
        204,
    ),
    "read snapshot": (
        lambda s: ("GET", f"/boards/{s['board']['id']}/snapshot", None),
        200,
        200,
    ),
}


@pytest.mark.parametrize("role", ["viewer", "editor"])
@pytest.mark.parametrize("action", ACTIONS)
def test_role_permissions(
    client: TestClient,
    other_headers: dict,
    shared_board: dict,
    role: str,
    action: str,
) -> None:
    request, viewer_status, editor_status = ACTIONS[action]
    expected = viewer_status if role == "viewer" else editor_status
    share(client, shared_board["board"]["id"], BOB, role)
    before = snapshot(client, shared_board)
    method, path, json = request(shared_board)

    response = client.request(method, path, json=json, headers=other_headers)

    assert response.status_code == expected
    if expected == 403:
        assert response.json()["detail"].startswith("Requires the ")
        assert snapshot(client, shared_board) == before
