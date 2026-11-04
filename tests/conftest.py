import os
from collections.abc import Generator

# Must be set before importing the app, which reads settings at import time.
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-bytes-long")

from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.core.config import settings
from app.core.database import get_db
from app.main import app

# Every TestClient starts the app's lifespan, whose realtime listener connects
# to DATABASE_URL: point it at the test database, never at `taskboard`.
settings.database_url = settings.test_database_url

PASSWORD = "correct-horse"
ALEMBIC_INI = Path(__file__).parents[1] / "alembic.ini"


def alembic_config() -> Config:
    """Alembic pointed at the test database."""
    config = Config(ALEMBIC_INI)
    config.set_main_option("sqlalchemy.url", settings.test_database_url)
    config.attributes["configure_logger"] = False
    return config


@pytest.fixture(scope="session")
def engine() -> Generator[Engine]:
    """The test database, rebuilt from the migrations once per test run."""
    engine = create_engine(settings.test_database_url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    command.upgrade(alembic_config(), "head")
    yield engine
    engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Generator[Session]:
    """A session whose changes are rolled back after the test.

    Routes call commit(), which here only releases a savepoint inside one
    outer transaction; rolling that back leaves the database empty again.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection, autoflush=False, join_transaction_mode="create_savepoint"
    )
    try:
        yield session
        # The real commit never happens, so check the deferred unique
        # constraints now: every test must leave positions without duplicates.
        session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def anon_client(db: Session) -> Generator[TestClient]:
    """A client with no token."""
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    """Register a user, log in, and return their Authorization header."""
    response = client.post(
        "/auth/register", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 201
    response = client.post(
        "/auth/token", data={"username": email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def client(db: Session) -> Generator[TestClient]:
    """A client logged in as alice@example.com."""
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        test_client.headers.update(auth_headers(test_client, "alice@example.com"))
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def other_headers(client: TestClient) -> dict[str, str]:
    """Authorization header for a second user, bob@example.com."""
    return auth_headers(client, "bob@example.com")


@pytest.fixture
def committed_client(engine: Engine) -> Generator[TestClient]:
    """A client logged in as alice@example.com whose requests commit for real.

    For tests that need other connections to see the changes: concurrent
    requests, and realtime events (Postgres only delivers NOTIFY on commit).
    Each request gets its own session; the tables are emptied afterwards.
    """
    make_session = sessionmaker(bind=engine, autoflush=False)

    def real_session() -> Generator[Session]:
        with make_session() as session:
            yield session

    app.dependency_overrides[get_db] = real_session
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            client.headers.update(auth_headers(client, "alice@example.com"))
            yield client
    finally:
        app.dependency_overrides.clear()
        with engine.begin() as connection:
            connection.execute(
                text(
                    "TRUNCATE users, boards, board_members, lists, cards "
                    "RESTART IDENTITY CASCADE"
                )
            )
