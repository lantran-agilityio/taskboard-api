import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.label import Label


def create_board(client: TestClient, name: str = "Project X") -> dict:
    response = client.post("/boards", json={"name": name})
    assert response.status_code == 201
    return response.json()


def create_label(
    client: TestClient, board_id: int, name: str = "Bug", color: str = "red"
) -> dict:
    response = client.post(
        f"/boards/{board_id}/labels", json={"name": name, "color": color}
    )
    assert response.status_code == 201
    return response.json()


def labels_of(client: TestClient, board_id: int) -> list[dict]:
    response = client.get(f"/boards/{board_id}/labels")
    assert response.status_code == 200
    return response.json()


# Default labels


def test_new_board_has_six_unnamed_labels(client: TestClient) -> None:
    board = create_board(client)

    labels = labels_of(client, board["id"])

    assert [(label["name"], label["color"]) for label in labels] == [
        ("", "green"),
        ("", "yellow"),
        ("", "orange"),
        ("", "red"),
        ("", "purple"),
        ("", "blue"),
    ]
    assert {label["board_id"] for label in labels} == {board["id"]}


def test_default_labels_can_be_used_and_changed(client: TestClient) -> None:
    board = create_board(client)
    green = labels_of(client, board["id"])[0]
    board_list = client.post(f"/boards/{board['id']}/lists", json={"name": "A"}).json()

    card = client.post(
        f"/lists/{board_list['id']}/cards",
        json={"title": "C", "label_ids": [green["id"]]},
    ).json()
    renamed = client.patch(f"/labels/{green['id']}", json={"name": "Done"})

    assert card["label_ids"] == [green["id"]]
    assert renamed.json() == {**green, "name": "Done"}


# Create and list


def test_create_label(client: TestClient) -> None:
    board = create_board(client)

    response = client.post(
        f"/boards/{board['id']}/labels", json={"name": "  Bug  ", "color": "red"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "board_id": board["id"],
        "name": "Bug",
        "color": "red",
    }


@pytest.mark.parametrize(
    "payload",
    [{"color": "red"}, {"name": "", "color": "red"}, {"name": "   ", "color": "red"}],
)
def test_create_label_without_a_name(client: TestClient, payload: dict) -> None:
    board = create_board(client)

    response = client.post(f"/boards/{board['id']}/labels", json=payload)

    assert response.status_code == 201
    assert response.json()["name"] == ""


def test_list_labels_in_creation_order(client: TestClient) -> None:
    board = create_board(client)
    defaults = labels_of(client, board["id"])
    bug = create_label(client, board["id"], "Bug", "red")
    feature = create_label(client, board["id"], "Feature", "green")
    # Names may repeat, like on Trello.
    again = create_label(client, board["id"], "Bug", "orange")

    assert labels_of(client, board["id"]) == [*defaults, bug, feature, again]


def test_labels_belong_to_their_board(client: TestClient) -> None:
    first = create_board(client, "First")
    second = create_board(client, "Second")
    create_label(client, first["id"])

    labels = labels_of(client, second["id"])
    assert len(labels) == 6
    assert {label["board_id"] for label in labels} == {second["id"]}


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Bug"},
        {},
        {"name": "x" * 101, "color": "red"},
        {"name": "Bug", "color": "pink"},
        {"name": "Bug", "color": "RED"},
        {"name": "Bug", "color": None},
    ],
)
def test_create_label_invalid_payload(client: TestClient, payload: dict) -> None:
    board = create_board(client)
    defaults = labels_of(client, board["id"])

    response = client.post(f"/boards/{board['id']}/labels", json=payload)

    assert response.status_code == 422
    assert labels_of(client, board["id"]) == defaults


def test_create_label_on_missing_board_returns_404(client: TestClient) -> None:
    response = client.post("/boards/999/labels", json={"name": "Bug", "color": "red"})

    assert response.status_code == 404


# Get, change, delete


def test_get_label(client: TestClient) -> None:
    board = create_board(client)
    label = create_label(client, board["id"])

    response = client.get(f"/labels/{label['id']}")

    assert response.status_code == 200
    assert response.json() == label


def test_get_missing_label_returns_404(client: TestClient) -> None:
    assert client.get("/labels/999").status_code == 404


@pytest.mark.parametrize(
    ("payload", "name", "color"),
    [
        ({"name": "Defect"}, "Defect", "red"),
        ({"color": "purple"}, "Bug", "purple"),
        ({"name": "Defect", "color": "blue"}, "Defect", "blue"),
        ({"name": ""}, "", "red"),
        ({"name": "   "}, "", "red"),
    ],
)
def test_update_label(client: TestClient, payload: dict, name: str, color: str) -> None:
    board = create_board(client)
    label = create_label(client, board["id"], "Bug", "red")

    response = client.patch(f"/labels/{label['id']}", json=payload)

    assert response.status_code == 200
    assert response.json() == {**label, "name": name, "color": color}


@pytest.mark.parametrize(
    "payload",
    [{}, {"name": None}, {"color": None}, {"name": "x" * 101}, {"color": "pink"}],
)
def test_update_label_invalid_payload(client: TestClient, payload: dict) -> None:
    board = create_board(client)
    label = create_label(client, board["id"])
    before = labels_of(client, board["id"])

    response = client.patch(f"/labels/{label['id']}", json=payload)

    assert response.status_code == 422
    assert labels_of(client, board["id"]) == before


def test_delete_label(client: TestClient) -> None:
    board = create_board(client)
    defaults = labels_of(client, board["id"])
    bug = create_label(client, board["id"], "Bug")
    feature = create_label(client, board["id"], "Feature")

    assert client.delete(f"/labels/{bug['id']}").status_code == 204

    assert labels_of(client, board["id"]) == [*defaults, feature]
    assert client.get(f"/labels/{bug['id']}").status_code == 404


def test_delete_label_removes_it_from_cards(client: TestClient) -> None:
    board = create_board(client)
    bug = create_label(client, board["id"], "Bug")
    feature = create_label(client, board["id"], "Feature")
    board_list = client.post(f"/boards/{board['id']}/lists", json={"name": "A"}).json()
    card = client.post(
        f"/lists/{board_list['id']}/cards",
        json={"title": "C", "label_ids": [bug["id"], feature["id"]]},
    ).json()

    client.delete(f"/labels/{bug['id']}")

    assert client.get(f"/cards/{card['id']}").json()["label_ids"] == [feature["id"]]


def test_delete_missing_label_returns_404(client: TestClient) -> None:
    assert client.delete("/labels/999").status_code == 404


def test_delete_board_deletes_its_labels(client: TestClient, db: Session) -> None:
    board = create_board(client)
    create_label(client, board["id"])

    client.delete(f"/boards/{board['id']}")

    assert db.scalars(select(Label)).all() == []


# Other users


@pytest.mark.parametrize(
    ("method", "json"),
    [("GET", None), ("POST", {"name": "Bug", "color": "red"})],
)
def test_other_users_board_labels_return_404(
    client: TestClient, other_headers: dict, method: str, json: dict | None
) -> None:
    board = create_board(client)

    response = client.request(
        method, f"/boards/{board['id']}/labels", json=json, headers=other_headers
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "json"),
    [("GET", None), ("PATCH", {"name": "Mine"}), ("DELETE", None)],
)
def test_other_users_label_returns_404(
    client: TestClient, other_headers: dict, method: str, json: dict | None
) -> None:
    board = create_board(client)
    label = create_label(client, board["id"])
    before = labels_of(client, board["id"])

    response = client.request(
        method, f"/labels/{label['id']}", json=json, headers=other_headers
    )

    assert response.status_code == 404
    assert labels_of(client, board["id"]) == before
