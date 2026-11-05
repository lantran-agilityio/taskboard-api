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

## Realtime

Anyone who can view a board can watch it over a WebSocket and get an event for every change, as soon as it's committed.

1. Connect to `ws://127.0.0.1:8000/boards/{board_id}/ws`.
2. Within 5 seconds, send `{"type": "auth", "token": "<access token>"}` (the token from `POST /auth/token`; it never goes in the URL).
3. The server answers `{"type": "ready"}`, then sends events. Send `{"type": "ping"}` any time to get `{"type": "pong"}`.

Events look like `{"type": "card.updated", "board_id": 1, "data": {...}}`:

| type | data |
|---|---|
| `board.updated` | `board` |
| `board.deleted` | `{}` (then the socket closes with 4404) |
| `list.created`, `list.updated` | `list`, `list_ids` (the board's lists in their new order) |
| `list.deleted` | `list_id`, `list_ids` |
| `card.created`, `card.updated` | `card`, `lists: [{list_id, card_ids}]` (each affected list in its new order; both lists for a move between lists) |
| `card.deleted` | `card_id`, `lists` |
| `member.added`, `member.updated` | `member` |
| `member.removed` | `user_id` (that user's sockets on the board then close with 4404) |

The server may also send `{"type": "resync"}`: it may have missed changes (for example after a database restart), so refetch the board. The socket stays open.

Close codes: `4401` for a missing, late or invalid auth message; `4404` if the board doesn't exist or you aren't (or are no longer) on it.

```js
const ws = new WebSocket(`ws://127.0.0.1:8000/boards/${boardId}/ws`);
ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
ws.onmessage = (message) => console.log(JSON.parse(message.data));
ws.onclose = (event) => console.log("closed", event.code);
```

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
