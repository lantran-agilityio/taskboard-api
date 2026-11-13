# Observation: lists

- **Observed:** 2026-11-09; second session 2026-11-13 (restore position, deleting, name limits)
- **Account and plan:** free workspace, on the scratch board from [boards.md](boards.md). Features marked as paid were noted but not explored.

## What a user can do

- **Add lists** from an "add a list" control at the right end of the board. After each one, the form stays open with an empty field, so several lists can be typed in a row; Escape closes it.
- **Rename** a list by clicking its name. It is edited in place and saved with Enter.
- **Reorder:**
  - by dragging a list sideways,
  - or with "Move list" in the list menu: pick a board and a position, counted from 1 with the current one marked. A list can move to another board.
- **List header:** shows the card count and a ⋯ menu.
- **List menu:**
  - add card, copy list, move list, pin list, watch,
  - list colour (paid), automation rules for the list,
  - archive this list.
  - When the list has cards, three more entries appear: move all cards in this list, sort by, and archive all cards in this list.
- **Sort a list** by date created (newest or oldest first) or by card name. This is a one-off reorder, not a lasting sort mode.
- **Archive a list** after a small "are you sure?" confirmation.
- **Restore or delete an archived list** from the board menu's "archived items" panel, which has a toggle between cards and lists.

## States

- **Active:** shown on the board in left-to-right order.
- **Archived:** gone from the board. It appears in "archived items" under Lists with Restore and Delete. Its cards go with it, but they are not listed as archived cards.

## Rules

- New lists go at the right end.
- A name of only spaces creates nothing.
- Renaming a list to an empty name keeps the old name, with no error message, the same as boards.
- After a move or a drag, the other lists close the gap, so positions stay continuous.
- Restoring a list puts it back at its **original position**, not at the end, with its cards in the same order. More exactly (2026-11-13): it goes back **beside the lists that were its neighbours**, not at its old index. With To Do, Doing, Done, Extra, archiving Doing and then moving Extra to the front gave Extra, To Do, Done; restoring Doing gave Extra, To Do, **Doing**, Done (3rd, where it had been 2nd). Restoring asks for no confirmation.
- A list can only be deleted once it has been archived. There is no delete in the normal list menu.
- **Deleting an archived list** (2026-11-13) asks once, in a small popover: its cards and all their history go with it, permanently, and it can't be reopened. Afterwards the board's log keeps a single "deleted list <name>" entry; the list's earlier entries (added, archived, and the cards added to it) are gone. Its cards don't appear among the archived cards.
- **List names** (2026-11-13) are trimmed: "   Spare   " is saved as "Spare". The name field stops at 512 characters.
- In the card "move" form, the target-list dropdown is in alphabetical order, not board order.

## Edge cases, empty and error states

- An empty list shows a count of 0 and only the "add a card" control.
- The board's archived-items panel starts on cards and shows "no archived cards" even while an archived list holds cards.

## Open questions

- What do "copy list", "move all cards" and "archive all cards" do exactly?
- What do pinned lists do?
