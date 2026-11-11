# Taskboard API

[![CI](https://github.com/lantran-agilityio/taskboard-api/actions/workflows/ci.yml/badge.svg)](https://github.com/lantran-agilityio/taskboard-api/actions/workflows/ci.yml)

A practice project for reverse engineering a product with AI, on top of a working Trello-style task board API (FastAPI, SQLAlchemy, PostgreSQL).

## Purpose

Learn how to work with AI to reverse engineer an existing product (Trello) into a UI and a build plan: observe its public behaviour, write requirements in our own words, design a clickable prototype from those requirements alone, and plan the build. The API in this repo (roadmap steps 1–11) is the backend the plan builds on and the answer key it is checked against. The workflow and its clean-room rules are in [`docs/`](docs/README.md).

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

## Boards

A board has a `name` and an optional `description` (up to 2000 characters). Set them when creating it, or change them with `PATCH /boards/{board_id}`:
- `"description": null` clears it, and leaving a field out keeps it.
- Editors and owners can change the description. Only the owner can rename the board.

Anyone on a board can star it for themselves, viewers included:
- `PUT /boards/{board_id}/star` stars it and `DELETE /boards/{board_id}/star` unstars it. Both answer 204 and are safe to repeat.
- `GET /boards` and `GET /boards/{board_id}` show `"starred": true` or `false` for the user asking. Stars are private: nobody else sees yours, and starring isn't logged or sent over the WebSocket.
- Leaving a board (or being removed from it) drops your star.

The owner can close a board to put it away, and reopen it later:
- `POST /boards/{board_id}/close` and `POST /boards/{board_id}/reopen` return the board, with `closed_at` set while it's closed. Closing a closed board, or reopening an open one, is a 422.
- A closed board is read-only for everyone. Everything on it can still be read, but every change (to the board, its lists, cards, labels, comments or members) is a 422 until it's reopened. Members can still leave it, star it and watch it over the WebSocket.
- `GET /boards` lists open boards only. Add `?closed=true` to get the closed ones instead, most recently closed first.

Every board in a response also says `role` (yours: `owner`, `editor` or `viewer`), `list_count` and `card_count` (active lists, and active cards in active lists), so the home screen can draw its tiles from one request. Like `starred`, these aren't in the WebSocket's `board.*` events.
- `DELETE /boards/{board_id}` works whether the board is open or closed.

## Card details

Cards can have a due date, labels and assignees:

- **`due_at`:** a date and time with a timezone, such as `2026-11-20T17:00:00+07:00`. The API answers in UTC (`2026-11-20T10:00:00Z`). A time without a timezone is rejected with 422.
- **`due_complete`:** `true` once the card is done.
- **`label_ids`:** labels from the card's board. A board's labels are managed at `/boards/{board_id}/labels` and `/labels/{label_id}`. Each label has a `color` (`green`, `yellow`, `orange`, `red`, `purple` or `blue`) and a `name`, which may be empty (leave it out, or send `""`). Every new board starts with six unnamed labels, one per colour, so cards can be tagged straight away.
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

## Sort a list

`POST /lists/{list_id}/sort` with `{"by": "created_desc"}` (newest first), `"created_asc"` (oldest first) or `"title"` (A to Z, ignoring case) reorders the list's cards once and returns them in their new order. Cards added afterwards still go at the end. Ties keep creation order, archived cards aren't touched, and an archived list is a 422. Editors and owners can sort.

## Archive

Archive a list or card to take it off the board without losing it, and restore it later:
- `POST /lists/{list_id}/archive`, `POST /lists/{list_id}/restore`
- `POST /cards/{card_id}/archive`, `POST /cards/{card_id}/restore`

An archived item keeps everything: its name, its cards (for a list), and its labels, assignees and due date (for a card).
- **While archived:** its `archived_at` is set and its `position` is `null`, and the other items close the gap.
- **On restore:** it goes back to the position it had when it was archived, among whatever is there now. If the board or list has fewer items than that, it goes at the end.
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

## Comments and activity

Comments belong to a card:
- `POST /cards/{card_id}/comments` with `{"body": "..."}` (1–5000 characters), and `GET /cards/{card_id}/comments`, newest first.
- `PATCH /comments/{comment_id}` changes the body and sets `edited_at`. Only the comment's author can do it.
- `DELETE /comments/{comment_id}` can be done by the author or the board's owner.
- Viewers read comments. Editors and owners write them.
- On an archived card, or a card in an archived list, comments can be read and deleted but not written or edited (422).
- Deleting a card deletes its comments. A member who leaves the board keeps their comments.

`GET /boards/{board_id}/activity` is the board's log, newest first. Each entry is an event from the table below (`id`, `type`, `actor_id`, `data`, `created_at`), so the log and the WebSocket always agree. Anyone on the board can read it.

Both lists are paginated with a cursor:
- `?limit=` sets the page size (1–100, default 20).
- Each page is `{"items": [...], "next_before": 42}`. Pass `?before=42` for the next, older page.
- On the last page, `next_before` is `null`.
- Entries added while you page through don't shift later pages, so nothing is shown twice.

## Realtime

Anyone who can view a board can watch it over a WebSocket and get an event for every change, as soon as it's committed.

1. Connect to `ws://127.0.0.1:8000/boards/{board_id}/ws`.
2. Within 5 seconds, send `{"type": "auth", "token": "<access token>"}` (the token from `POST /auth/token`; it never goes in the URL).
3. The server answers `{"type": "ready"}`, then sends events. Send `{"type": "ping"}` any time to get `{"type": "pong"}`.

Events look like `{"type": "card.updated", "board_id": 1, "actor_id": 2, "data": {...}}`, where `actor_id` is the user who made the change:

| type | data |
|---|---|
| `board.updated` | `board` (without `starred`, which is per user) |
| `board.closed`, `board.reopened` | `board` (the socket stays open) |
| `board.deleted` | `{}` (then the socket closes with 4404) |
| `list.created`, `list.updated` | `list`, `list_ids` (the board's lists in their new order) |
| `list.deleted` | `list_id`, `name`, `list_ids` |
| `list.archived`, `list.restored` | `list`, `list_ids` (an archived list is gone from `list_ids`, like a deleted one) |
| `list.sorted` | `list`, `by`, `lists: [{list_id, card_ids}]` (the cards' new order) |
| `card.created`, `card.updated` | `card`, `lists: [{list_id, card_ids}]` (each affected list in its new order; both lists for a move between lists) |
| `card.deleted` | `card_id`, `title`, `lists` |
| `card.archived`, `card.restored` | `card`, `lists` |
| `label.created`, `label.updated` | `label` |
| `label.deleted` | `label_id`, `name` (drop it from every card's `label_ids`) |
| `member.added`, `member.updated` | `member` |
| `member.removed` | `user_id` (drop them from every card's `assignee_ids`; that user's sockets on the board then close with 4404) |
| `comment.created`, `comment.updated` | `comment` |
| `comment.deleted` | `comment_id`, `card_id` |

The server may also send `{"type": "resync"}`: it may have missed changes (for example after a database restart), so refetch the board. The socket stays open.

Close codes: `4401` for a missing, late or invalid auth message; `4404` if the board doesn't exist or you aren't (or are no longer) on it.

```js
const ws = new WebSocket(`ws://127.0.0.1:8000/boards/${boardId}/ws`);
ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
ws.onmessage = (message) => console.log(JSON.parse(message.data));
ws.onclose = (event) => console.log("closed", event.code);
```

## Frontend

The web app lives in [`frontend/`](frontend/) (Vite, React, TypeScript). It needs Node.js (the version in `frontend/.nvmrc`, for example `brew install node@22`). With the API running:

```sh
cd frontend
npm ci
npm run dev        # http://localhost:5173, forwards /api to the API on port 8000
```

So far it has sign-in and register screens and the home screen: your boards with their list and card counts, starred and recently opened boards, creating a board, and closed boards with reopen and delete. The board and card pages come in roadmap steps 24–28. "Remember me" keeps the sign-in token in the browser's local storage; without it, closing or reloading the tab signs out. Tokens last 30 minutes either way.

## Test

```sh
uv run pytest      # runs against the taskboard_test database
uv run ruff check .
cd frontend && npm test && npm run lint && npm run typecheck
```

GitHub Actions runs the same checks on every pull request and every push to `main` (`.github/workflows/ci.yml`): `ruff check` and `ruff format --check` in one job, `pytest` against a PostgreSQL 17 service container in another, and the frontend's lint, type check, tests and build in a third.

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
12. Observe Trello's public behaviour, one area at a time ([`docs/observations/`](docs/observations/))
13. Requirements with IDs and acceptance criteria ([`docs/requirements.md`](docs/requirements.md))
14. Clickable UI prototype built from the requirements only ([`prototype/`](prototype/))
15. Build plan: requirements mapped to the API, gaps, frontend build order ([`docs/build-plan.md`](docs/build-plan.md))
16. Labels: six default labels on a new board, optional label names
17. Board details: description and a per-user star
18. Close and reopen boards (closed boards are read-only)
19. Restore lists and cards to their original position; sort a list once
20. Card and activity reads for the UI: comment counts, one comment, activity filters, board snapshot
21. Checklists on cards
22. Frontend shell and sign-in (Vite, React, TypeScript in [`frontend/`](frontend/))
23. Frontend home: board tiles, starred, recently opened, create, closed boards
24. Frontend: the rest of [`docs/build-plan.md`](docs/build-plan.md#frontend-build-order), steps 24–28
