from datetime import timedelta

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from tests.conftest import PASSWORD


def register(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/auth/register", json={"email": email, "password": password})


def login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/auth/token", data={"username": email, "password": password})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# Register


def test_register(anon_client: TestClient) -> None:
    response = register(anon_client, "carol@example.com")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "carol@example.com"
    assert isinstance(body["id"], int)
    assert "created_at" in body
    assert "password" not in body
    assert "hashed_password" not in body


def test_register_lowercases_email(anon_client: TestClient) -> None:
    response = register(anon_client, "Carol@Example.COM")

    assert response.status_code == 201
    assert response.json()["email"] == "carol@example.com"


@pytest.mark.parametrize("email", ["carol@example.com", "CAROL@example.com"])
def test_register_taken_email_returns_409(anon_client: TestClient, email: str) -> None:
    register(anon_client, "carol@example.com")

    response = register(anon_client, email)

    assert response.status_code == 409
    assert response.json() == {"detail": "Email already registered"}


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"email": "not-an-email", "password": PASSWORD},
        {"email": "carol@example.com", "password": "short"},
        {"email": "carol@example.com", "password": "x" * 129},
        {"email": "carol@example.com"},
    ],
)
def test_register_invalid_input(anon_client: TestClient, payload: dict) -> None:
    response = anon_client.post("/auth/register", json=payload)

    assert response.status_code == 422


# Token


def test_login_returns_working_token(anon_client: TestClient) -> None:
    register(anon_client, "carol@example.com")

    response = login(anon_client, "Carol@example.com")

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    me = anon_client.get("/users/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "carol@example.com"


@pytest.mark.parametrize(
    ("email", "password"),
    [("carol@example.com", "wrong-password"), ("nobody@example.com", PASSWORD)],
)
def test_login_with_bad_credentials_returns_401(
    anon_client: TestClient, email: str, password: str
) -> None:
    register(anon_client, "carol@example.com")

    response = login(anon_client, email, password)

    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password"}


# Current user


def test_me(client: TestClient) -> None:
    response = client.get("/users/me")

    assert response.status_code == 200
    assert response.json()["email"] == "alice@example.com"


def test_me_without_token_returns_401(anon_client: TestClient) -> None:
    response = anon_client.get("/users/me")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        create_access_token(1, expires_delta=timedelta(seconds=-1)),
        create_access_token(999),
        jwt.encode({"sub": "1"}, "a-different-secret-key-of-32-bytes!", "HS256"),
    ],
    ids=["malformed", "expired", "unknown-user", "wrong-key"],
)
def test_me_with_bad_token_returns_401(anon_client: TestClient, token: str) -> None:
    register(anon_client, "carol@example.com")  # user id 1 exists

    response = anon_client.get("/users/me", headers=bearer(token))

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


# Every resource endpoint needs a token


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/boards"),
        ("GET", "/boards"),
        ("GET", "/boards/1"),
        ("PATCH", "/boards/1"),
        ("DELETE", "/boards/1"),
        ("POST", "/boards/1/lists"),
        ("GET", "/boards/1/lists"),
        ("GET", "/lists/1"),
        ("PATCH", "/lists/1"),
        ("DELETE", "/lists/1"),
        ("POST", "/lists/1/cards"),
        ("GET", "/lists/1/cards"),
        ("GET", "/cards/1"),
        ("PATCH", "/cards/1"),
        ("DELETE", "/cards/1"),
    ],
)
def test_resource_endpoints_need_a_token(
    anon_client: TestClient, method: str, path: str
) -> None:
    response = anon_client.request(method, path)

    assert response.status_code == 401
