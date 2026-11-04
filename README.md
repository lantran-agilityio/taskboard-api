# Taskboard API

A Trello-style task board API built with FastAPI, SQLAlchemy and PostgreSQL: boards, lists and cards.

## Run

Needs PostgreSQL running locally (for example `brew install postgresql@17`).

```sh
brew services start postgresql@17
createdb taskboard
createdb taskboard_test             # used by the tests
uv sync
cp .env.example .env                # then set SECRET_KEY
uv run alembic upgrade head         # create or update the tables
uv run uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs to try the API: register with `POST /auth/register`, then click **Authorize** and log in with your email and password.

## Test

```sh
uv run pytest      # runs against the taskboard_test database
uv run ruff check .
```

## Roadmap

1. Boards: create, list, get, rename, delete
2. Lists inside a board, with an order
3. Cards inside a list, with an order; move cards between lists
4. Users and JWT authentication; boards belong to users
5. Board members and permissions
6. Alembic migrations, PostgreSQL; protect positions against concurrent requests (row locks, unique `(board_id, position)`)
7. Realtime board updates over WebSocket
