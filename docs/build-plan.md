# Build plan

Written in roadmap step 15 from [`requirements.md`](requirements.md), the [prototype](../prototype/index.html) and the existing API (checked against the code on 2026-11-09; see also the [API spec](https://claude.ai/artifact/SZ1Snfsx54LWBUL2beC14Y)).

Of the 52 requirements, the API fully covers 28 today and partly covers 11 (some of those need only a rule in the UI). 10 aren't covered at all, and 3 are out of scope or optional. The gaps are grouped into six new API roadmap steps (16–21). The frontend comes after that, as steps 22–28, in an order that only starts a screen once the API it needs exists.

## Decisions

These settle the six design questions from `requirements.md` and the choices the prototype made on its own. Each one says what the API, the frontend and the prototype do. Anything marked *prototype update* is a small follow-up so the prototype stays a true picture of the plan.

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | Where do restored lists and cards go? | Back to their **original position** (clamped to the end if the list is now shorter). The API remembers the position at archive time. | It's what the product does (R-LIST-07, confirmed), and it's what a user expects from "undo archive". |
| D2 | Delete directly, or only after archiving/closing? | **The frontend** offers delete only for archived lists and cards and closed boards. **The API** keeps direct delete. | It's a UI safety rail. The API stays simple for scripts and tests, and its role checks still apply. |
| D3 | Does deleting a card erase its history? | **No.** The board log keeps its "deleted" entry with the card's title. *Prototype update:* stop erasing entries. | A log that loses entries can't explain what happened. The API already works this way. |
| D4 | Empty rename | **The frontend** puts the old name back without calling the API. **The API** keeps its 422 for an empty name. | Both behaviours stay correct, and the user never sees an error for clearing a field. |
| D5 | Roles | **Keep the API's model:** the product's "admin" is the API's **owner** (exactly one), "member" is **editor**, and **viewer** is the read-only role. Several admins (R-MEMBER-05, unconfirmed) is out of scope. Invites are by **email** of a registered user. *Prototype update:* rename the roles; drop the admin choice when inviting; invite by email only. | One owner keeps the permission rules (`app/services/permissions.py`) and every role test as they are. |
| D6 | Labels | **Name becomes optional** (empty allowed). **Colour stays required, from the API's 6.** A new board gets **six unnamed labels**, one per colour. *Prototype update:* drop teal, grey and "no colour". | The defaults are confirmed (R-LABEL-01) and need optional names. A colourless label and 30 shades are polish; they'd cost a Postgres enum migration for little. |
| D7 | Closed boards | **Add a closed state:** `closed_at` on boards. The owner closes and reopens. A closed board is read-only for everyone (writes return 422, like a frozen card). `GET /boards` leaves closed boards out unless `?closed=true`. | Confirmed (R-BOARD-06/07). 422 matches the existing "frozen" rule, and CLAUDE.md asks for no new status codes. |
| D8 | "Done" | **Done is `due_complete`.** The frontend calls it done and lets it be set with no due date. | One flag, as observed (R-CARD-05). Step 20 adds a test that `due_complete` works without `due_at`. |
| D9 | Card numbers in addresses | **Use the card's `id`** in the frontend's address (`#card-<id>`). There is no per-board number. *Prototype update:* show `#<id>`. | The number is cosmetic. A per-board counter would need a column, a sequence per board and a migration. |
| D10 | Comments on archived cards | **Not allowed** (the API's 422 stays). | It matches the frozen-card rule. The product's behaviour here is unconfirmed. |
| D11 | Start dates, checklist item assignees and dates | **Start dates are deferred.** Item assignees and due dates are an optional last part of step 21. | Both are unconfirmed (R-DATE-03, R-CHECK-05). |
| D12 | Frontend stack | **Proposed:** a separate `frontend/` app (Vite, React, TypeScript) that talks to the API over HTTP and the WebSocket, with its own CI job. **Needs your go-ahead** before step 22, since the repo is backend only today. | It's a common, well-documented stack, and it keeps the API and the UI testable on their own. |

## Coverage

**Covered** means the API does it today: ✓ yes, ◐ partly, ✗ no, — out of scope. "Client" means the frontend can do it with no API change.

| Requirement | Existing endpoint(s) | Covered | Gap | Step |
| --- | --- | --- | --- | --- |
| R-BOARD-01 See my boards | `GET /boards` | ◐ | "Recently opened" is client-side (local storage). The tiles' list and card counts need a board snapshot. | client, 20 |
| R-BOARD-02 Create a board | `POST /boards` | ◐ | Seed the six default labels (D6) | 16 |
| R-BOARD-03 Rename in place | `PATCH /boards/{id}` (owner) | ✓ | An empty name is handled in the UI (D4) | — |
| R-BOARD-04 Star a board | — | ✗ | A per-user star | 17 |
| R-BOARD-05 Board description | — | ✗ | `description` on boards | 17 |
| R-BOARD-06 Close a board | — | ✗ | The closed state (D7) | 18 |
| R-BOARD-07 See and reopen closed boards | — | ✗ | `?closed=true`, reopen | 18 |
| R-BOARD-08 Delete a closed board | `DELETE /boards/{id}` | ◐ | The UI offers it only when closed (D2) | 18 |
| R-MEMBER-01 Creator is admin | `POST /boards` makes the caller owner | ✓ | Admin = owner (D5) | — |
| R-MEMBER-02 Invite a member | `POST /boards/{id}/members` (email, role) | ◐ | Email only; inviting by name is out of scope (D5) | — |
| R-MEMBER-03 See board members | `GET /boards/{id}/members` | ✓ | | — |
| R-MEMBER-04 At least one admin | The owner can't be changed or removed (422) | ✓ | | — |
| R-MEMBER-05 Several admins | — | — | Out of scope (D5) | — |
| R-MEMBER-06 Leave a board | `DELETE /boards/{id}/members/{me}` | ✓ | | — |
| R-LIST-01 Add lists quickly | `POST /boards/{id}/lists` (goes to the end) | ✓ | | — |
| R-LIST-02 Rename in place | `PATCH /lists/{id}` `name` | ✓ | An empty name is handled in the UI (D4) | — |
| R-LIST-03 Reorder lists | `PATCH /lists/{id}` `position` (0-based) | ✓ | The UI shows positions from 1 | — |
| R-LIST-04 Card count | `GET /lists/{id}/cards` | ✓ | Counted client-side | client |
| R-LIST-05 Sort a list once | — | ✗ | `POST /lists/{id}/sort` | 19 |
| R-LIST-06 Archive a list | `POST /lists/{id}/archive` | ✓ | | — |
| R-LIST-07 Restore to original position | `POST /lists/{id}/restore` | ◐ | It restores at the end today (D1) | 19 |
| R-LIST-08 Delete an archived list | `DELETE /lists/{id}` | ✓ | The UI gates it (D2); its cards are deleted too | — |
| R-CARD-01 Add cards quickly | `POST /lists/{id}/cards` | ✓ | | — |
| R-CARD-02 Card front summary | `GET /lists/{id}/cards` | ◐ | Comment count; checklist progress | 20, 21 |
| R-CARD-03 Own address | `GET /cards/{id}` | ✓ | Uses the card id (D9) | — |
| R-CARD-04 Title and description | `PATCH /cards/{id}` | ✓ | Formatting is Markdown text, rendered client-side (max 2000 characters) | — |
| R-CARD-05 Mark done | `PATCH /cards/{id}` `due_complete` | ✓ | Add a test that it works without a due date (D8) | 20 |
| R-CARD-06 Move by dragging | `PATCH /cards/{id}` `list_id`, `position` | ✓ | | — |
| R-CARD-07 Move with a form | Same | ✓ | | — |
| R-CARD-08 Archive a card | `POST /cards/{id}/archive` | ✓ | | — |
| R-CARD-09 Restore a card | `POST /cards/{id}/restore` | ◐ | Original position (D1) | 19 |
| R-CARD-10 Delete an archived card | `DELETE /cards/{id}` | ✓ | The UI gates it; the history is kept (D2, D3) | — |
| R-CARD-11 Assign members | `PATCH /cards/{id}` `assignee_ids` | ✓ | | — |
| R-LABEL-01 Default labels | — | ✗ | Seed on board create (D6) | 16 |
| R-LABEL-02 Apply labels | `PATCH /cards/{id}` `label_ids` | ✓ | | — |
| R-LABEL-03 Create a label | `POST /boards/{id}/labels` | ◐ | Optional name (D6) | 16 |
| R-LABEL-04 Edit a label | `PATCH /labels/{id}` | ✓ | | — |
| R-LABEL-05 Delete a label | `DELETE /labels/{id}` (removed from cards) | ✓ | | — |
| R-DATE-01 Set a due date | `PATCH /cards/{id}` `due_at` | ✓ | | — |
| R-DATE-02 Due state | `due_at`, `due_complete` | ✓ | Overdue, soon and complete are worked out client-side | client |
| R-DATE-03 Start date | — | — | Deferred (D11) | — |
| R-CHECK-01 Add a checklist | — | ✗ | Checklists | 21 |
| R-CHECK-02 Add and tick items | — | ✗ | Checklists | 21 |
| R-CHECK-03 Hide ticked items | — | ✗ | Client-side once 21 exists | 21 |
| R-CHECK-04 Delete a checklist | — | ✗ | Checklists | 21 |
| R-CHECK-05 Item assignee and due date | — | — | Optional part of 21 (D11) | 21 |
| R-COMMENT-01 Comment on a card | `POST /cards/{id}/comments` | ✓ | The count on the card front comes in 20 | 20 |
| R-COMMENT-02 Edit my comment | `PATCH /comments/{id}` (author), `edited_at` | ✓ | | — |
| R-COMMENT-03 Delete my comment | `DELETE /comments/{id}` | ✓ | | — |
| R-COMMENT-04 Link to a comment | — | ◐ | `GET /comments/{id}`, so a link can open the comment's card | 20 |
| R-ACTIVITY-01 Board activity log | `GET /boards/{id}/activity` | ◐ | A comments-only filter | 20 |
| R-ACTIVITY-02 Card activity log | — | ◐ | A `card_id` filter on the same endpoint | 20 |

Tally: ✓ 28 · ◐ 11 · ✗ 10 · — 3 (R-MEMBER-05 and R-DATE-03 out of scope; R-CHECK-05 optional in step 21).

## API gaps

Six new roadmap steps, each a branch and PR with migrations, `publish()` events, tests (including a cross-user test and a row in the role table in `tests/test_members.py` for new endpoints) and CLAUDE.md updates, as CLAUDE.md already requires. Their order follows what the frontend needs first.

| Step | What | Closes | Main changes |
| --- | --- | --- | --- |
| 16 | **Labels: defaults and optional names** | R-BOARD-02, R-LABEL-01, R-LABEL-03 | `POST /boards` creates six unnamed labels in the same transaction. `LabelCreate.name` may be empty. Tests cover both. No migration (an empty string fits the column). |
| 17 | **Board details: description and star** | R-BOARD-04, R-BOARD-05 | `boards.description` (nullable, ≤ 2000 characters; `null` clears it, like cards). A new `board_stars` table `(user_id, board_id)`. `PUT`/`DELETE /boards/{id}/star` for viewers and up. `BoardRead.starred` for the caller. Starring publishes no event (it's per user). |
| 18 | **Close and reopen boards** | R-BOARD-06, R-BOARD-07, R-BOARD-08 | `boards.closed_at`. `POST /boards/{id}/close` and `/reopen` (owner). Every write access check returns 422 on a closed board. `GET /boards?closed=true`. Events `board.closed`/`board.reopened`. The WebSocket stays open. |
| 19 | **Restore in place, sort once** | R-LIST-07, R-CARD-09, R-LIST-05 | Save `archived_position` when archiving. Restore inserts at `min(archived_position, n)` through `app/services/ordering.py`. `POST /lists/{id}/sort` with `by`: `created_desc`, `created_asc` or `title`. It renumbers in one transaction and publishes one `list.sorted` event with the new card order. |
| 20 | **Card and activity reads for the UI** | R-CARD-02 (comments), R-COMMENT-04, R-ACTIVITY-01/02, R-BOARD-01, R-CARD-05 | `CardRead.comment_count`. `GET /comments/{id}`. Activity `?kind=comments` and `?card_id=` filters (on the event data's card id). `GET /boards/{id}/snapshot`: lists with their active cards in one call. A test that `due_complete` works without a due date. |
| 21 | **Checklists** | R-CHECK-01 to R-CHECK-04, R-CARD-02 (progress); R-CHECK-05 optional | Tables `checklists (card_id, title, position)` and `checklist_items (checklist_id, text, done, position)`, plus `assignee_id`/`due_at` if R-CHECK-05 is in. Nested routes under `/cards/{id}/checklists` and `/checklists/{id}/items`. Frozen-card 422 rules. `CardRead.checklist_done`/`checklist_total`. Events and activity entries. |

## Frontend build order

Each step names the prototype screen it builds, the API it needs, and the realtime events it listens to. Before step 22, the repo needs your go-ahead on D12. The frontend reuses the prototype's layout and behaviour, never the observed product's.

1. **Step 22: shell and sign-in.** Login and register screens (the API has them; the requirements don't cover them), the token in memory with a "remember me" option, an API client that turns 422 `detail` lists into field errors, the address routes `#home`, `#board-<id>` and `#card-<id>`, and the frontend CI job. *Needs:* `/auth/register`, `/auth/token`, `/users/me`.
2. **Step 23: home.** Board tiles, starred, recently opened (local storage), create a board, and closed boards. *Needs:* `GET/POST /boards`, steps 17 and 18.
3. **Step 24: board view, reading.** Lists and card fronts with labels, due badges, assignees and counts. The WebSocket connects and applies events, and handles `resync` by reloading. *Needs:* step 20's snapshot, `GET /boards/{id}/labels`, `GET /boards/{id}/members`, `WS /boards/{id}/ws`.
4. **Step 25: board view, editing.** Add, rename, move and drag lists and cards; mark done; archive. Changes show at once and roll back on 422. Echoed events are skipped by `actor_id`. *Needs:* the list and card routes; step 19 for sort.
5. **Step 26: card dialog.** Title, description, labels (picker and editor), due date, assignees, comments with edit, delete and link, and the card's activity. *Needs:* step 16, step 20 (filters, `GET /comments/{id}`).
6. **Step 27: board menu and sharing.** About, activity (all or comments), archived items with restore and delete, labels, close board, and Share (invite by email, roles, leave). *Needs:* steps 17–20 and the member routes.
7. **Step 28: checklists in the card dialog.** *Needs:* step 21.

## Risks and open questions

- **Loading a board today takes one request per list.** That's why step 20's snapshot comes before step 24. Without it, a board with 15 lists makes 16 requests.
- **Drag and realtime races.** Two people dragging at once both succeed, because the board lock serialises them. The second person's screen must then take the server's order from the event. Step 25 needs a test with two browser sessions.
- **Token storage.** A token in `localStorage` can be read by any injected script. Keep it in memory by default, and treat "remember me" as a choice the user makes knowingly. Revisit if the API gets cookie sessions.
- **The repo stops being backend only.** CLAUDE.md, CI and the README need a frontend section in step 22 (D12).
- **The prototype drifts from the plan.** The prototype updates listed in D3, D5, D6 and D9 should land before step 23, so the UI is built from a picture that matches the API.
- **Unconfirmed requirements** (R-MEMBER-05, R-DATE-03, R-CHECK-05 and the open questions in `requirements.md`) need a second-account observe session. D5, D10 and D11 may change after it.
