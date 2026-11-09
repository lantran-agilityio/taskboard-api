import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.comment import Comment

BOB = "bob@example.com"


@pytest.fixture
def card(client: TestClient) -> dict:
    """A card on a new board of Alice's."""
    board = client.post("/boards", json={"name": "Project X"}).json()
    board_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "To do"}
    ).json()
    card = client.post(f"/lists/{board_list['id']}/cards", json={"title": "C"}).json()
    return {**card, "board_id": board["id"]}


def comment_on(
    client: TestClient, card_id: int, body: str = "Hello", headers: dict | None = None
) -> dict:
    response = client.post(
        f"/cards/{card_id}/comments", json={"body": body}, headers=headers
    )
    assert response.status_code == 201
    return response.json()


def share(client: TestClient, board_id: int, role: str) -> None:
    response = client.post(
        f"/boards/{board_id}/members", json={"email": BOB, "role": role}
    )
    assert response.status_code == 201


def user_id(client: TestClient, headers: dict | None = None) -> int:
    return client.get("/users/me", headers=headers).json()["id"]


# Create and list


def test_create_comment(client: TestClient, card: dict) -> None:
    response = client.post(
        f"/cards/{card['id']}/comments", json={"body": "  Looks good  "}
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "card_id": card["id"],
        "author_id": user_id(client),
        "body": "Looks good",
        "created_at": body["created_at"],
        "edited_at": None,
    }
    assert body["created_at"].endswith("Z")


@pytest.mark.parametrize("body", ["", "   ", "x" * 5001])
def test_create_comment_invalid_body_returns_422(
    client: TestClient, card: dict, body: str
) -> None:
    response = client.post(f"/cards/{card['id']}/comments", json={"body": body})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "body"]


def test_create_comment_on_missing_card_returns_404(client: TestClient) -> None:
    response = client.post("/cards/999/comments", json={"body": "Hi"})

    assert response.status_code == 404


def test_comments_are_newest_first(client: TestClient, card: dict) -> None:
    first = comment_on(client, card["id"], "First")
    second = comment_on(client, card["id"], "Second")

    response = client.get(f"/cards/{card['id']}/comments")

    assert response.status_code == 200
    assert response.json() == {"items": [second, first], "next_before": None}


def test_comments_are_paginated(client: TestClient, card: dict) -> None:
    comments = [comment_on(client, card["id"], f"#{n}") for n in range(5)]

    first_page = client.get(f"/cards/{card['id']}/comments", params={"limit": 2})
    cursor = first_page.json()["next_before"]
    second_page = client.get(
        f"/cards/{card['id']}/comments", params={"limit": 2, "before": cursor}
    )
    cursor = second_page.json()["next_before"]
    last_page = client.get(
        f"/cards/{card['id']}/comments", params={"limit": 2, "before": cursor}
    )

    assert first_page.json()["items"] == [comments[4], comments[3]]
    assert second_page.json()["items"] == [comments[2], comments[1]]
    assert last_page.json() == {"items": [comments[0]], "next_before": None}


@pytest.mark.parametrize(
    "params", [{"limit": 0}, {"limit": 101}, {"before": 0}, {"limit": "x"}]
)
def test_bad_page_params_return_422(
    client: TestClient, card: dict, params: dict
) -> None:
    response = client.get(f"/cards/{card['id']}/comments", params=params)

    assert response.status_code == 422


def test_comments_belong_to_their_card(client: TestClient, card: dict) -> None:
    other = client.post(f"/lists/{card['list_id']}/cards", json={"title": "D"}).json()
    comment_on(client, other["id"])

    response = client.get(f"/cards/{card['id']}/comments")

    assert response.json()["items"] == []


@pytest.mark.parametrize("archive", ["card", "list"])
def test_comment_on_archived_card_returns_422(
    client: TestClient, card: dict, archive: str
) -> None:
    comment = comment_on(client, card["id"])
    path = f"/cards/{card['id']}" if archive == "card" else f"/lists/{card['list_id']}"
    client.post(f"{path}/archive")

    created = client.post(f"/cards/{card['id']}/comments", json={"body": "Hi"})
    edited = client.patch(f"/comments/{comment['id']}", json={"body": "Hi"})
    listed = client.get(f"/cards/{card['id']}/comments")

    for response in (created, edited):
        assert response.status_code == 422
        [error] = response.json()["detail"]
        assert error["loc"] == ["path", "card_id"]
    assert listed.json()["items"] == [comment]  # still readable


# Edit


def test_edit_comment(client: TestClient, card: dict) -> None:
    comment = comment_on(client, card["id"])

    response = client.patch(f"/comments/{comment['id']}", json={"body": "Edited"})

    assert response.status_code == 200
    body = response.json()
    assert body["body"] == "Edited"
    assert body["created_at"] == comment["created_at"]
    assert body["edited_at"] is not None
    assert client.get(f"/cards/{card['id']}/comments").json()["items"] == [body]


@pytest.mark.parametrize("payload", [{}, {"body": None}, {"body": " "}])
def test_edit_comment_invalid_body_returns_422(
    client: TestClient, card: dict, payload: dict
) -> None:
    comment = comment_on(client, card["id"])

    response = client.patch(f"/comments/{comment['id']}", json=payload)

    assert response.status_code == 422


def test_edit_someone_elses_comment_returns_403(
    client: TestClient, other_headers: dict, card: dict
) -> None:
    share(client, card["board_id"], "editor")
    comment = comment_on(client, card["id"])

    response = client.patch(
        f"/comments/{comment['id']}", json={"body": "Mine now"}, headers=other_headers
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Requires the comment's author"
    [unchanged] = client.get(f"/cards/{card['id']}/comments").json()["items"]
    assert unchanged == comment


def test_edit_missing_comment_returns_404(client: TestClient) -> None:
    response = client.patch("/comments/999", json={"body": "Hi"})

    assert response.status_code == 404


# Delete


def test_delete_own_comment(client: TestClient, card: dict) -> None:
    comment = comment_on(client, card["id"])

    response = client.delete(f"/comments/{comment['id']}")

    assert response.status_code == 204
    assert client.get(f"/cards/{card['id']}/comments").json()["items"] == []
    assert client.delete(f"/comments/{comment['id']}").status_code == 404


def test_owner_deletes_an_editors_comment(
    client: TestClient, other_headers: dict, card: dict
) -> None:
    share(client, card["board_id"], "editor")
    comment = comment_on(client, card["id"], headers=other_headers)

    response = client.delete(f"/comments/{comment['id']}")

    assert response.status_code == 204


def test_editor_deletes_someone_elses_comment_returns_403(
    client: TestClient, other_headers: dict, card: dict
) -> None:
    share(client, card["board_id"], "editor")
    comment = comment_on(client, card["id"])

    response = client.delete(f"/comments/{comment['id']}", headers=other_headers)

    assert response.status_code == 403
    assert len(client.get(f"/cards/{card['id']}/comments").json()["items"]) == 1


def test_delete_comment_on_archived_card(client: TestClient, card: dict) -> None:
    comment = comment_on(client, card["id"])
    client.post(f"/cards/{card['id']}/archive")

    response = client.delete(f"/comments/{comment['id']}")

    assert response.status_code == 204


@pytest.mark.parametrize("delete", ["card", "list", "board"])
def test_deleting_the_card_deletes_its_comments(
    client: TestClient, db: Session, card: dict, delete: str
) -> None:
    comment_on(client, card["id"])
    path = {
        "card": f"/cards/{card['id']}",
        "list": f"/lists/{card['list_id']}",
        "board": f"/boards/{card['board_id']}",
    }[delete]

    assert client.delete(path).status_code == 204

    assert db.scalar(select(func.count()).select_from(Comment)) == 0


def test_leaving_the_board_keeps_comments(
    client: TestClient, other_headers: dict, card: dict
) -> None:
    share(client, card["board_id"], "editor")
    comment = comment_on(client, card["id"], headers=other_headers)
    bob_id = user_id(client, other_headers)

    client.delete(f"/boards/{card['board_id']}/members/{bob_id}")

    assert client.get(f"/cards/{card['id']}/comments").json()["items"] == [comment]


# Other users


@pytest.mark.parametrize(
    ("method", "path", "json"),
    [
        ("GET", "/cards/{card}/comments", None),
        ("POST", "/cards/{card}/comments", {"body": "Hi"}),
        ("PATCH", "/comments/{comment}", {"body": "Hi"}),
        ("DELETE", "/comments/{comment}", None),
    ],
)
def test_non_member_gets_404(
    client: TestClient,
    other_headers: dict,
    card: dict,
    method: str,
    path: str,
    json: dict | None,
) -> None:
    comment = comment_on(client, card["id"])
    url = path.format(card=card["id"], comment=comment["id"])

    response = client.request(method, url, json=json, headers=other_headers)

    assert response.status_code == 404
    assert client.get(f"/cards/{card['id']}/comments").json()["items"] == [comment]


def test_viewer_reads_but_cannot_comment(
    client: TestClient, other_headers: dict, card: dict
) -> None:
    share(client, card["board_id"], "viewer")
    comment = comment_on(client, card["id"])

    listed = client.get(f"/cards/{card['id']}/comments", headers=other_headers)
    created = client.post(
        f"/cards/{card['id']}/comments", json={"body": "Hi"}, headers=other_headers
    )

    assert listed.json()["items"] == [comment]
    assert created.status_code == 403


def test_comments_need_a_token(anon_client: TestClient) -> None:
    assert anon_client.get("/cards/1/comments").status_code == 401
