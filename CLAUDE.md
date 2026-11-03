# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A Trello-style task board API (`taskboard-api`), built to practice FastAPI and to learn working with Claude Code. Backend only: verify behaviour through tests and the Swagger UI at `/docs`, not a frontend.

Domain: a **board** has ordered **lists**; a list has ordered **cards**. Cards can move between lists of the same board, and their order must stay consistent after every move.

- `app/main.py` — the FastAPI app; registers routers and creates tables on startup (`lifespan`). Alembic replaces `create_all` later.
- `app/core/config.py` — `Settings` (pydantic-settings, reads `.env`); `DATABASE_URL` defaults to SQLite at `./taskboard.db`.
- `app/core/database.py` — engine, `SessionLocal`, the declarative `Base`, and the `get_db()` dependency.
- `app/models/` — SQLAlchemy models, one file per model: `Board` (`board.py`), `BoardList` (`board_list.py`, table `lists`; not named `List` to avoid confusion with Python's `list`) and `Card` (`card.py`). `Board.lists` and `BoardList.cards` are ordered by position and cascade deletes, so deleting a board deletes its lists and their cards (the foreign keys also have `ondelete="CASCADE"` for databases that enforce it). `app/models/__init__.py` imports every model so relationships can find each other by name; add new models there.
- `app/schemas/` — Pydantic request/response schemas, one file per model. `common.py` holds `Name` (trimmed, 1–100 characters), shared by boards, lists and card titles. In `CardUpdate`, `description: null` clears the description, and leaving it out keeps it (checked with `model_fields_set`).
- `app/services/ordering.py` — `move_item()`, `transfer_item()` (moves an item from one sequence into another, such as a card between lists) and `renumber()`: keep `position` values of a board's lists and a list's cards at 0..n-1. Plain Python, no FastAPI or database code.
- `app/api/routes/` — one file per resource; register its routers in `app/main.py`. `boards.py` has `get_board_or_404()`, reused by `lists.py`. `lists.py` has two routers: `board_lists_router` (`POST`/`GET /boards/{board_id}/lists`) and `router` (`GET`/`PATCH`/`DELETE /lists/{list_id}`; `PATCH` renames and/or moves). `cards.py` follows the same pattern: `list_cards_router` (`/lists/{list_id}/cards`) and `router` (`/cards/{card_id}`); its `PATCH` can also move a card to another list on the same board (`list_id`, which defaults to the end of the target list).
- `app/api/errors.py` — `body_validation_error()`: builds the `RequestValidationError` for a rejected body field (for example a bad `position` or `list_id`).
- `tests/` — pytest suite. `conftest.py` gives every test a fresh in-memory SQLite database (`db` fixture) and a `TestClient` with `get_db` overridden (`client` fixture).

## Commands

```sh
uv sync                                 # install dependencies
uv run pytest                           # run tests
uv run ruff check . && uv run ruff format .   # lint and format
uv run uvicorn app.main:app --reload    # run at http://127.0.0.1:8000/docs
```

## Conventions

- Python 3.13. Annotate every function's parameters and return type.
- SQLAlchemy 2.0 style: `Mapped[...]` / `mapped_column()` in models, `select()` in queries; no legacy `session.query()`.
- Routes stay thin: validate with Pydantic schemas, return response schemas, never raw models. Put logic that more than one route needs (such as reordering cards) in `app/services/`.
- Positions within a parent are always 0..n-1 with no gaps: new items go to the end, and every move or delete goes through `app/services/ordering.py`. Validate a move before changing anything else, so a rejected request changes nothing. Report a rejected move as `RequestValidationError`, so its 422 has the same `detail` list shape as FastAPI's own.
- Return `404` for a missing resource and `422` for invalid input (FastAPI's default); don't invent other codes without asking.
- Every new endpoint gets tests in `tests/test_<resource>.py` through the `client` fixture, covering the success case and at least one error case. Write the tests first when the behaviour is clear.
- Run `uv run pytest` and `uv run ruff check .` before reporting a change as done.
- The owner is learning Python: when adding code that uses a new Python or FastAPI idea, explain the idea briefly in the reply. Code comments say why the code is the way it is (for example, why imports that look unused are needed), not teach the idea.
