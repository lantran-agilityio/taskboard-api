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
    assert body["name"] == "Project X"
    assert isinstance(body["id"], int)
    assert "created_at" in body


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
