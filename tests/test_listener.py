import asyncio
import itertools
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import psycopg
import pytest

from app.realtime import listener as listener_module
from app.realtime.listener import Listener, backoff_delays

URL = "postgresql+psycopg://localhost/unused"
real_sleep = asyncio.sleep


class FakeConnection:
    """Stands in for a LISTEN connection; `broken` ones fail on first read."""

    def __init__(self, pid: int, broken: bool) -> None:
        self.info = SimpleNamespace(backend_pid=pid)
        self.broken = broken
        self.closed = False

    async def notifies(self) -> AsyncIterator[Any]:
        if self.broken:
            raise psycopg.OperationalError("server closed the connection")
        await asyncio.Event().wait()  # a healthy connection with no events
        yield  # makes this an async generator

    async def close(self) -> None:
        self.closed = True


class FakeHub:
    def __init__(self) -> None:
        self.broadcasts: list[dict[str, Any]] = []

    async def dispatch(self, event: dict[str, Any]) -> None:
        pass

    async def broadcast(self, message: dict[str, Any]) -> None:
        self.broadcasts.append(message)


async def wait_until(condition: Any, timeout: float = 2.0) -> None:
    async with asyncio.timeout(timeout):
        while not condition():
            await real_sleep(0.01)


def test_backoff_doubles_up_to_a_cap() -> None:
    delays = list(itertools.islice(backoff_delays(), 9))

    assert delays == [0.5, 1, 2, 4, 8, 16, 30, 30, 30]


def test_reconnects_with_backoff_and_asks_for_resync(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    waits: list[float] = []

    async def record_sleep(delay: float) -> None:
        waits.append(delay)
        await real_sleep(0)

    monkeypatch.setattr(listener_module.asyncio, "sleep", record_sleep)
    first = FakeConnection(pid=1, broken=True)
    second = FakeConnection(pid=2, broken=False)
    attempts = iter(
        [
            first,
            psycopg.OperationalError("refused"),
            psycopg.OperationalError("refused"),
            second,
        ]
    )

    async def connect(conninfo: str) -> FakeConnection:
        result = next(attempts)
        if isinstance(result, Exception):
            raise result
        return result

    async def scenario() -> None:
        hub = FakeHub()
        listener = await Listener.start(URL, hub, connect=connect)  # type: ignore[arg-type]
        await wait_until(lambda: hub.broadcasts)
        assert hub.broadcasts == [{"type": "resync"}]
        assert listener.backend_pid == 2
        assert first.closed
        await listener.stop()
        assert second.closed

    asyncio.run(scenario())
    assert waits == [0.5, 1]


def test_stop_during_backoff_is_prompt() -> None:
    connections = iter([FakeConnection(pid=1, broken=True)])

    async def connect(conninfo: str) -> FakeConnection:
        connection = next(connections, None)
        if connection is None:
            raise psycopg.OperationalError("database is down")
        return connection

    async def scenario() -> None:
        listener = await Listener.start(URL, FakeHub(), connect=connect)  # type: ignore[arg-type]
        await real_sleep(0.05)  # now waiting 0.5s before the next attempt
        async with asyncio.timeout(0.3):
            await listener.stop()

    asyncio.run(scenario())
