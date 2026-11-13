import pytest
from fastapi.testclient import TestClient

BOB = "bob@example.com"


@pytest.fixture
def card(client: TestClient) -> dict:
    """Card C in list A on a new board of Alice's."""
    board = client.post("/boards", json={"name": "Project X"}).json()
    board_list = client.post(f"/boards/{board['id']}/lists", json={"name": "A"}).json()
    card = client.post(f"/lists/{board_list['id']}/cards", json={"title": "C"}).json()
    return {**card, "board_id": board["id"]}


def add_checklist(client: TestClient, card_id: int, **payload: object) -> dict:
    response = client.post(f"/cards/{card_id}/checklists", json=payload)
    assert response.status_code == 201
    return response.json()


def add_item(client: TestClient, checklist_id: int, text: str = "Step") -> dict:
    response = client.post(f"/checklists/{checklist_id}/items", json={"text": text})
    assert response.status_code == 201
    return response.json()


def titles(client: TestClient, card_id: int) -> list[str]:
    checklists = client.get(f"/cards/{card_id}/checklists").json()
    return [checklist["title"] for checklist in checklists]


def item_texts(client: TestClient, checklist_id: int) -> list[str]:
    checklist = client.get(f"/checklists/{checklist_id}").json()
    return [item["text"] for item in checklist["items"]]


def positions(items: list[dict]) -> list[int]:
    return [item["position"] for item in items]


# Checklists


def test_create_checklist_has_default_title(client: TestClient, card: dict) -> None:
    response = client.post(f"/cards/{card['id']}/checklists", json={})

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "card_id": card["id"],
        "title": "Checklist",
        "position": 0,
        "created_at": body["created_at"],
        "items": [],
    }


def test_several_checklists_go_to_the_end(client: TestClient, card: dict) -> None:
    add_checklist(client, card["id"], title="  Before launch  ")
    second = add_checklist(client, card["id"], title="After")

    assert second["position"] == 1
    assert titles(client, card["id"]) == ["Before launch", "After"]


@pytest.mark.parametrize("payload", [{"title": ""}, {"title": "x" * 101}])
def test_create_checklist_invalid_title(
    client: TestClient, card: dict, payload: dict
) -> None:
    response = client.post(f"/cards/{card['id']}/checklists", json=payload)

    assert response.status_code == 422


def test_get_checklist_has_its_items_in_order(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    first = add_item(client, checklist["id"], "One")
    second = add_item(client, checklist["id"], "Two")

    response = client.get(f"/checklists/{checklist['id']}")

    assert response.status_code == 200
    assert response.json()["items"] == [first, second]
    assert first == {
        "id": first["id"],
        "checklist_id": checklist["id"],
        "text": "One",
        "done": False,
        "position": 0,
        "created_at": first["created_at"],
        "assignee_id": None,
        "due_at": None,
    }
    assert client.get(f"/cards/{card['id']}/checklists").json() == [response.json()]


def test_rename_checklist(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])

    response = client.patch(f"/checklists/{checklist['id']}", json={"title": "Todo"})

    assert response.status_code == 200
    assert response.json() == {**checklist, "title": "Todo"}


def test_move_checklist(client: TestClient, card: dict) -> None:
    for title in "ABC":
        add_checklist(client, card["id"], title=title)
    last = client.get(f"/cards/{card['id']}/checklists").json()[2]

    response = client.patch(f"/checklists/{last['id']}", json={"position": 0})

    assert response.status_code == 200
    assert titles(client, card["id"]) == ["C", "A", "B"]
    assert positions(client.get(f"/cards/{card['id']}/checklists").json()) == [0, 1, 2]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"position": 2, "title": "X"},  # the rename mustn't happen either
        {"position": -1},
        {"title": ""},
        {"title": None},
    ],
)
def test_update_checklist_invalid(
    client: TestClient, card: dict, payload: dict
) -> None:
    checklist = add_checklist(client, card["id"], title="A")
    add_checklist(client, card["id"], title="B")

    response = client.patch(f"/checklists/{checklist['id']}", json=payload)

    assert response.status_code == 422
    assert titles(client, card["id"]) == ["A", "B"]


def test_delete_checklist_renumbers_and_removes_items(
    client: TestClient, card: dict
) -> None:
    first = add_checklist(client, card["id"], title="A")
    add_checklist(client, card["id"], title="B")
    item = add_item(client, first["id"])

    response = client.delete(f"/checklists/{first['id']}")

    assert response.status_code == 204
    remaining = client.get(f"/cards/{card['id']}/checklists").json()
    assert [(c["title"], c["position"]) for c in remaining] == [("B", 0)]
    assert client.get(f"/checklists/{first['id']}").status_code == 404
    assert (
        client.patch(f"/checklist-items/{item['id']}", json={"done": True}).status_code
        == 404
    )


def test_deleting_the_card_deletes_its_checklists(
    client: TestClient, card: dict
) -> None:
    checklist = add_checklist(client, card["id"])
    add_item(client, checklist["id"])

    assert client.delete(f"/cards/{card['id']}").status_code == 204

    assert client.get(f"/checklists/{checklist['id']}").status_code == 404


# Items


def test_items_go_to_the_end(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    add_item(client, checklist["id"], "One")
    second = add_item(client, checklist["id"], "  Two  ")

    assert second["position"] == 1
    assert item_texts(client, checklist["id"]) == ["One", "Two"]


@pytest.mark.parametrize("text", ["", "   ", "x" * 501])
def test_add_item_invalid_text(client: TestClient, card: dict, text: str) -> None:
    checklist = add_checklist(client, card["id"])

    response = client.post(f"/checklists/{checklist['id']}/items", json={"text": text})

    assert response.status_code == 422


def test_tick_and_untick_item(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])

    ticked = client.patch(f"/checklist-items/{item['id']}", json={"done": True})
    unticked = client.patch(f"/checklist-items/{item['id']}", json={"done": False})

    assert ticked.status_code == 200
    assert ticked.json() == {**item, "done": True}
    assert unticked.json() == item


def test_edit_item_text(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])

    response = client.patch(f"/checklist-items/{item['id']}", json={"text": "New"})

    assert response.json() == {**item, "text": "New"}


def test_move_item(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    first = add_item(client, checklist["id"], "One")
    add_item(client, checklist["id"], "Two")
    add_item(client, checklist["id"], "Three")

    response = client.patch(f"/checklist-items/{first['id']}", json={"position": 2})

    assert response.status_code == 200
    assert response.json()["position"] == 2
    assert item_texts(client, checklist["id"]) == ["Two", "Three", "One"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"position": 2, "done": True},
        {"position": -1},
        {"done": None},
        {"done": "yes"},
        {"text": None},
        {"text": ""},
    ],
)
def test_update_item_invalid(client: TestClient, card: dict, payload: dict) -> None:
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"], "One")
    add_item(client, checklist["id"], "Two")

    response = client.patch(f"/checklist-items/{item['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/checklists/{checklist['id']}").json()["items"][0] == item


def test_delete_item_renumbers(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    first = add_item(client, checklist["id"], "One")
    add_item(client, checklist["id"], "Two")

    response = client.delete(f"/checklist-items/{first['id']}")

    assert response.status_code == 204
    items = client.get(f"/checklists/{checklist['id']}").json()["items"]
    assert [(item["text"], item["position"]) for item in items] == [("Two", 0)]


# Item assignees and due dates (R-CHECK-05)

DUE = "2026-11-20T17:00:00+07:00"
DUE_UTC = "2026-11-20T10:00:00Z"
LATER_UTC = "2026-11-25T10:00:00Z"


def me(client: TestClient, headers: dict | None = None) -> int:
    return client.get("/users/me", headers=headers).json()["id"]


def share_with_bob(client: TestClient, board_id: int, other_headers: dict) -> int:
    response = client.post(
        f"/boards/{board_id}/members", json={"email": BOB, "role": "editor"}
    )
    assert response.status_code == 201
    return me(client, other_headers)


def test_new_item_has_no_assignee_or_due_date(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])

    item = add_item(client, checklist["id"])

    assert item["assignee_id"] is None
    assert item["due_at"] is None


def test_add_item_with_assignee_and_due_date(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])

    response = client.post(
        f"/checklists/{checklist['id']}/items",
        json={"text": "Step", "assignee_id": me(client), "due_at": DUE},
    )

    assert response.status_code == 201
    assert response.json()["assignee_id"] == me(client)
    assert response.json()["due_at"] == DUE_UTC


def test_set_change_and_clear_item_details(
    client: TestClient, card: dict, other_headers: dict
) -> None:
    bob = share_with_bob(client, card["board_id"], other_headers)
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])
    path = f"/checklist-items/{item['id']}"

    set_ = client.patch(path, json={"assignee_id": bob, "due_at": DUE}).json()
    kept = client.patch(path, json={"text": "Renamed"}).json()
    cleared = client.patch(path, json={"assignee_id": None, "due_at": None}).json()

    assert (set_["assignee_id"], set_["due_at"]) == (bob, DUE_UTC)
    assert (kept["assignee_id"], kept["due_at"]) == (bob, DUE_UTC)
    assert (cleared["assignee_id"], cleared["due_at"]) == (None, None)


def test_item_assignee_is_not_a_card_assignee(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    add_item(client, checklist["id"])

    client.post(
        f"/checklists/{checklist['id']}/items",
        json={"text": "Mine", "assignee_id": me(client)},
    )

    assert client.get(f"/cards/{card['id']}").json()["assignee_ids"] == []


def test_item_assignee_must_be_on_the_board(
    client: TestClient, card: dict, other_headers: dict
) -> None:
    bob = me(client, other_headers)  # registered, but not on this board
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])

    for assignee in (bob, 999999):
        added = client.post(
            f"/checklists/{checklist['id']}/items",
            json={"text": "X", "assignee_id": assignee},
        )
        changed = client.patch(
            f"/checklist-items/{item['id']}", json={"assignee_id": assignee}
        )

        for response in (added, changed):
            assert response.status_code == 422
            assert response.json()["detail"][0]["loc"] == ["body", "assignee_id"]
    assert item_texts(client, checklist["id"]) == ["Step"]
    assert client.get(f"/checklists/{checklist['id']}").json()["items"] == [item]


@pytest.mark.parametrize(
    "payload",
    [
        {"due_at": "2026-11-20T17:00:00"},
        {"due_at": "friday"},
        {"assignee_id": "bob"},
        {"assignee_id": 0},
    ],
)
def test_invalid_item_details(client: TestClient, card: dict, payload: dict) -> None:
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])

    response = client.patch(f"/checklist-items/{item['id']}", json=payload)

    assert response.status_code == 422
    assert client.get(f"/checklists/{checklist['id']}").json()["items"] == [item]


def test_leaving_the_board_unassigns_items(
    client: TestClient, card: dict, other_headers: dict
) -> None:
    bob = share_with_bob(client, card["board_id"], other_headers)
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])
    client.patch(f"/checklist-items/{item['id']}", json={"assignee_id": bob})

    response = client.delete(
        f"/boards/{card['board_id']}/members/{bob}", headers=other_headers
    )

    assert response.status_code == 204
    items = client.get(f"/checklists/{checklist['id']}").json()["items"]
    assert items[0]["assignee_id"] is None


def test_card_shows_its_nearest_open_item_due_date(
    client: TestClient, card: dict
) -> None:
    def next_due() -> str | None:
        return client.get(f"/cards/{card['id']}").json()["checklist_due_at"]

    assert next_due() is None
    checklist = add_checklist(client, card["id"])
    later = add_item(client, checklist["id"], "Later")
    sooner = add_item(client, checklist["id"], "Sooner")
    client.patch(f"/checklist-items/{later['id']}", json={"due_at": LATER_UTC})
    assert next_due() == LATER_UTC
    client.patch(f"/checklist-items/{sooner['id']}", json={"due_at": DUE})
    assert next_due() == DUE_UTC

    # Ticked items no longer count.
    client.patch(f"/checklist-items/{sooner['id']}", json={"done": True})
    assert next_due() == LATER_UTC


def test_item_details_are_in_the_event(client: TestClient, card: dict) -> None:
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])

    client.patch(
        f"/checklist-items/{item['id']}",
        json={"assignee_id": me(client), "due_at": DUE},
    )

    entry = client.get(f"/boards/{card['board_id']}/activity").json()["items"][0]
    assert entry["type"] == "checklist_item.updated"
    assert entry["data"]["item"]["assignee_id"] == me(client)
    assert entry["data"]["item"]["due_at"] == DUE_UTC


# Frozen cards, closed boards and access


@pytest.fixture
def full_card(client: TestClient, card: dict) -> dict:
    checklist = add_checklist(client, card["id"])
    item = add_item(client, checklist["id"])
    return {"card": card, "checklist": checklist, "item": item}


def writes(ids: dict) -> list[tuple[str, str, dict | None]]:
    checklist, item = ids["checklist"]["id"], ids["item"]["id"]
    return [
        ("POST", f"/cards/{ids['card']['id']}/checklists", {}),
        ("PATCH", f"/checklists/{checklist}", {"title": "X"}),
        ("DELETE", f"/checklists/{checklist}", None),
        ("POST", f"/checklists/{checklist}/items", {"text": "X"}),
        ("PATCH", f"/checklist-items/{item}", {"done": True}),
        ("DELETE", f"/checklist-items/{item}", None),
    ]


def reads(ids: dict) -> list[str]:
    return [
        f"/cards/{ids['card']['id']}/checklists",
        f"/checklists/{ids['checklist']['id']}",
    ]


@pytest.mark.parametrize("archive", ["card", "list"])
def test_frozen_card_checklists_are_read_only(
    client: TestClient, full_card: dict, archive: str
) -> None:
    card = full_card["card"]
    if archive == "card":
        client.post(f"/cards/{card['id']}/archive")
    else:
        client.post(f"/lists/{card['list_id']}/archive")
    before = client.get(f"/checklists/{full_card['checklist']['id']}").json()

    for method, path, json in writes(full_card):
        response = client.request(method, path, json=json)
        assert response.status_code == 422, (method, path)
        assert "archived" in response.json()["detail"][0]["msg"]
    for path in reads(full_card):
        assert client.get(path).status_code == 200
    assert client.get(f"/checklists/{full_card['checklist']['id']}").json() == before


def test_closed_board_checklists_are_read_only(
    client: TestClient, full_card: dict
) -> None:
    client.post(f"/boards/{full_card['card']['board_id']}/close")

    for method, path, json in writes(full_card):
        response = client.request(method, path, json=json)
        assert response.status_code == 422, (method, path)
        assert response.json()["detail"][0]["msg"] == "Board is closed"
    for path in reads(full_card):
        assert client.get(path).status_code == 200


def test_someone_elses_checklists_return_404(
    client: TestClient, full_card: dict, other_headers: dict
) -> None:
    for path in reads(full_card):
        assert client.get(path, headers=other_headers).status_code == 404
    for method, path, json in writes(full_card):
        response = client.request(method, path, json=json, headers=other_headers)
        assert response.status_code == 404, (method, path)


@pytest.mark.parametrize(
    ("method", "path", "json"),
    [
        ("GET", "/cards/999999/checklists", None),
        ("POST", "/cards/999999/checklists", {}),
        ("GET", "/checklists/999999", None),
        ("PATCH", "/checklists/999999", {"title": "X"}),
        ("DELETE", "/checklists/999999", None),
        ("POST", "/checklists/999999/items", {"text": "X"}),
        ("PATCH", "/checklist-items/999999", {"done": True}),
        ("DELETE", "/checklist-items/999999", None),
    ],
)
def test_missing_ids_return_404(
    client: TestClient, method: str, path: str, json: dict | None
) -> None:
    assert client.request(method, path, json=json).status_code == 404
