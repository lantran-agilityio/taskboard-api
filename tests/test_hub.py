import asyncio
from typing import Any

from app.realtime.hub import BoardHub


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.closed_with: int | None = None

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(data)

    async def close(self, code: int) -> None:
        self.closed_with = code


def event(event_type: str, board_id: int, **data: Any) -> dict[str, Any]:
    return {"type": event_type, "board_id": board_id, "data": data}


def test_dispatch_only_reaches_that_board() -> None:
    hub = BoardHub()
    watching, elsewhere = FakeSocket(), FakeSocket()
    hub.connect(1, 10, watching)  # type: ignore[arg-type]
    hub.connect(2, 10, elsewhere)  # type: ignore[arg-type]

    asyncio.run(hub.dispatch(event("list.created", 1)))

    assert [sent["type"] for sent in watching.sent] == ["list.created"]
    assert elsewhere.sent == []


def test_member_removed_closes_only_that_users_sockets() -> None:
    hub = BoardHub()
    alice, bob_phone, bob_laptop = FakeSocket(), FakeSocket(), FakeSocket()
    hub.connect(1, 10, alice)  # type: ignore[arg-type]
    hub.connect(1, 20, bob_phone)  # type: ignore[arg-type]
    hub.connect(1, 20, bob_laptop)  # type: ignore[arg-type]

    asyncio.run(hub.dispatch(event("member.removed", 1, user_id=20)))

    assert all(len(socket.sent) == 1 for socket in (alice, bob_phone, bob_laptop))
    assert alice.closed_with is None
    assert bob_phone.closed_with == bob_laptop.closed_with == 4404
    assert [subscriber.user_id for subscriber in hub.subscribers(1)] == [10]


def test_board_deleted_closes_every_socket_on_it() -> None:
    hub = BoardHub()
    sockets = [FakeSocket(), FakeSocket()]
    for user_id, socket in enumerate(sockets):
        hub.connect(1, user_id, socket)  # type: ignore[arg-type]

    asyncio.run(hub.dispatch(event("board.deleted", 1)))

    assert [socket.closed_with for socket in sockets] == [4404, 4404]
    assert hub.subscribers(1) == []


def test_failed_send_drops_the_socket() -> None:
    class GoneSocket(FakeSocket):
        async def send_json(self, data: dict[str, Any]) -> None:
            raise RuntimeError("socket closed")

    hub = BoardHub()
    hub.connect(1, 10, GoneSocket())  # type: ignore[arg-type]

    asyncio.run(hub.dispatch(event("list.created", 1)))

    assert hub.subscribers(1) == []


def test_broadcast_reaches_every_board_and_drops_dead_sockets() -> None:
    class GoneSocket(FakeSocket):
        async def send_json(self, data: dict[str, Any]) -> None:
            raise RuntimeError("socket closed")

    hub = BoardHub()
    first, second = FakeSocket(), FakeSocket()
    hub.connect(1, 10, first)  # type: ignore[arg-type]
    hub.connect(2, 20, second)  # type: ignore[arg-type]
    hub.connect(2, 30, GoneSocket())  # type: ignore[arg-type]

    asyncio.run(hub.broadcast({"type": "resync"}))

    assert first.sent == second.sent == [{"type": "resync"}]
    assert [subscriber.user_id for subscriber in hub.subscribers(2)] == [20]
