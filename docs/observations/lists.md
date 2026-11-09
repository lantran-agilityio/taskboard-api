# Observation: lists

- **Observed:** 2026-11-09
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
- Restoring a list puts it back at its **original position**, not at the end, with its cards in the same order.
- A list can only be deleted once it has been archived. There is no delete in the normal list menu.
- In the card "move" form, the target-list dropdown is in alphabetical order, not board order.

## Edge cases, empty and error states

- An empty list shows a count of 0 and only the "add a card" control.
- The board's archived-items panel starts on cards and shows "no archived cards" even while an archived list holds cards.

## Open questions

- What does deleting an archived list confirm, and are its cards deleted too? (Not tried; permanent.)
- How does restore keep the "original position" once other lists have moved in the meantime?
- What do "copy list", "move all cards" and "archive all cards" do exactly?
- Is there a limit on list name length?
- What do pinned lists do?
