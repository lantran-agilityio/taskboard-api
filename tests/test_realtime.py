from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.core.config import settings
from app.core.security import create_access_token
from tests.conftest import auth_headers

# A missing event would otherwise block receive_json() forever.
pytestmark = pytest.mark.timeout(10)

BOB = "bob@example.com"


def token_of(headers: Mapping[str, str]) -> str:
    # client.headers is case-insensitive; plain dicts from auth_headers aren't.
    return headers["Authorization"].removeprefix("Bearer ")


@contextmanager
def watch(
    client: TestClient, board_id: int, headers: dict | None = None
) -> Iterator[WebSocketTestSession]:
    """A socket on the board, authenticated and past the `ready` message."""
    token = token_of(headers or client.headers)
    with client.websocket_connect(f"/boards/{board_id}/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        assert ws.receive_json() == {"type": "ready"}
        yield ws


def close_code(ws: WebSocketTestSession) -> int:
    with pytest.raises(WebSocketDisconnect) as closed:
        ws.receive_json()
    return closed.value.code


def alice_id(client: TestClient) -> int:
    return client.get("/users/me").json()["id"]


def make_board(client: TestClient, name: str = "Live") -> int:
    return client.post("/boards", json={"name": name}).json()["id"]


def make_list(client: TestClient, board_id: int, name: str) -> int:
    return client.post(f"/boards/{board_id}/lists", json={"name": name}).json()["id"]


def make_card(client: TestClient, list_id: int, title: str) -> int:
    return client.post(f"/lists/{list_id}/cards", json={"title": title}).json()["id"]


def share(client: TestClient, board_id: int, role: str) -> dict:
    headers = auth_headers(client, BOB)
    response = client.post(
        f"/boards/{board_id}/members", json={"email": BOB, "role": role}
    )
    assert response.status_code == 201
    return headers


# Connecting


def test_valid_token_gets_ready(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)

    with watch(committed_client, board_id) as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


@pytest.mark.parametrize(
    "first_message",
    [
        {"type": "auth", "token": "not-a-jwt"},
        {"type": "auth", "token": create_access_token(1, timedelta(seconds=-1))},
        {"type": "auth"},
        {"type": "ping"},
        "not json",
    ],
    ids=["bad-token", "expired-token", "no-token", "not-auth", "not-json"],
)
def test_bad_auth_message_closes_with_4401(
    committed_client: TestClient, first_message: dict | str
) -> None:
    board_id = make_board(committed_client)

    with committed_client.websocket_connect(f"/boards/{board_id}/ws") as ws:
        if isinstance(first_message, str):
            ws.send_text(first_message)
        else:
            ws.send_json(first_message)
        assert close_code(ws) == 4401


def test_no_auth_message_in_time_closes_with_4401(
    committed_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ws_auth_timeout_seconds", 0.2)
    board_id = make_board(committed_client)

    with committed_client.websocket_connect(f"/boards/{board_id}/ws") as ws:
        assert close_code(ws) == 4401


def test_non_member_closes_with_4404(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    bob = auth_headers(committed_client, BOB)

    with committed_client.websocket_connect(f"/boards/{board_id}/ws") as ws:
        ws.send_json({"type": "auth", "token": token_of(bob)})
        assert close_code(ws) == 4404


def test_missing_board_closes_with_4404(committed_client: TestClient) -> None:
    token = token_of(committed_client.headers)

    with committed_client.websocket_connect("/boards/999/ws") as ws:
        ws.send_json({"type": "auth", "token": token})
        assert close_code(ws) == 4404


# Events


def test_viewer_receives_events(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    bob = share(committed_client, board_id, "viewer")

    with watch(committed_client, board_id, bob) as ws:
        list_id = make_list(committed_client, board_id, "To do")

        event = ws.receive_json()

    assert event["type"] == "list.created"
    assert event["board_id"] == board_id
    assert event["data"]["list"]["id"] == list_id
    assert event["data"]["list"]["name"] == "To do"
    assert event["data"]["list_ids"] == [list_id]


def test_board_events(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)

    with watch(committed_client, board_id) as ws:
        # Stars are per user: starring sends nothing, so the next event is the rename.
        committed_client.put(f"/boards/{board_id}/star")
        committed_client.patch(
            f"/boards/{board_id}", json={"name": "Renamed", "description": "About"}
        )
        event = ws.receive_json()
        assert event["type"] == "board.updated"
        board = event["data"]["board"]
        assert (board["name"], board["description"]) == ("Renamed", "About")
        assert "starred" not in board

        committed_client.delete(f"/boards/{board_id}")
        assert ws.receive_json() == {
            "type": "board.deleted",
            "board_id": board_id,
            "actor_id": alice_id(committed_client),
            "data": {},
        }
        assert close_code(ws) == 4404


def test_list_events_carry_the_new_order(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    first = make_list(committed_client, board_id, "A")
    second = make_list(committed_client, board_id, "B")

    with watch(committed_client, board_id) as ws:
        third = make_list(committed_client, board_id, "C")
        event = ws.receive_json()
        assert event["type"] == "list.created"
        assert event["data"]["list_ids"] == [first, second, third]

        committed_client.patch(f"/lists/{third}", json={"position": 0})
        event = ws.receive_json()
        assert event["type"] == "list.updated"
        assert event["data"]["list"]["position"] == 0
        assert event["data"]["list_ids"] == [third, first, second]

        committed_client.delete(f"/lists/{first}")
        event = ws.receive_json()
        assert event["type"] == "list.deleted"
        assert event["data"] == {
            "list_id": first,
            "name": "A",
            "list_ids": [third, second],
        }


def test_card_events_carry_the_new_order(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    first = make_list(committed_client, board_id, "A")
    second = make_list(committed_client, board_id, "B")
    x = make_card(committed_client, first, "X")
    y = make_card(committed_client, second, "Y")

    with watch(committed_client, board_id) as ws:
        z = make_card(committed_client, first, "Z")
        event = ws.receive_json()
        assert event["type"] == "card.created"
        assert event["data"]["card"]["title"] == "Z"
        assert event["data"]["lists"] == [{"list_id": first, "card_ids": [x, z]}]

        committed_client.patch(f"/cards/{z}", json={"position": 0})
        event = ws.receive_json()
        assert event["type"] == "card.updated"
        assert event["data"]["lists"] == [{"list_id": first, "card_ids": [z, x]}]

        committed_client.patch(f"/cards/{z}", json={"list_id": second, "position": 0})
        event = ws.receive_json()
        assert event["type"] == "card.updated"
        assert event["data"]["card"]["list_id"] == second
        assert event["data"]["lists"] == [
            {"list_id": first, "card_ids": [x]},
            {"list_id": second, "card_ids": [z, y]},
        ]

        committed_client.delete(f"/cards/{y}")
        event = ws.receive_json()
        assert event["type"] == "card.deleted"
        assert event["data"] == {
            "card_id": y,
            "title": "Y",
            "lists": [{"list_id": second, "card_ids": [z]}],
        }


def test_member_events(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    bob = share(committed_client, board_id, "viewer")
    bob_id = committed_client.get("/users/me", headers=bob).json()["id"]

    with watch(committed_client, board_id) as alice_ws:
        auth_headers(committed_client, "carol@example.com")
        committed_client.post(
            f"/boards/{board_id}/members",
            json={"email": "carol@example.com", "role": "editor"},
        )
        event = alice_ws.receive_json()
        assert event["type"] == "member.added"
        assert event["data"]["member"]["email"] == "carol@example.com"

        with watch(committed_client, board_id, bob) as bob_ws:
            committed_client.patch(
                f"/boards/{board_id}/members/{bob_id}", json={"role": "editor"}
            )
            for ws in (alice_ws, bob_ws):
                event = ws.receive_json()
                assert event["type"] == "member.updated"
                assert event["data"]["member"]["role"] == "editor"

            committed_client.delete(f"/boards/{board_id}/members/{bob_id}")
            for ws in (alice_ws, bob_ws):
                event = ws.receive_json()
                assert event["type"] == "member.removed"
                assert event["data"] == {"user_id": bob_id}
            assert close_code(bob_ws) == 4404

        # Alice keeps watching.
        committed_client.patch(f"/boards/{board_id}", json={"name": "Still here"})
        assert alice_ws.receive_json()["type"] == "board.updated"


def test_label_events(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    list_id = make_list(committed_client, board_id, "A")

    with watch(committed_client, board_id) as ws:
        label = committed_client.post(
            f"/boards/{board_id}/labels", json={"name": "Bug", "color": "red"}
        ).json()
        event = ws.receive_json()
        assert event["type"] == "label.created"
        assert event["data"] == {"label": label}

        committed_client.patch(f"/labels/{label['id']}", json={"color": "blue"})
        event = ws.receive_json()
        assert event["type"] == "label.updated"
        assert event["data"]["label"]["color"] == "blue"

        card_id = make_card(committed_client, list_id, "C")
        ws.receive_json()  # card.created
        committed_client.patch(
            f"/cards/{card_id}",
            json={
                "label_ids": [label["id"]],
                "due_at": "2026-11-20T10:00:00Z",
                "due_complete": True,
            },
        )
        event = ws.receive_json()
        assert event["type"] == "card.updated"
        card = event["data"]["card"]
        assert card["label_ids"] == [label["id"]]
        assert card["due_at"] == "2026-11-20T10:00:00Z"
        assert card["due_complete"] is True

        committed_client.delete(f"/labels/{label['id']}")
        event = ws.receive_json()
        assert event["type"] == "label.deleted"
        assert event["data"] == {"label_id": label["id"], "name": label["name"]}


def test_comment_events(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    card_id = make_card(
        committed_client, make_list(committed_client, board_id, "A"), "C"
    )

    with watch(committed_client, board_id) as ws:
        comment = committed_client.post(
            f"/cards/{card_id}/comments", json={"body": "Hello"}
        ).json()
        event = ws.receive_json()
        assert event["type"] == "comment.created"
        assert event["data"]["comment"] == comment

        committed_client.patch(f"/comments/{comment['id']}", json={"body": "Hi"})
        event = ws.receive_json()
        assert event["type"] == "comment.updated"
        assert event["data"]["comment"]["body"] == "Hi"

        committed_client.delete(f"/comments/{comment['id']}")
        event = ws.receive_json()
        assert event["type"] == "comment.deleted"
        assert event["data"] == {"comment_id": comment["id"], "card_id": card_id}


def test_events_carry_the_actor(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    bob = share(committed_client, board_id, "editor")
    bob_id = committed_client.get("/users/me", headers=bob).json()["id"]

    with watch(committed_client, board_id) as ws:
        make_list(committed_client, board_id, "Alice's")
        assert ws.receive_json()["actor_id"] == alice_id(committed_client)

        committed_client.post(
            f"/boards/{board_id}/lists", json={"name": "Bob's"}, headers=bob
        )
        assert ws.receive_json()["actor_id"] == bob_id


def test_archive_events(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    first = make_list(committed_client, board_id, "A")
    second = make_list(committed_client, board_id, "B")
    x = make_card(committed_client, first, "X")
    y = make_card(committed_client, first, "Y")

    with watch(committed_client, board_id) as ws:
        committed_client.post(f"/cards/{x}/archive")
        event = ws.receive_json()
        assert event["type"] == "card.archived"
        assert event["data"]["card"]["id"] == x
        assert event["data"]["card"]["archived_at"] is not None
        assert event["data"]["lists"] == [{"list_id": first, "card_ids": [y]}]

        committed_client.post(f"/cards/{x}/restore")
        event = ws.receive_json()
        assert event["type"] == "card.restored"
        assert event["data"]["lists"] == [{"list_id": first, "card_ids": [y, x]}]

        committed_client.post(f"/lists/{first}/archive")
        event = ws.receive_json()
        assert event["type"] == "list.archived"
        assert event["data"]["list"]["id"] == first
        assert event["data"]["list_ids"] == [second]

        committed_client.post(f"/lists/{first}/restore")
        event = ws.receive_json()
        assert event["type"] == "list.restored"
        assert event["data"]["list"]["position"] == 1
        assert event["data"]["list_ids"] == [second, first]


def test_failed_request_sends_no_event(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    list_id = make_list(committed_client, board_id, "A")

    with watch(committed_client, board_id) as ws:
        response = committed_client.patch(f"/lists/{list_id}", json={"position": 5})
        assert response.status_code == 422
        committed_client.patch(f"/lists/{list_id}", json={"name": "Renamed"})

        event = ws.receive_json()

    assert event["type"] == "list.updated"
    assert event["data"]["list"]["name"] == "Renamed"


def test_events_from_other_boards_are_not_sent(committed_client: TestClient) -> None:
    watched = make_board(committed_client, "Watched")
    other = make_board(committed_client, "Other")

    with watch(committed_client, watched) as ws:
        make_list(committed_client, other, "Elsewhere")
        make_list(committed_client, watched, "Here")

        event = ws.receive_json()

    assert event["board_id"] == watched
    assert event["data"]["list"]["name"] == "Here"


def test_listener_reconnects_and_asks_for_resync(
    committed_client: TestClient, engine: Engine
) -> None:
    board_id = make_board(committed_client)
    listener = committed_client.app.state.listener
    old_pid = listener.backend_pid

    with watch(committed_client, board_id) as ws:
        # What a database restart does to the listener's connection.
        with engine.begin() as connection:
            connection.execute(
                text("SELECT pg_terminate_backend(:pid)"), {"pid": old_pid}
            )

        assert ws.receive_json() == {"type": "resync"}
        assert listener.backend_pid != old_pid

        committed_client.patch(f"/boards/{board_id}", json={"name": "After restart"})
        event = ws.receive_json()

    assert event["type"] == "board.updated"
    assert event["data"]["board"]["name"] == "After restart"
