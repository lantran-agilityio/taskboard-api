# Taskboard API

[![CI](https://github.com/lantran-agilityio/taskboard-api/actions/workflows/ci.yml/badge.svg)](https://github.com/lantran-agilityio/taskboard-api/actions/workflows/ci.yml)

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

## Card details

Cards can have a due date, labels and assignees:

- **`due_at`:** a date and time with a timezone, such as `2026-11-20T17:00:00+07:00`. The API answers in UTC (`2026-11-20T10:00:00Z`). A time without a timezone is rejected with 422.
- **`due_complete`:** `true` once the card is done.
- **`label_ids`:** labels from the card's board. A board's labels are managed at `/boards/{board_id}/labels` and `/labels/{label_id}`. Each label has a `name` and a `color` (`green`, `yellow`, `orange`, `red`, `purple` or `blue`).
- **`assignee_ids`:** user ids of the board's owner or members. Removing someone from a board also unassigns them from its cards.

Set them when creating a card, or change them with `PATCH /cards/{card_id}`:
- `label_ids` and `assignee_ids` replace the whole set, and `[]` clears it.
- `"due_at": null` removes the due date.
- A field you leave out stays as it is.

Viewers can read labels. Editors and owners can create, change and delete them.

Search a board's cards with `GET /boards/{board_id}/cards`:
- The results come in board order (list position, then card position).
- Filters are optional and combine: `label_id`, `assignee_id` and `due_before` (a datetime with a timezone; cards without a due date don't match).

```sh
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8000/boards/1/cards?assignee_id=2&due_before=2026-11-21T00:00:00Z"
```

## Archive

Archive a list or card to take it off the board without losing it, and restore it later:
- `POST /lists/{list_id}/archive`, `POST /lists/{list_id}/restore`
- `POST /cards/{card_id}/archive`, `POST /cards/{card_id}/restore`

An archived item keeps everything: its name, its cards (for a list), and its labels, assignees and due date (for a card).
- **While archived:** its `archived_at` is set and its `position` is `null`, and the other items close the gap.
- **On restore:** it goes back to the end of its board or list.
- **Errors:** archiving something already archived, or restoring something that isn't, is a 422.

While a list is archived, its cards are frozen with it:
- They can be read and deleted.
- They can't be created, changed, moved in or out, archived or restored. Each of those is a 422 until the list is restored.
- A card that is archived itself can't be changed either. Restore it first.

`GET /boards/{board_id}/lists`, `GET /lists/{list_id}/cards` and `GET /boards/{board_id}/cards` show active items by default.
- Add `?archived=true` to get the archived ones instead, newest first.
- Board search leaves out the cards of archived lists either way.

`DELETE` still removes a list or card for good, whether it's archived or not.

Viewers can see archived items; editors and owners can archive and restore.

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
| `list.archived`, `list.restored` | `list`, `list_ids` (an archived list is gone from `list_ids`, like a deleted one) |
| `card.created`, `card.updated` | `card`, `lists: [{list_id, card_ids}]` (each affected list in its new order; both lists for a move between lists) |
| `card.deleted` | `card_id`, `lists` |
| `card.archived`, `card.restored` | `card`, `lists` |
| `label.created`, `label.updated` | `label` |
| `label.deleted` | `label_id` (drop it from every card's `label_ids`) |
| `member.added`, `member.updated` | `member` |
| `member.removed` | `user_id` (drop them from every card's `assignee_ids`; that user's sockets on the board then close with 4404) |

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

GitHub Actions runs the same checks on every pull request and every push to `main` (`.github/workflows/ci.yml`): `ruff check` and `ruff format --check` in one job, and `pytest` against a PostgreSQL 17 service container in another.

## Roadmap

1. Boards: create, list, get, rename, delete
2. Lists inside a board, with an order
3. Cards inside a list, with an order; move cards between lists
4. Users and JWT authentication; boards belong to users
5. Board members and permissions
6. Alembic migrations, PostgreSQL; protect positions against concurrent requests (row locks, unique `(board_id, position)`)
7. Realtime board updates over WebSocket
8. CI on GitHub Actions: lint and tests on every PR, against PostgreSQL
9. Card details: due dates, labels and assignees; filter cards by them
10. Archive and restore lists and cards instead of deleting them
11. Comments on cards and a board activity log, with pagination
