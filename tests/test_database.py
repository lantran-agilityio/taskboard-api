import time

from fastapi.testclient import TestClient
from sqlalchemy import Connection, create_engine, text
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import make_engine
from app.main import app


def backend_pid(connection: Connection) -> int:
    return connection.execute(text("SELECT pg_backend_pid()")).scalar_one()


def outside_connection() -> Connection:
    """A connection from no pool, so it's never one of the pids being killed."""
    return create_engine(settings.test_database_url, poolclass=NullPool).connect()


def terminate(pids: list[int]) -> None:
    """Kill these server processes, as a database restart would, and wait.

    pg_terminate_backend only sends the signal: wait until the processes are
    gone, or the pool could still find them alive.
    """
    with outside_connection() as connection:
        for pid in pids:
            connection.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": pid})
        for _ in range(100):
            alive = connection.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE pid = ANY(:pids)"),
                {"pids": pids},
            ).scalar_one()
            if not alive:
                return
            time.sleep(0.05)
    raise AssertionError(f"backends {pids} still alive")


def test_pool_replaces_a_connection_the_server_killed() -> None:
    engine = make_engine(settings.test_database_url)
    try:
        with engine.connect() as connection:
            dead = backend_pid(connection)
        # Back in the pool now; kill it behind the pool's back.
        terminate([dead])

        with engine.connect() as connection:
            assert backend_pid(connection) != dead
    finally:
        engine.dispose()


def test_requests_succeed_after_pooled_connections_die(
    committed_client: TestClient,
) -> None:
    assert committed_client.get("/users/me").status_code == 200
    listener = app.state.listener.backend_pid
    with outside_connection() as connection:
        pids = list(
            connection.execute(
                text(
                    "SELECT pid FROM pg_stat_activity "
                    "WHERE datname = current_database() "
                    "AND pid NOT IN (pg_backend_pid(), :listener)"
                ),
                {"listener": listener},
            ).scalars()
        )
    assert pids, "the request should have left a connection in the pool"
    terminate(pids)

    assert committed_client.get("/users/me").status_code == 200
