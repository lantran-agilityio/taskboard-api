# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A Trello-style task board API (`taskboard-api`), built to practice FastAPI and to learn working with Claude Code. Backend only: verify behaviour through tests and the Swagger UI at `/docs`, not a frontend.

Domain: a **user** owns **boards**; a board has ordered **lists**; a list has ordered **cards**. Cards can move between lists of the same board, and their order must stay consistent after every move. Users register and log in for a JWT; every board, list and card endpoint needs it. The board's creator is its owner and can share it with other users as **editor** or **viewer**:

| Action | Viewer | Editor | Owner |
|---|---|---|---|
| Read the board, lists, cards, members | ✓ | ✓ | ✓ |
| Create/rename/move/delete lists and cards | 403 | ✓ | ✓ |
| Rename/delete the board, add members, change roles, remove others | 403 | 403 | ✓ |
| Leave the board (remove yourself) | ✓ | ✓ | 422 |

Users who aren't on a board get 404 for it and everything in it.

- `app/main.py` — the FastAPI app; registers routers, and its `lifespan` starts and stops the realtime listener. It doesn't create tables: Alembic migrations own the schema.
- `app/core/config.py` — `Settings` (pydantic-settings, reads `.env`); `DATABASE_URL` defaults to local PostgreSQL database `taskboard`, `TEST_DATABASE_URL` to `taskboard_test` (psycopg 3, `postgresql+psycopg://`). `SECRET_KEY` (signs JWTs) has no default, so the app won't start without it: copy `.env.example` to `.env`.
- `app/core/security.py` — password hashing (pwdlib, Argon2) and JWT create/decode (PyJWT, HS256, `sub` = user id). Plain functions, no FastAPI.
- `app/core/database.py` — `make_engine()` (with `pool_pre_ping`, so pooled connections killed by a database restart are replaced instead of failing a request; the tests' `engine` fixture uses it too), engine, `SessionLocal`, the declarative `Base` (with a constraint naming convention, so migrations can refer to constraints by name, and `datetime` mapped to `timestamptz`), and the `get_db()` dependency.
- `alembic/` — migrations. `env.py` takes the URL from the Alembic config if set (the tests do) or else `settings.database_url`, and imports `app.models` so every table is known. New revisions are formatted by ruff (hooks in `alembic.ini`).
- `app/models/` — SQLAlchemy models, one file per model: `User` (`user.py`, unique lowercased `email`), `Board` (`board.py`, `owner_id` → users), `BoardMember` (`board_member.py`, composite key `(board_id, user_id)`, `role` is a `BoardRole`; the owner is never a member row, only `Board.owner_id`), `BoardList` (`board_list.py`, table `lists`; not named `List` to avoid confusion with Python's `list`) and `Card` (`card.py`). `Board.lists` and `BoardList.cards` are ordered by position and cascade deletes, so deleting a board deletes its lists and their cards (and `User.boards` cascades the same way) (the foreign keys also have `ondelete="CASCADE"` for databases that enforce it). `app/models/__init__.py` imports every model so relationships can find each other by name; add new models there. `lists` has `UNIQUE (board_id, position)` and `cards` has `UNIQUE (list_id, position)`, both `DEFERRABLE INITIALLY DEFERRED`: checked at commit, so renumbering may pass through duplicates mid-move.
- `app/schemas/` — Pydantic request/response schemas, one file per model. `common.py` holds `Name` (trimmed, 1–100 characters), shared by boards, lists and card titles. In `CardUpdate`, `description: null` clears the description, and leaving it out keeps it (checked with `model_fields_set`).
- `app/services/permissions.py` — `board_role(board, user_id)` (owner, member role or `None`) and `allows(role, minimum)` (viewer < editor < owner). The only place that decides who may do what.
- `app/services/ordering.py` — `move_item()`, `transfer_item()` (moves an item from one sequence into another, such as a card between lists) and `renumber()`: keep `position` values of a board's lists and a list's cards at 0..n-1. Plain Python, no FastAPI or database code.
- `app/api/access.py` — dependency factories `board_access(min_role)`, `list_access()`, `card_access()` that load the item and check the role on its board (404 if none, 403 if too low), plus the aliases `ViewableBoard`, `EditableBoard`, `OwnedBoard`, `ViewableList`, `EditableList`, `ViewableCard`, `EditableCard`. Write access (editor or owner) also locks the board row (`SELECT … FOR UPDATE`) before loading the list or card, so concurrent reorders of one board take turns; one lock per request, so no deadlocks.
- `app/api/deps.py` — `get_current_user()` (reads the bearer token via `OAuth2PasswordBearer`, 401 if missing, invalid, expired or the user is gone) and the `CurrentUser` alias.
- `app/api/routes/` — one file per resource; register its routers in `app/main.py`. `auth.py`: `POST /auth/register`, `POST /auth/token` (OAuth2 password form; `username` holds the email) and `GET /users/me`. `members.py`: `GET`/`POST /boards/{board_id}/members` and `PATCH`/`DELETE /boards/{board_id}/members/{user_id}` (the owner is listed first with role `owner`, but can't be changed or removed). `lists.py` has two routers: `board_lists_router` (`POST`/`GET /boards/{board_id}/lists`) and `router` (`GET`/`PATCH`/`DELETE /lists/{list_id}`; `PATCH` renames and/or moves). `cards.py` follows the same pattern: `list_cards_router` (`/lists/{list_id}/cards`) and `router` (`/cards/{card_id}`); its `PATCH` can also move a card to another list on the same board (`list_id`, which defaults to the end of the target list).
- `app/realtime/` — board events over WebSocket. `events.py`: `EventType`, `publish(db, board_id, type, data)` (a Postgres `NOTIFY` on channel `board_events`, delivered only if the transaction commits), and `list_order()` / `card_order()` for the new orders events carry. `hub.py`: `BoardHub` (`hub`), this process's sockets per board; `dispatch()` sends an event to them and closes sockets that lost access (4404 after `member.removed` for that user, after `board.deleted` for everyone). `listener.py`: `Listener`, one `LISTEN` connection per process that forwards notifications to the hub. If that connection breaks (a database restart), it reconnects with `backoff_delays()` (0.5s doubling to 30s, forever) and then sends `{"type": "resync"}` to every socket through `hub.broadcast()`, because NOTIFYs sent while it was disconnected are lost. TCP keepalives catch connections that die silently. `backend_pid` is the current connection's server process; `app.state.listener` holds the listener for tests (the lifespan stops its own local one, because concurrent test clients overwrite `app.state`).
- `app/api/routes/realtime.py` — `WS /boards/{board_id}/ws`: the client's first message must be `{"type": "auth", "token": ...}` within `settings.ws_auth_timeout_seconds`; then `ready`, events, and `ping`/`pong`. It checks access with `board_role()` in a threadpool (the session is sync) and closes the session right away, so open sockets don't hold DB connections. It can't use the HTTP access aliases.
- `app/api/errors.py` — `validation_error()` and `body_validation_error()`: build the `RequestValidationError` for a rejected body or path field (for example a bad `position` or `list_id`).
- `tests/` — pytest suite on PostgreSQL (`taskboard_test`, which must exist). `conftest.py` sets a test `SECRET_KEY`, rebuilds the schema from the migrations once per run (`engine` fixture), and wraps each test in a transaction that is rolled back (`db` fixture; routes' commits become savepoints, and teardown runs `SET CONSTRAINTS ALL IMMEDIATE` so every test also checks it left no duplicate positions). `TestClient`s have `get_db` overridden: `client` is logged in as alice@example.com, `anon_client` has no token, and `other_headers` is the `Authorization` header of a second user (bob) for cross-user tests. `test_migrations.py` fails if the models and migrations disagree; `committed_client` (in `conftest.py`) makes requests commit for real, with the tables truncated afterwards: `test_concurrency.py` uses it for parallel requests and `test_realtime.py` for WebSocket events (NOTIFY is only delivered on commit). `conftest.py` also points `settings.database_url` at the test database, because every `TestClient` starts the lifespan listener. WebSocket tests carry `pytest.mark.timeout(10)` so a missing event fails instead of hanging. `test_hub.py` unit-tests `BoardHub` with fake sockets, and `test_listener.py` tests reconnect and backoff with a fake connection. `test_realtime.py` fakes a database restart with `pg_terminate_backend(app.state.listener.backend_pid)`. `test_database.py` kills pooled connections the same way and checks requests still succeed.

## Commands

```sh
uv sync                                 # install dependencies
uv run pytest                           # run tests
uv run ruff check . && uv run ruff format .   # lint and format
uv run alembic upgrade head             # apply migrations to DATABASE_URL
uv run alembic revision --autogenerate -m "..."   # new migration after a model change; review it by hand
uv run uvicorn app.main:app --reload    # run at http://127.0.0.1:8000/docs
```

## Conventions

- Python 3.13. Annotate every function's parameters and return type.
- SQLAlchemy 2.0 style: `Mapped[...]` / `mapped_column()` in models, `select()` in queries; no legacy `session.query()`.
- Routes stay thin: validate with Pydantic schemas, return response schemas, never raw models. Put logic that more than one route needs (such as reordering cards) in `app/services/`.
- Every model change needs a migration (`alembic revision --autogenerate`), read and fixed by hand before committing: autogenerate misses things such as dropping Postgres enum types in `downgrade()`. `tests/test_migrations.py` fails until it exists.
- Positions within a parent are always 0..n-1 with no gaps: new items go to the end, and every move or delete goes through `app/services/ordering.py`. Validate a move before changing anything else, so a rejected request changes nothing. Routes that change positions must use an `Editable…`/`OwnedBoard` alias, so they hold the board lock.
- Every route that changes a board, its lists, cards or members calls `publish()` after `db.flush()` (so new rows have ids) and before `db.commit()`, never after the commit; its tests in `tests/test_realtime.py` check the event. Report a rejected move as `RequestValidationError`, so its 422 has the same `detail` list shape as FastAPI's own.
- Return `404` for a missing resource and `422` for invalid input (FastAPI's default). Agreed extras: `401` for a missing/bad token or wrong login, `403` for a board member whose role is too low, `409` for a taken email or a user who is already on the board. Don't invent other codes without asking. WebSocket close codes are 4000 + the matching HTTP code: `4401` (auth), `4404` (board missing, not on it, or access lost).
- Every board, list, card and member route takes an alias from `app/api/access.py` with the lowest role it needs (`Viewable…` for reads, `Editable…` for list/card changes, `OwnedBoard` for the board itself and members). Non-members get `404`, so a board's existence stays hidden; members with too low a role get `403`. New endpoints get a cross-user test with `other_headers` and a row in the role table in `tests/test_members.py`.
- Every new endpoint gets tests in `tests/test_<resource>.py` through the `client` fixture, covering the success case and at least one error case. Write the tests first when the behaviour is clear.
- Run `uv run pytest` and `uv run ruff check .` before reporting a change as done.
- The owner is learning Python: when adding code that uses a new Python or FastAPI idea, explain the idea briefly in the reply. Code comments say why the code is the way it is (for example, why imports that look unused are needed), not teach the idea.
