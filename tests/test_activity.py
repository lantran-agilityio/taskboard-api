import pytest
from fastapi.testclient import TestClient

BOB = "bob@example.com"


@pytest.fixture
def board(client: TestClient) -> dict:
    response = client.post("/boards", json={"name": "Project X"})
    assert response.status_code == 201
    return response.json()


def activity(client: TestClient, board_id: int, headers: dict | None = None) -> list:
    response = client.get(f"/boards/{board_id}/activity", headers=headers)
    assert response.status_code == 200
    return response.json()["items"]


def types(client: TestClient, board_id: int) -> list[str]:
    return [entry["type"] for entry in activity(client, board_id)]


def user_id(client: TestClient, headers: dict | None = None) -> int:
    return client.get("/users/me", headers=headers).json()["id"]


def test_new_board_has_no_activity(client: TestClient, board: dict) -> None:
    response = client.get(f"/boards/{board['id']}/activity")

    assert response.status_code == 200
    assert response.json() == {"items": [], "next_before": None}


def test_changes_are_logged_newest_first(client: TestClient, board: dict) -> None:
    board_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "To do"}
    ).json()
    other = client.post(f"/boards/{board['id']}/lists", json={"name": "Done"}).json()
    card = client.post(f"/lists/{board_list['id']}/cards", json={"title": "C"}).json()
    client.patch(f"/cards/{card['id']}", json={"list_id": other["id"]})
    client.post(f"/cards/{card['id']}/comments", json={"body": "Moved"})
    client.post(f"/cards/{card['id']}/archive")
    client.delete(f"/lists/{board_list['id']}")
    client.patch(f"/boards/{board['id']}", json={"name": "Renamed"})

    assert types(client, board["id"]) == [
        "board.updated",
        "list.deleted",
        "card.archived",
        "comment.created",
        "card.updated",
        "card.created",
        "list.created",
        "list.created",
    ]


def test_entry_has_the_events_data_and_actor(client: TestClient, board: dict) -> None:
    board_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "To do"}
    ).json()
    client.delete(f"/lists/{board_list['id']}")

    [deleted, created] = activity(client, board["id"])

    assert deleted == {
        "id": deleted["id"],
        "type": "list.deleted",
        "actor_id": user_id(client),
        "data": {"list_id": board_list["id"], "name": "To do", "list_ids": []},
        "created_at": deleted["created_at"],
    }
    assert deleted["created_at"].endswith("Z")
    assert created["data"]["list"]["id"] == board_list["id"]
    assert created["data"]["list"]["name"] == "To do"


def test_member_changes_are_logged_with_their_actor(
    client: TestClient, other_headers: dict, board: dict
) -> None:
    client.post(f"/boards/{board['id']}/members", json={"email": BOB, "role": "viewer"})
    bob_id = user_id(client, other_headers)
    # Bob leaves on his own.
    client.delete(f"/boards/{board['id']}/members/{bob_id}", headers=other_headers)

    [removed, added] = activity(client, board["id"])

    assert (removed["type"], removed["actor_id"]) == ("member.removed", bob_id)
    assert (added["type"], added["actor_id"]) == ("member.added", user_id(client))


def test_rejected_request_logs_nothing(client: TestClient, board: dict) -> None:
    board_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "To do"}
    ).json()

    response = client.patch(f"/lists/{board_list['id']}", json={"position": 5})

    assert response.status_code == 422
    assert types(client, board["id"]) == ["list.created"]


def test_activity_is_paginated(client: TestClient, board: dict) -> None:
    for name in "ABCDE":
        client.post(f"/boards/{board['id']}/lists", json={"name": name})
    path = f"/boards/{board['id']}/activity"

    first = client.get(path, params={"limit": 3}).json()
    rest = client.get(path, params={"limit": 3, "before": first["next_before"]}).json()

    def names(page: dict) -> list[str]:
        return [entry["data"]["list"]["name"] for entry in page["items"]]

    assert names(first) == ["E", "D", "C"]
    assert first["next_before"] == first["items"][-1]["id"]
    assert names(rest) == ["B", "A"]
    assert rest["next_before"] is None


def test_activity_is_per_board(client: TestClient, board: dict) -> None:
    other = client.post("/boards", json={"name": "Other"}).json()
    client.post(f"/boards/{other['id']}/lists", json={"name": "Elsewhere"})

    assert activity(client, board["id"]) == []


def test_viewer_reads_activity(
    client: TestClient, other_headers: dict, board: dict
) -> None:
    client.post(f"/boards/{board['id']}/members", json={"email": BOB, "role": "viewer"})

    entries = activity(client, board["id"], headers=other_headers)

    assert [entry["type"] for entry in entries] == ["member.added"]


def test_non_member_gets_404(
    client: TestClient, other_headers: dict, board: dict
) -> None:
    response = client.get(f"/boards/{board['id']}/activity", headers=other_headers)

    assert response.status_code == 404


def test_missing_board_returns_404(client: TestClient) -> None:
    assert client.get("/boards/999/activity").status_code == 404
