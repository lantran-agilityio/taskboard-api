import asyncio
import contextlib
import json
import logging

import psycopg
from sqlalchemy import make_url

from app.realtime.events import CHANNEL
from app.realtime.hub import BoardHub

logger = logging.getLogger(__name__)


class Listener:
    """One LISTEN connection per process, forwarding events to the hub."""

    def __init__(self, connection: psycopg.AsyncConnection, task: asyncio.Task) -> None:
        self._connection = connection
        self._task = task

    @classmethod
    async def start(cls, database_url: str, hub: BoardHub) -> "Listener":
        # psycopg wants a plain libpq URL, without SQLAlchemy's "+psycopg".
        conninfo = make_url(database_url).set(drivername="postgresql")
        connection = await psycopg.AsyncConnection.connect(
            conninfo.render_as_string(hide_password=False), autocommit=True
        )
        # LISTEN is active before start() returns, so the app takes no request
        # whose event could be missed.
        await connection.execute(f"LISTEN {CHANNEL}")
        return cls(connection, asyncio.create_task(forward(connection, hub)))

    async def stop(self) -> None:
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        await self._connection.close()


async def forward(connection: psycopg.AsyncConnection, hub: BoardHub) -> None:
    try:
        async for notify in connection.notifies():
            try:
                await hub.dispatch(json.loads(notify.payload))
            except Exception:  # one bad event mustn't stop the others
                logger.exception("Could not dispatch board event")
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Realtime listener stopped; no more board events")
