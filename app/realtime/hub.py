import contextlib
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from starlette.websockets import WebSocket, WebSocketDisconnect

from app.realtime.events import EventType

# WebSocket close code for "you can't see this board (any more)": 4000 + 404.
CLOSE_NOT_FOUND = 4404
# What sending to or closing a socket raises once the client is gone.
GONE = (WebSocketDisconnect, RuntimeError, OSError)


# eq=False: compared and hashed by identity, so two sockets of the same user
# are two subscribers. (WebSocket itself can't go in a set: it isn't hashable.)
@dataclass(eq=False)
class Subscriber:
    user_id: int
    websocket: WebSocket


class BoardHub:
    """The sockets watching each board, in this process."""

    def __init__(self) -> None:
        self._boards: dict[int, set[Subscriber]] = defaultdict(set)

    def connect(self, board_id: int, user_id: int, websocket: WebSocket) -> Subscriber:
        subscriber = Subscriber(user_id, websocket)
        self._boards[board_id].add(subscriber)
        return subscriber

    def disconnect(self, board_id: int, subscriber: Subscriber) -> None:
        subscribers = self._boards.get(board_id)
        if subscribers is not None:
            subscribers.discard(subscriber)
            if not subscribers:
                del self._boards[board_id]

    def subscribers(self, board_id: int) -> list[Subscriber]:
        return list(self._boards.get(board_id, ()))

    async def dispatch(self, event: dict[str, Any]) -> None:
        """Send an event to the board's sockets, then close the ones that lost access."""
        board_id = event["board_id"]
        for subscriber in self.subscribers(board_id):
            try:
                await subscriber.websocket.send_json(event)
            except GONE:
                self.disconnect(board_id, subscriber)

        if event["type"] == EventType.BOARD_DELETED:
            lost_access = self.subscribers(board_id)
        elif event["type"] == EventType.MEMBER_REMOVED:
            user_id = event["data"]["user_id"]
            lost_access = [
                s for s in self.subscribers(board_id) if s.user_id == user_id
            ]
        else:
            lost_access = []
        for subscriber in lost_access:
            self.disconnect(board_id, subscriber)
            with contextlib.suppress(*GONE):
                await subscriber.websocket.close(code=CLOSE_NOT_FOUND)


hub = BoardHub()
