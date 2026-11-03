import os
from collections.abc import Generator

# Must be set before importing the app, which reads settings at import time.
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-bytes-long")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app

PASSWORD = "correct-horse"


@pytest.fixture
def db() -> Generator[Session]:
    # A fresh in-memory database for every test.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


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
