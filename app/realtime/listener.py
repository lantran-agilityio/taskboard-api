import asyncio
import contextlib
import json
import logging
from collections.abc import Awaitable, Callable, Iterator

import psycopg
from sqlalchemy import make_url

from app.realtime.events import CHANNEL
from app.realtime.hub import BoardHub

logger = logging.getLogger(__name__)

# Sent to every socket after a reconnect: NOTIFYs sent while the listener was
# disconnected are gone, so clients may have missed changes.
RESYNC = {"type": "resync"}

Connect = Callable[[str], Awaitable[psycopg.AsyncConnection]]


def backoff_delays(first: float = 0.5, cap: float = 30) -> Iterator[float]:
    """Seconds to wait between reconnect attempts: doubling, then capped."""
    delay = first
    while True:
        yield delay
        delay = min(delay * 2, cap)


async def connect_and_listen(conninfo: str) -> psycopg.AsyncConnection:
    connection = await psycopg.AsyncConnection.connect(
        conninfo,
        autocommit=True,
        # Notice a connection that dies without being closed (a network drop)
        # in about 25 seconds, instead of waiting for events forever.
        keepalives=1,
        keepalives_idle=10,
        keepalives_interval=5,
        keepalives_count=3,
    )
    await connection.execute(f"LISTEN {CHANNEL}")
    return connection


class Listener:
    """One LISTEN connection per process, forwarding events to the hub.

    If the connection breaks (for example, Postgres restarts), it reconnects
    with backoff until it succeeds, then sends `resync` to every socket.
    """

    def __init__(
        self,
        conninfo: str,
        hub: BoardHub,
        connect: Connect,
        connection: psycopg.AsyncConnection,
    ) -> None:
        self._conninfo = conninfo
        self._hub = hub
        self._connect = connect
        self._connection = connection
        self._task = asyncio.create_task(self._run())

    @classmethod
    async def start(
        cls, database_url: str, hub: BoardHub, connect: Connect = connect_and_listen
    ) -> "Listener":
        # psycopg wants a plain libpq URL, without SQLAlchemy's "+psycopg".
        conninfo = make_url(database_url).set(drivername="postgresql")
        conninfo_text = conninfo.render_as_string(hide_password=False)
        # LISTEN is active before start() returns, so the app takes no request
        # whose event could be missed.
        connection = await connect(conninfo_text)
        return cls(conninfo_text, hub, connect, connection)

    @property
    def backend_pid(self) -> int:
        """The server process of the current LISTEN connection."""
        return self._connection.info.backend_pid

    async def stop(self) -> None:
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        await self._connection.close()

    async def _run(self) -> None:
        while True:
            try:
                await self._forward()
            except psycopg.Error as error:
                logger.warning("Realtime listener lost its connection: %s", error)
            await self._connection.close()
            self._connection = await self._reconnect()
            logger.info("Realtime listener reconnected")
            await self._hub.broadcast(RESYNC)

    async def _forward(self) -> None:
        async for notify in self._connection.notifies():
            try:
                await self._hub.dispatch(json.loads(notify.payload))
            except Exception:  # one bad event mustn't stop the others
                logger.exception("Could not dispatch board event")

    async def _reconnect(self) -> psycopg.AsyncConnection:
        delays = backoff_delays()
        while True:
            try:
                return await self._connect(self._conninfo)
            except psycopg.Error as error:
                delay = next(delays)
                logger.warning(
                    "Realtime listener can't reconnect (%s); retrying in %gs",
                    error,
                    delay,
                )
                await asyncio.sleep(delay)
