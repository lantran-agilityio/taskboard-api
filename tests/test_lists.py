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


def list_names(client: TestClient, board_id: int) -> list[str]:
    response = client.get(f"/boards/{board_id}/lists")
    assert response.status_code == 200
    return [board_list["name"] for board_list in response.json()]


def board_with_lists(client: TestClient, *names: str) -> tuple[int, dict]:
    board = create_board(client)
    lists = {name: create_list(client, board["id"], name) for name in names}
    return board["id"], lists


# Create


def test_create_list(client: TestClient) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/lists", json={"name": "To do"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "To do"
    assert body["board_id"] == board["id"]
    assert body["position"] == 0
    assert isinstance(body["id"], int)
    assert "created_at" in body


def test_new_lists_go_to_the_end(client: TestClient) -> None:
    _, lists = board_with_lists(client, "A", "B", "C")

    assert [board_list["position"] for board_list in lists.values()] == [0, 1, 2]


@pytest.mark.parametrize(
    "payload",
    [{}, {"name": ""}, {"name": "   "}, {"name": "x" * 101}, {"name": 123}],
)
def test_create_list_invalid_name(client: TestClient, payload: dict) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/lists", json=payload)

    assert response.status_code == 422


def test_create_list_on_missing_board_returns_404(client: TestClient) -> None:
    response = client.post("/boards/999/lists", json={"name": "To do"})

    assert response.status_code == 404
    assert response.json() == {"detail": "Board not found"}


# List


def test_list_lists_empty(client: TestClient) -> None:
    board = create_board(client)

    assert list_names(client, board["id"]) == []


def test_list_lists_only_returns_that_board(client: TestClient) -> None:
    first_id, _ = board_with_lists(client, "A", "B")
    second_id, _ = board_with_lists(client, "X")

    assert list_names(client, first_id) == ["A", "B"]
    assert list_names(client, second_id) == ["X"]


def test_list_lists_on_missing_board_returns_404(client: TestClient) -> None:
    response = client.get("/boards/999/lists")

    assert response.status_code == 404


# Get


def test_get_list(client: TestClient) -> None:
    board = create_board(client)
    board_list = create_list(client, board["id"])

    response = client.get(f"/lists/{board_list['id']}")

    assert response.status_code == 200
    assert response.json() == board_list


def test_get_missing_list_returns_404(client: TestClient) -> None:
    response = client.get("/lists/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "List not found"}


# Rename


def test_rename_list_keeps_position(client: TestClient) -> None:
    _, lists = board_with_lists(client, "A", "B")

    response = client.patch(f"/lists/{lists['B']['id']}", json={"name": "Done"})

    assert response.status_code == 200
    assert response.json()["name"] == "Done"
    assert response.json()["position"] == 1


def test_rename_list_invalid_name(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A")

    response = client.patch(f"/lists/{lists['A']['id']}", json={"name": ""})

    assert response.status_code == 422
    assert list_names(client, board_id) == ["A"]


def test_rename_missing_list_returns_404(client: TestClient) -> None:
    response = client.patch("/lists/999", json={"name": "Done"})

    assert response.status_code == 404


# Move


@pytest.mark.parametrize(
    ("name", "position", "expected"),
    [
        ("B", 3, ["A", "C", "D", "B"]),
        ("D", 0, ["D", "A", "B", "C"]),
        ("B", 1, ["A", "B", "C", "D"]),
    ],
)
def test_move_list(
    client: TestClient, name: str, position: int, expected: list[str]
) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C", "D")

    response = client.patch(f"/lists/{lists[name]['id']}", json={"position": position})

    assert response.status_code == 200
    assert response.json()["position"] == position
    assert list_names(client, board_id) == expected
    positions = [
        item["position"] for item in client.get(f"/boards/{board_id}/lists").json()
    ]
    assert positions == [0, 1, 2, 3]


def test_move_list_twice(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C", "D")

    client.patch(f"/lists/{lists['A']['id']}", json={"position": 3})
    client.patch(f"/lists/{lists['D']['id']}", json={"position": 0})

    assert list_names(client, board_id) == ["D", "B", "C", "A"]


def test_rename_and_move_list(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C")

    response = client.patch(
        f"/lists/{lists['C']['id']}", json={"name": "Done", "position": 0}
    )

    assert response.status_code == 200
    assert list_names(client, board_id) == ["Done", "A", "B"]


@pytest.mark.parametrize("position", [-1, 4])
def test_move_list_out_of_range(client: TestClient, position: int) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C", "D")

    response = client.patch(f"/lists/{lists['B']['id']}", json={"position": position})

    assert response.status_code == 422
    assert list_names(client, board_id) == ["A", "B", "C", "D"]


def test_invalid_move_does_not_rename(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B")

    response = client.patch(
        f"/lists/{lists['A']['id']}", json={"name": "Done", "position": 9}
    )

    assert response.status_code == 422
    assert list_names(client, board_id) == ["A", "B"]


@pytest.mark.parametrize("payload", [{}, {"name": None}, {"position": None}])
def test_update_list_needs_a_change(client: TestClient, payload: dict) -> None:
    _, lists = board_with_lists(client, "A")

    response = client.patch(f"/lists/{lists['A']['id']}", json=payload)

    assert response.status_code == 422


# Delete


def test_delete_list_renumbers_the_rest(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C")

    response = client.delete(f"/lists/{lists['B']['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/lists/{lists['B']['id']}").status_code == 404
    remaining = client.get(f"/boards/{board_id}/lists").json()
    assert [(item["name"], item["position"]) for item in remaining] == [
        ("A", 0),
        ("C", 1),
    ]


def test_create_after_delete_goes_to_the_end(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C")
    client.delete(f"/lists/{lists['A']['id']}")

    new_list = create_list(client, board_id, "D")

    assert new_list["position"] == 2
    assert list_names(client, board_id) == ["B", "C", "D"]


def test_delete_missing_list_returns_404(client: TestClient) -> None:
    response = client.delete("/lists/999")

    assert response.status_code == 404


def test_delete_board_deletes_its_lists(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B")

    assert client.delete(f"/boards/{board_id}").status_code == 204

    for board_list in lists.values():
        assert client.get(f"/lists/{board_list['id']}").status_code == 404


def test_move_out_of_range_error_matches_fastapi_shape(client: TestClient) -> None:
    _, lists = board_with_lists(client, "A", "B")

    response = client.patch(f"/lists/{lists['A']['id']}", json={"position": 2})

    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["loc"] == ["body", "position"]
    assert error["msg"] == "Position must be between 0 and 1"


@pytest.mark.parametrize("position", [True, 1.0, "1"])
def test_move_list_needs_a_real_integer(client: TestClient, position: object) -> None:
    board_id, lists = board_with_lists(client, "A", "B")

    response = client.patch(f"/lists/{lists['A']['id']}", json={"position": position})

    assert response.status_code == 422
    assert list_names(client, board_id) == ["A", "B"]


# Ownership


@pytest.mark.parametrize(
    ("method", "json"),
    [("POST", {"name": "Hacked"}), ("GET", None)],
)
def test_other_users_board_lists_return_404(
    client: TestClient, other_headers: dict, method: str, json: dict | None
) -> None:
    board_id, _ = board_with_lists(client, "A")

    response = client.request(
        method, f"/boards/{board_id}/lists", json=json, headers=other_headers
    )

    assert response.status_code == 404
    assert list_names(client, board_id) == ["A"]


@pytest.mark.parametrize(
    ("method", "json"),
    [("GET", None), ("PATCH", {"name": "Hacked", "position": 1}), ("DELETE", None)],
)
def test_other_users_list_returns_404(
    client: TestClient, other_headers: dict, method: str, json: dict | None
) -> None:
    board_id, lists = board_with_lists(client, "A", "B")

    response = client.request(
        method, f"/lists/{lists['A']['id']}", json=json, headers=other_headers
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "List not found"}
    assert list_names(client, board_id) == ["A", "B"]


# Archive and restore


def archive(client: TestClient, list_id: int, action: str = "archive") -> dict:
    response = client.post(f"/lists/{list_id}/{action}")
    assert response.status_code == 200
    return response.json()


def archived_names(client: TestClient, board_id: int) -> list[str]:
    response = client.get(f"/boards/{board_id}/lists", params={"archived": True})
    assert response.status_code == 200
    return [board_list["name"] for board_list in response.json()]


def positions(client: TestClient, board_id: int) -> list[int]:
    lists = client.get(f"/boards/{board_id}/lists").json()
    return [board_list["position"] for board_list in lists]


def test_new_list_is_not_archived(client: TestClient) -> None:
    _, lists = board_with_lists(client, "A")

    assert lists["A"]["archived_at"] is None


def test_archive_list_hides_it_and_renumbers_the_rest(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C")

    body = archive(client, lists["B"]["id"])

    assert body["archived_at"] is not None
    assert body["position"] is None
    assert list_names(client, board_id) == ["A", "C"]
    assert positions(client, board_id) == [0, 1]
    assert archived_names(client, board_id) == ["B"]


def test_archived_list_can_still_be_read(client: TestClient) -> None:
    _, lists = board_with_lists(client, "A")
    archived = archive(client, lists["A"]["id"])

    response = client.get(f"/lists/{lists['A']['id']}")

    assert response.status_code == 200
    assert response.json() == archived


def test_archived_lists_newest_first(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C")
    for name in "CAB":
        archive(client, lists[name]["id"])

    assert archived_names(client, board_id) == ["B", "A", "C"]
    assert list_names(client, board_id) == []


def test_restore_list_puts_it_at_the_end(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B", "C")
    archive(client, lists["A"]["id"])

    body = archive(client, lists["A"]["id"], "restore")

    assert body["archived_at"] is None
    assert body["position"] == 2
    assert list_names(client, board_id) == ["B", "C", "A"]
    assert archived_names(client, board_id) == []


def test_new_list_after_archive_goes_to_the_end(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B")
    archive(client, lists["B"]["id"])

    new = create_list(client, board_id, "C")

    assert new["position"] == 1
    assert list_names(client, board_id) == ["A", "C"]


@pytest.mark.parametrize(
    ("first", "again"), [("archive", "archive"), (None, "restore")]
)
def test_archive_or_restore_twice_returns_422(
    client: TestClient, first: str | None, again: str
) -> None:
    _, lists = board_with_lists(client, "A")
    if first:
        archive(client, lists["A"]["id"], first)

    response = client.post(f"/lists/{lists['A']['id']}/{again}")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["path", "list_id"]


@pytest.mark.parametrize("payload", [{"name": "New"}, {"position": 0}])
def test_change_archived_list_returns_422(client: TestClient, payload: dict) -> None:
    board_id, lists = board_with_lists(client, "A", "B")
    archive(client, lists["A"]["id"])

    response = client.patch(f"/lists/{lists['A']['id']}", json=payload)

    assert response.status_code == 422
    assert archived_names(client, board_id) == ["A"]
    assert list_names(client, board_id) == ["B"]


def test_delete_archived_list(client: TestClient) -> None:
    board_id, lists = board_with_lists(client, "A", "B")
    archive(client, lists["A"]["id"])

    assert client.delete(f"/lists/{lists['A']['id']}").status_code == 204

    assert archived_names(client, board_id) == []
    assert list_names(client, board_id) == ["B"]
    assert positions(client, board_id) == [0]


@pytest.mark.parametrize("archived", ["maybe", "2"])
def test_archived_filter_must_be_a_bool(client: TestClient, archived: str) -> None:
    board_id, _ = board_with_lists(client, "A")

    response = client.get(f"/boards/{board_id}/lists", params={"archived": archived})

    assert response.status_code == 422


def test_archive_missing_list_returns_404(client: TestClient) -> None:
    assert client.post("/lists/999/archive").status_code == 404
    assert client.post("/lists/999/restore").status_code == 404


@pytest.mark.parametrize("action", ["archive", "restore"])
def test_other_users_list_archive_returns_404(
    client: TestClient, other_headers: dict, action: str
) -> None:
    _, lists = board_with_lists(client, "A")
    if action == "restore":
        archive(client, lists["A"]["id"])

    response = client.post(f"/lists/{lists['A']['id']}/{action}", headers=other_headers)

    assert response.status_code == 404
