import asyncio
import contextlib
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.board import Board
from app.models.user import User
from app.realtime.hub import CLOSE_NOT_FOUND, hub
from app.services.permissions import board_role

# WebSocket close codes are 4000 + the matching HTTP status.
CLOSE_UNAUTHORIZED = 4401

router = APIRouter(tags=["realtime"])


async def read_token(websocket: WebSocket) -> str | None:
    """The token from the client's first message, or None if it didn't send one."""
    try:
        text = await asyncio.wait_for(
            websocket.receive_text(), timeout=settings.ws_auth_timeout_seconds
        )
        message = json.loads(text)
    except (TimeoutError, ValueError, KeyError, WebSocketDisconnect):
        return None
    if not isinstance(message, dict) or message.get("type") != "auth":
        return None
    token = message.get("token")
    return token if isinstance(token, str) else None


def check_access(db: Session, board_id: int, user_id: int | None) -> int | None:
    """None if the user may watch the board, otherwise the close code."""
    try:
        if user_id is None or db.get(User, user_id) is None:
            return CLOSE_UNAUTHORIZED
        board = db.get(Board, board_id)
        if board is None or board_role(board, user_id) is None:
            return CLOSE_NOT_FOUND
        return None
    finally:
        # Hand the connection back now; otherwise every open socket would keep
        # a database connection for as long as it stays open.
        db.close()


@router.websocket("/boards/{board_id}/ws")
async def board_updates(
    websocket: WebSocket, board_id: int, db: Session = Depends(get_db)
) -> None:
    await websocket.accept()
    token = await read_token(websocket)
    user_id = decode_access_token(token) if token is not None else None
    # The session is synchronous, so run it off the event loop.
    close_code = await run_in_threadpool(check_access, db, board_id, user_id)
    if close_code is not None:
        with contextlib.suppress(RuntimeError):  # the client may have left
            await websocket.close(code=close_code)
        return

    assert user_id is not None  # check_access returned None, so the user exists
    subscriber = hub.connect(board_id, user_id, websocket)
    try:
        await websocket.send_json({"type": "ready"})
        while True:
            text = await websocket.receive_text()
            with contextlib.suppress(ValueError):
                message = json.loads(text)
                if isinstance(message, dict) and message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: the hub closed this socket (access lost) while we waited.
        pass
    finally:
        hub.disconnect(board_id, subscriber)
