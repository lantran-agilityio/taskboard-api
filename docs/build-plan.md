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
| D12 | Frontend stack | **Approved (2026-11-11):** a separate `frontend/` app (Vite, React, TypeScript) that talks to the API over HTTP and the WebSocket, with its own CI job. In development Vite proxies `/api` to the API, so the API needs no CORS. | It's a common, well-documented stack, and it keeps the API and the UI testable on their own. |

## Coverage

This table is the plan as written before steps 16–21; those steps closed every ✗ and ◐ gap it lists (see "Frontend check" below for what the app does now).

**Covered** means the API did it at the time: ✓ yes, ◐ partly, ✗ no, — out of scope. "Client" means the frontend can do it with no API change.

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
| 17 | **Board details: description and star** | R-BOARD-04, R-BOARD-05 | `boards.description` (nullable, ≤ 2000 characters; `null` clears it, like cards). A new `board_stars` table `(user_id, board_id)`. `PUT`/`DELETE /boards/{id}/star` for viewers and up. `BoardRead.starred` for the caller. Starring publishes no event (it's per user). Editors can change the description (R-BOARD-05 says members edit it, and members are editors under D5); renaming stays owner-only. |
| 18 | **Close and reopen boards** | R-BOARD-06, R-BOARD-07, R-BOARD-08 | `boards.closed_at`. `POST /boards/{id}/close` and `/reopen` (owner). Every write access check returns 422 on a closed board. `GET /boards?closed=true`. Events `board.closed`/`board.reopened`. The WebSocket stays open. Members can still leave, star and watch a closed board; the owner can't remove others from it. |
| 19 | **Restore in place, sort once** | R-LIST-07, R-CARD-09, R-LIST-05 | Save `archived_position` when archiving. Restore inserts at `min(archived_position, n)` through `app/services/ordering.py`. `POST /lists/{id}/sort` with `by`: `created_desc`, `created_asc` or `title`. It renumbers in one transaction and publishes one `list.sorted` event with the new card order. |
| 20 | **Card and activity reads for the UI** | R-CARD-02 (comments), R-COMMENT-04, R-ACTIVITY-01/02, R-BOARD-01, R-CARD-05 | `CardRead.comment_count`. `GET /comments/{id}`. Activity `?kind=comments` and `?card_id=` filters (on the event data's card id). `GET /boards/{id}/snapshot`: lists with their active cards in one call. A test that `due_complete` works without a due date. |
| 21 | **Checklists** | R-CHECK-01 to R-CHECK-04, R-CARD-02 (progress); R-CHECK-05 optional | Tables `checklists (card_id, title, position)` and `checklist_items (checklist_id, text, done, position)`, plus `assignee_id`/`due_at` if R-CHECK-05 is in. Nested routes under `/cards/{id}/checklists` and `/checklists/{id}/items`. Frozen-card 422 rules. `CardRead.checklist_done`/`checklist_total`. Events and activity entries. |

## Frontend build order

Each step names the prototype screen it builds, the API it needs, and the realtime events it listens to. D12 was approved on 2026-11-11, and step 22 adds `frontend/`. The frontend reuses the prototype's layout and behaviour, never the observed product's.

1. **Step 22: shell and sign-in.** Login and register screens (the API has them; the requirements don't cover them), the token in memory with a "remember me" option, an API client that turns 422 `detail` lists into field errors, the address routes `#home`, `#board-<id>` and `#card-<id>`, and the frontend CI job. *Needs:* `/auth/register`, `/auth/token`, `/users/me`.
2. **Step 23: home.** Board tiles, starred, recently opened (local storage), create a board, and closed boards. *Needs:* `GET/POST /boards`, steps 17 and 18.
3. **Step 24: board view, reading.** Lists and card fronts with labels, due badges, assignees and counts. The WebSocket connects and applies events, and handles `resync` by reloading. *Needs:* step 20's snapshot, `GET /boards/{id}/labels`, `GET /boards/{id}/members`, `WS /boards/{id}/ws`.
4. **Step 25: board view, editing.** Add, rename, move and drag lists and cards; mark done; archive. Changes show at once and roll back on 422. (Built differently: every event is applied, your own echoes included, because applying one is idempotent; nothing is skipped by `actor_id`.) *Needs:* the list and card routes; step 19 for sort.
5. **Step 26: card dialog.** Title, description, labels (picker and editor), due date, assignees, comments with edit, delete and link, and the card's activity. *Needs:* step 16, step 20 (filters, `GET /comments/{id}`).
6. **Step 27: board menu and sharing.** About, activity (all or comments), archived items with restore and delete, labels, close board, and Share (invite by email, roles, leave). *Needs:* steps 17–20 and the member routes.
7. **Step 28: checklists in the card dialog.** *Needs:* step 21.

## Frontend check (step 29)

Done on 2026-11-13 against `main` after step 28: the real app (API and Vite dev server) with a seeded board, three users (owner, editor, viewer), clicked through in Chrome. "Clicked" means checked by hand in the browser; "tests" means checked by the frontend's tests through what the user sees (`frontend/src/**/*.test.tsx`), which cover it in more detail than a click-through. Drag and drop was checked with real `DragEvent`s in the page, because the browser tool's synthetic mouse doesn't start a native drag.

✓ built as the requirement says (or as the decision named says) · ◐ built, with a gap found below · — out of scope.

| Requirement | In the app | Result | Checked |
| --- | --- | --- | --- |
| R-BOARD-01 See my boards | Home: Starred, Recently opened, All boards; closed boards left out | ✓ | clicked |
| R-BOARD-02 Create a board | Home → Create a board; spaces keep Create disabled with "A title is required"; opens the new, empty board | ◐ the creation isn't logged (issue 1) | clicked |
| R-BOARD-03 Rename in place | Board title; Enter saves, the page title follows; empty keeps the old one | ◐ the log says "changed the board", not old → new (issue 2) | clicked |
| R-BOARD-04 Star a board | Star in the board bar and on tiles; a Starred row on home | ✓ | clicked |
| R-BOARD-05 Board description | Menu → About, editable by editors and the owner | ✓ | clicked, tests |
| R-BOARD-06 Close a board | Menu → Close board…, "You can reopen it later"; banner with Reopen; read-only | ✓ | clicked |
| R-BOARD-07 See and reopen closed boards | Home → Closed boards (n), Reopen and Delete; "No boards have been closed." | ✓ | clicked, tests |
| R-BOARD-08 Delete a closed board | Only in Closed boards, after a confirmation | ✓ | clicked |
| R-MEMBER-01 Creator is admin | Owner first in Share | ✓ (D5) | clicked |
| R-MEMBER-02 Invite a member | Share: email, Editor/Viewer, Invite | ✓ (email only, D5) | clicked, tests |
| R-MEMBER-03 See board members | Share lists everyone with roles | ✓ | clicked |
| R-MEMBER-04 At least one admin | Owner row: "can't be changed or leave", with the reason | ✓ | clicked |
| R-MEMBER-05 Several admins | — | — (D5) | — |
| R-MEMBER-06 Leave a board | Share → Leave, after a confirmation, then home | ✓ | tests |
| R-LIST-01 Add lists quickly | + Add another list; stays open, Escape closes, spaces add nothing | ◐ fast typing loses names (issue 3) | clicked |
| R-LIST-02 Rename in place | List name; empty keeps the old one | ✓ | tests |
| R-LIST-03 Reorder lists | Move list… (positions from 1, "(current)"), and dragging | ✓ | clicked, tests |
| R-LIST-04 Card count | Header count, updates on moves and drags | ✓ | clicked |
| R-LIST-05 Sort a list once | Sort cards… only with cards; three orders | ✓ | clicked |
| R-LIST-06 Archive a list | Archive this list…, confirmed; shows under Archived items → Lists | ✓ | clicked |
| R-LIST-07 Restore to original position | Restore puts it back where it was | ✓ | clicked |
| R-LIST-08 Delete an archived list | Only from Archived items, after a warning | ✓ | clicked, tests |
| R-CARD-01 Add cards quickly | + Add a card; stays open; Escape or spaces close it | ◐ fast typing loses titles (issue 3) | clicked |
| R-CARD-02 Card front summary | Labels, done check, due badge, checklist done/total, comment count, description icon, avatars | ✓ | clicked |
| R-CARD-03 Own address | `#card-<id>` dialog over the board with list, details, description, comments and activity | ✓ (D9) | clicked |
| R-CARD-04 Title and description | Click to rename; Markdown description with Save and Cancel | ✓ | tests |
| R-CARD-05 Mark done | Done toggle on the front and in the dialog, without a due date too; logged | ✓ | clicked |
| R-CARD-06 Move by dragging | Drag within and between lists; counts update | ✓ | clicked (events), tests |
| R-CARD-07 Move with a form | "In list … ▾": list and position from 1; logged "from To do to Doing" | ✓ | clicked |
| R-CARD-08 Archive a card | Card actions → Archive, no confirmation; quick archive on done cards; archived dialog read-only with Restore and Delete | ✓ | clicked |
| R-CARD-09 Restore a card | Logged "sent this card to the board"; back at its old position | ✓ | clicked |
| R-CARD-10 Delete an archived card | Delete for good…, warns it's permanent | ✓ (D3: the log keeps a note) | tests |
| R-CARD-11 Assign members | Members picker searches board members; avatars; "joined this card" | ✓ | clicked |
| R-LABEL-01 Default labels | Six unnamed colours on a new board | ✓ | clicked |
| R-LABEL-02 Apply labels | Picker with search, in colour order | ✓ | clicked |
| R-LABEL-03 Create a label | From the picker or Menu → Labels; applied to the card at once | ✓ | tests |
| R-LABEL-04 Edit a label | ✎ in the picker or Menu → Labels | ✓ | tests |
| R-LABEL-05 Delete a label | After a warning | ✓ | tests |
| R-DATE-01 Set a due date | Date and time, starting at tomorrow now; Remove; logged | ✓ (absolute time in the log, not "yesterday at") | clicked |
| R-DATE-02 Due state | Red overdue, green complete, amber due soon | ✓ | clicked |
| R-DATE-03 Start date | — | — (D11) | — |
| R-CHECK-01 to R-CHECK-04 | Checklists in the card dialog (step 28) | ✓ | clicked (step 28), tests |
| R-CHECK-05 Item assignee and due date | — | — (step 31 first) | — |
| R-COMMENT-01 Comment on a card | Composer at the top; name and relative time; mixed with activity; front count | ✓ | clicked |
| R-COMMENT-02 Edit my comment | Edit, Save, "Discard changes", "(edited)" | ✓ | tests |
| R-COMMENT-03 Delete my comment | After a confirmation | ✓ | tests |
| R-COMMENT-04 Link to a comment | Copy link → `#card-<id>-comment-<id>`, highlighted | ✓ | tests |
| R-ACTIVITY-01 Board activity log | Menu → Activity, All or Comments, paged | ◐ old values missing from renames (issue 2) | clicked |
| R-ACTIVITY-02 Card activity log | In the dialog, Hide/Show details | ✓ | clicked |

Tally (52 requirements): ✓ 44 · ◐ 5 (issues 1–3) · — 3.

### Issues found

Each is fixed in its own PR.

1. **Creating a board isn't logged** (R-BOARD-02). `POST /boards` publishes no event, so a new board's log says "Nothing has happened yet." Fix: publish `board.created`.
2. **Changes don't say what they changed from, when the log can't see the earlier state** (R-BOARD-03, R-ACTIVITY-01). Update events carry only the new state, so the log compares each with the previous entry about the same thing. A board has no earlier entry at all (issue 1), default labels have none, and anything whose earlier entry is on an older page shows as "changed the board" or "updated “…”" until "Show older" is clicked. Fix: update events also carry the old values of what changed.
3. **Typing quickly in "Add a card" or "Add a list" loses titles** (R-CARD-01, R-LIST-01). While a card is being saved, Enter is ignored (the button is disabled) and the field is then cleared, so a title typed meanwhile is lost. Seen by typing three titles in a row: only the first was added. Fix: clear the field at once and save the titles one after another.
4. **"1 cards", "1 comments"** in the hover text of the list count and the card front's comment badge. Fix: singular for one.

## Two people at once (step 30)

Done on 2026-11-13: the owner and an editor signed in to the same board in two Chrome tabs, against the local API, with board changes made from both at the same moment. Each scenario compares both screens with the board as the API returns it (`GET /boards/{id}/snapshot`) once the events have arrived.

| Scenario | What happened | Result |
| --- | --- | --- |
| 1. A burst of moves | 16 card moves sent at once, half by each user, to random lists and positions | ✓ all 200; the editor's screen, live throughout, matched the server card for card, counts included |
| 2. Drag against a move | The editor drags a card to Done while the owner moves the same card to QA; then the editor drags a list while the owner moves another | ✓ both screens matched the server; no error shown |
| 3. A card open while someone else changes it | The owner has a card open; the editor renames it, marks it done, comments, adds a checklist, archives it | ✓ every change showed in the open dialog at once, then the archived banner and read-only controls |
| 4. …and deletes it | The editor deletes the archived card | ◐ the owner's dialog still shows it as archived (issue 5) |
| 5. Closing and reopening | The owner closes the board, then reopens it | ✓ the editor's edit controls went and came back, live |
| 6. Removing a member | The owner removes the editor | ✓ the editor's page said at once that the board is no longer available |
| 7. Changing a role | The owner makes the editor a viewer | ◐ the viewer's edit controls stay until an edit is refused (issue 6) |

Drags were made with real `DragEvent`s in the page (see step 29), and the owner's side with the API from the page, so both sides' requests went out within milliseconds of each other.

### Issues found

Each is fixed in its own PR.

5. **A card deleted by someone else stays open as archived.** An open archived card is read from the API, not the board, so the `card.deleted` event doesn't reach it; Restore and Delete then fail with 404. Fix: the dialog says "Card not found" when its card is deleted.
6. **A role change doesn't reach the person whose role changed.** `member.updated` updates the members list but not the board's `role` for the person it's about, so a new viewer keeps the edit controls until an edit gets a 403. Fix: apply the new role to the board when the event is about you.

## After the build order

Added on 2026-11-13, once step 28 was merged. Each is its own branch and PR.

1. **Step 29: check the frontend against this plan.** Click through every requirement ID in the real app, as the prototype was checked, and record in the Coverage table which are built and where. Fix the plan where the build went another way (for example, step 25 above says echoed events are skipped by `actor_id`; the frontend applies every event instead, because applying one is idempotent).
2. **Step 30: two people at once.** The drag and realtime race under "Risks" below: two browser sessions on one board, dragging and editing at the same time, both ending with the server's order. Fix what it finds.
3. **Step 31: second observe session.** Phase 1 again, with a second account (the user logs in): R-MEMBER-05, R-DATE-03, R-CHECK-05 and open questions 1–9 in `requirements.md`. Update the observations and requirements, then say which decisions (D5, D10, D11) and steps change.
4. **Step 32: beyond the requirements.** Reorder checklist items (the API already takes `position`), item assignees and due dates (R-CHECK-05, only once step 31 confirms it), and touch and keyboard dragging. Each starts as a requirement in `requirements.md`, then gets its build-plan row.

## Risks and open questions

- **Loading a board today takes one request per list.** That's why step 20's snapshot comes before step 24. Without it, a board with 15 lists makes 16 requests.
- **Drag and realtime races.** Two people dragging at once both succeed, because the board lock serialises them. The second person's screen must then take the server's order from the event. Step 25 needs a test with two browser sessions. Done in step 30 ("Two people at once" below): both screens end in the server's order.
- **Token storage.** A token in `localStorage` can be read by any injected script. Keep it in memory by default, and treat "remember me" as a choice the user makes knowingly. Revisit if the API gets cookie sessions.
- **The repo stops being backend only.** Done in step 22: CLAUDE.md, CI and the README have frontend sections.
- **The prototype drifts from the plan.** The prototype updates listed in D3, D5, D6 and D9 should land before step 23, so the UI is built from a picture that matches the API.
- **Unconfirmed requirements** (R-MEMBER-05, R-DATE-03, R-CHECK-05 and the open questions in `requirements.md`) need a second-account observe session. D5, D10 and D11 may change after it.
