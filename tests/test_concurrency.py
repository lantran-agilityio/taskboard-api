"""Requests that change the same board at the same moment.

These tests need real commits on separate connections, so they don't use
the rolled-back `db` session: each request gets its own session, and the
tables are emptied afterwards.
"""

import threading
from collections.abc import Callable, Generator
from concurrent.futures import ThreadPoolExecutor

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.database import get_db
from app.main import app
from tests.conftest import auth_headers

THREADS = 10


@pytest.fixture
def committed_client(engine: Engine) -> Generator[TestClient]:
    """A logged-in client whose requests commit for real."""
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


def run_together(
    client: TestClient, requests: list[Callable[[TestClient], httpx.Response]]
) -> list[httpx.Response]:
    """Send the requests from separate threads, released at the same moment."""
    barrier = threading.Barrier(len(requests))

    def worker(request: Callable[[TestClient], httpx.Response]) -> httpx.Response:
        # One TestClient per thread; they share the app and its overrides.
        with TestClient(app, raise_server_exceptions=False) as own:
            own.headers.update(client.headers)
            barrier.wait()
            return request(own)

    with ThreadPoolExecutor(max_workers=len(requests)) as pool:
        return list(pool.map(worker, requests))


def positions(client: TestClient, path: str) -> list[int]:
    return [item["position"] for item in client.get(path).json()]


def make_board(client: TestClient) -> int:
    return client.post("/boards", json={"name": "Race"}).json()["id"]


def make_list(client: TestClient, board_id: int, name: str) -> int:
    response = client.post(f"/boards/{board_id}/lists", json={"name": name})
    return response.json()["id"]


def make_cards(client: TestClient, list_id: int, count: int) -> list[int]:
    return [
        client.post(f"/lists/{list_id}/cards", json={"title": f"C{i}"}).json()["id"]
        for i in range(count)
    ]


def test_parallel_list_creates_get_distinct_positions(
    committed_client: TestClient,
) -> None:
    board_id = make_board(committed_client)

    responses = run_together(
        committed_client,
        [
            lambda c, i=i: c.post(f"/boards/{board_id}/lists", json={"name": f"L{i}"})
            for i in range(THREADS)
        ],
    )

    assert [response.status_code for response in responses] == [201] * THREADS
    assert positions(committed_client, f"/boards/{board_id}/lists") == list(
        range(THREADS)
    )


def test_parallel_card_creates_get_distinct_positions(
    committed_client: TestClient,
) -> None:
    list_id = make_list(committed_client, make_board(committed_client), "To do")

    responses = run_together(
        committed_client,
        [
            lambda c, i=i: c.post(f"/lists/{list_id}/cards", json={"title": f"C{i}"})
            for i in range(THREADS)
        ],
    )

    assert [response.status_code for response in responses] == [201] * THREADS
    assert positions(committed_client, f"/lists/{list_id}/cards") == list(
        range(THREADS)
    )


def test_parallel_moves_keep_both_lists_dense(committed_client: TestClient) -> None:
    board_id = make_board(committed_client)
    first = make_list(committed_client, board_id, "First")
    second = make_list(committed_client, board_id, "Second")
    first_cards = make_cards(committed_client, first, THREADS // 2)
    second_cards = make_cards(committed_client, second, THREADS // 2)

    # Half the cards cross to the other list, half move to the top of their own.
    moves = [(card, {"list_id": second, "position": 0}) for card in first_cards[::2]]
    moves += [(card, {"list_id": first, "position": 0}) for card in second_cards[::2]]
    moves += [(card, {"position": 0}) for card in first_cards[1::2]]
    moves += [(card, {"position": 0}) for card in second_cards[1::2]]
    responses = run_together(
        committed_client,
        [
            lambda c, card=card, body=body: c.patch(f"/cards/{card}", json=body)
            for card, body in moves
        ],
    )

    assert [response.status_code for response in responses] == [200] * len(moves)
    first_positions = positions(committed_client, f"/lists/{first}/cards")
    second_positions = positions(committed_client, f"/lists/{second}/cards")
    assert first_positions == list(range(len(first_positions)))
    assert second_positions == list(range(len(second_positions)))
    assert len(first_positions) + len(second_positions) == THREADS // 2 * 2


def test_parallel_deletes_and_moves_keep_the_list_dense(
    committed_client: TestClient,
) -> None:
    list_id = make_list(committed_client, make_board(committed_client), "To do")
    cards = make_cards(committed_client, list_id, THREADS)
    half = THREADS // 2

    responses = run_together(
        committed_client,
        [lambda c, card=card: c.delete(f"/cards/{card}") for card in cards[:half]]
        + [
            lambda c, card=card: c.patch(f"/cards/{card}", json={"position": 0})
            for card in cards[half:]
        ],
    )

    assert [response.status_code for response in responses] == [204] * half + [
        200
    ] * half
    assert positions(committed_client, f"/lists/{list_id}/cards") == list(range(half))
