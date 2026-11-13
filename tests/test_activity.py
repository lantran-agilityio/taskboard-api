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


def test_new_board_logs_its_creation(client: TestClient, board: dict) -> None:
    entries = activity(client, board["id"])

    assert [entry["type"] for entry in entries] == ["board.created"]
    assert entries[0]["actor_id"] == user_id(client)
    assert entries[0]["data"]["board"]["name"] == "Project X"
    # Per-caller fields stay out, as in every board event.
    assert "starred" not in entries[0]["data"]["board"]


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
        "board.created",
    ]


def test_entry_has_the_events_data_and_actor(client: TestClient, board: dict) -> None:
    board_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "To do"}
    ).json()
    client.delete(f"/lists/{board_list['id']}")

    [deleted, created, _board_created] = activity(client, board["id"])

    assert deleted == {
        "id": deleted["id"],
        "type": "list.deleted",
        "actor_id": user_id(client),
        "data": {"list_id": board_list["id"], "name": "To do", "list_ids": []},
        "created_at": deleted["created_at"],
    }
    assert deleted["created_at"].endswith("Z")
    assert created["data"]["list"] == board_list


def test_member_changes_are_logged_with_their_actor(
    client: TestClient, other_headers: dict, board: dict
) -> None:
    client.post(f"/boards/{board['id']}/members", json={"email": BOB, "role": "viewer"})
    bob_id = user_id(client, other_headers)
    # Bob leaves on his own.
    client.delete(f"/boards/{board['id']}/members/{bob_id}", headers=other_headers)

    [removed, added, _board_created] = activity(client, board["id"])

    assert (removed["type"], removed["actor_id"]) == ("member.removed", bob_id)
    assert (added["type"], added["actor_id"]) == ("member.added", user_id(client))


def test_rejected_request_logs_nothing(client: TestClient, board: dict) -> None:
    board_list = client.post(
        f"/boards/{board['id']}/lists", json={"name": "To do"}
    ).json()

    response = client.patch(f"/lists/{board_list['id']}", json={"position": 5})

    assert response.status_code == 422
    assert types(client, board["id"]) == ["list.created", "board.created"]


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
    assert names({"items": rest["items"][:2]}) == ["B", "A"]
    # The board's own creation is the oldest entry.
    assert rest["items"][2]["type"] == "board.created"
    assert rest["next_before"] is None


def test_activity_is_per_board(client: TestClient, board: dict) -> None:
    other = client.post("/boards", json={"name": "Other"}).json()
    client.post(f"/boards/{other['id']}/lists", json={"name": "Elsewhere"})

    assert types(client, board["id"]) == ["board.created"]


def test_viewer_reads_activity(
    client: TestClient, other_headers: dict, board: dict
) -> None:
    client.post(f"/boards/{board['id']}/members", json={"email": BOB, "role": "viewer"})

    entries = activity(client, board["id"], headers=other_headers)

    assert [entry["type"] for entry in entries] == ["member.added", "board.created"]


def test_non_member_gets_404(
    client: TestClient, other_headers: dict, board: dict
) -> None:
    response = client.get(f"/boards/{board['id']}/activity", headers=other_headers)

    assert response.status_code == 404


def test_missing_board_returns_404(client: TestClient) -> None:
    assert client.get("/boards/999/activity").status_code == 404


# Filters


@pytest.fixture
def two_cards(client: TestClient, board: dict) -> dict:
    """Cards C and D on lists A and B, with a comment each and some changes."""
    a = client.post(f"/boards/{board['id']}/lists", json={"name": "A"}).json()
    b = client.post(f"/boards/{board['id']}/lists", json={"name": "B"}).json()
    c = client.post(f"/lists/{a['id']}/cards", json={"title": "C"}).json()
    d = client.post(f"/lists/{a['id']}/cards", json={"title": "D"}).json()
    client.patch(f"/cards/{c['id']}", json={"list_id": b["id"]})
    comment = client.post(f"/cards/{c['id']}/comments", json={"body": "Hi"}).json()
    client.patch(f"/comments/{comment['id']}", json={"body": "Hello"})
    client.post(f"/cards/{d['id']}/comments", json={"body": "On D"})
    client.post(f"/cards/{c['id']}/archive")
    client.patch(f"/lists/{a['id']}", json={"name": "A2"})
    return {"board_id": board["id"], "c": c, "d": d, "comment": comment}


def filtered(client: TestClient, board_id: int, **params: object) -> list[dict]:
    response = client.get(f"/boards/{board_id}/activity", params=params)
    assert response.status_code == 200
    return response.json()["items"]


def test_kind_comments_keeps_only_comments(client: TestClient, two_cards: dict) -> None:
    client.delete(f"/comments/{two_cards['comment']['id']}")

    entries = filtered(client, two_cards["board_id"], kind="comments")

    assert [e["type"] for e in entries] == [
        "comment.deleted",
        "comment.created",
        "comment.updated",
        "comment.created",
    ]


def test_kind_all_is_the_default(client: TestClient, two_cards: dict) -> None:
    board_id = two_cards["board_id"]

    assert filtered(client, board_id, kind="all") == filtered(client, board_id)


def test_card_id_keeps_that_cards_entries(client: TestClient, two_cards: dict) -> None:
    entries = filtered(client, two_cards["board_id"], card_id=two_cards["c"]["id"])

    assert [e["type"] for e in entries] == [
        "card.archived",
        "comment.updated",
        "comment.created",
        "card.updated",
        "card.created",
    ]


def test_card_id_keeps_a_deleted_cards_history(
    client: TestClient, two_cards: dict
) -> None:
    card_id = two_cards["c"]["id"]
    client.delete(f"/comments/{two_cards['comment']['id']}")
    client.delete(f"/cards/{card_id}")

    entries = filtered(client, two_cards["board_id"], card_id=card_id)

    assert [e["type"] for e in entries] == [
        "card.deleted",
        "comment.deleted",
        "card.archived",
        "comment.updated",
        "comment.created",
        "card.updated",
        "card.created",
    ]


def test_filters_combine(client: TestClient, two_cards: dict) -> None:
    entries = filtered(
        client, two_cards["board_id"], kind="comments", card_id=two_cards["d"]["id"]
    )

    assert [(e["type"], e["data"]["comment"]["body"]) for e in entries] == [
        ("comment.created", "On D")
    ]


def test_card_from_another_board_finds_nothing(
    client: TestClient, two_cards: dict
) -> None:
    other = client.post("/boards", json={"name": "Other"}).json()

    assert filtered(client, other["id"], card_id=two_cards["c"]["id"]) == []


def test_filtered_pages(client: TestClient, two_cards: dict) -> None:
    board_id, card_id = two_cards["board_id"], two_cards["c"]["id"]

    first = client.get(
        f"/boards/{board_id}/activity", params={"card_id": card_id, "limit": 3}
    ).json()
    second = client.get(
        f"/boards/{board_id}/activity",
        params={"card_id": card_id, "limit": 3, "before": first["next_before"]},
    ).json()

    assert [e["type"] for e in first["items"]] == [
        "card.archived",
        "comment.updated",
        "comment.created",
    ]
    assert [e["type"] for e in second["items"]] == ["card.updated", "card.created"]
    assert second["next_before"] is None


@pytest.mark.parametrize(
    "params", [{"kind": "bogus"}, {"card_id": 0}, {"card_id": "x"}]
)
def test_invalid_filters_return_422(
    client: TestClient, board: dict, params: dict
) -> None:
    response = client.get(f"/boards/{board['id']}/activity", params=params)

    assert response.status_code == 422


def test_card_id_includes_checklist_entries(
    client: TestClient, two_cards: dict
) -> None:
    board_id, card_id = two_cards["board_id"], two_cards["d"]["id"]
    checklist = client.post(f"/cards/{card_id}/checklists", json={}).json()
    item = client.post(
        f"/checklists/{checklist['id']}/items", json={"text": "Step"}
    ).json()
    client.patch(f"/checklist-items/{item['id']}", json={"done": True})
    client.delete(f"/checklists/{checklist['id']}")

    entries = filtered(client, board_id, card_id=card_id, limit=4)

    assert [e["type"] for e in entries] == [
        "checklist.deleted",
        "checklist_item.updated",
        "checklist_item.created",
        "checklist.created",
    ]
    assert (
        filtered(client, board_id, card_id=two_cards["c"]["id"], limit=1)[0]["type"]
        == "card.archived"
    )


def test_updates_carry_the_old_values_of_what_changed(
    client: TestClient, board: dict
) -> None:
    # Update events only carry the new state; `previous` lets the log say what
    # it changed from even when the earlier entry isn't on the page it reads.
    todo = client.post(f"/boards/{board['id']}/lists", json={"name": "To do"}).json()
    done = client.post(f"/boards/{board['id']}/lists", json={"name": "Done"}).json()
    card = client.post(f"/lists/{todo['id']}/cards", json={"title": "Brief"}).json()
    label = client.get(f"/boards/{board['id']}/labels").json()[0]

    client.patch(f"/boards/{board['id']}", json={"name": "Renamed"})
    client.patch(f"/lists/{todo['id']}", json={"name": "Backlog"})
    client.patch(f"/cards/{card['id']}", json={"list_id": done["id"], "title": "Plan"})
    client.patch(f"/labels/{label['id']}", json={"name": "Bug"})

    label_entry, card_entry, list_entry, board_entry = activity(client, board["id"])[:4]
    assert board_entry["data"]["previous"] == {"name": "Project X"}
    assert list_entry["data"]["previous"] == {"name": "To do"}
    assert card_entry["data"]["previous"] == {"list_id": todo["id"], "title": "Brief"}
    assert label_entry["data"]["previous"] == {"name": ""}


def test_an_update_that_changes_nothing_has_no_old_values(
    client: TestClient, board: dict
) -> None:
    todo = client.post(f"/boards/{board['id']}/lists", json={"name": "To do"}).json()

    client.patch(f"/lists/{todo['id']}", json={"name": "To do"})

    assert activity(client, board["id"])[0]["data"]["previous"] == {}
