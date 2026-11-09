# Observation: cards

- **Observed:** 2026-11-09
- **Account and plan:** free workspace, on the scratch board from [boards.md](boards.md). Card details (labels, dates, checklists, members, comments) are a separate area for the next session. Here they were only noted as entry points.

## What a user can do

- **Add cards** at the bottom of a list. The field accepts a title or a pasted link. After each card the field stays open, so several can be typed in a row.
- **On the board**, a card shows its title plus small icons (for example "has a description"). Hovering a card shows:
  - a "mark done" circle,
  - a quick-edit button,
  - a quick-archive button, once the card is done.
- **Open a card** as a dialog with its own address, which ends in a number that looks like a card number within the board. The dialog shows:
  - **Header:** the card's current list as a dropdown, a cover button, a ⋯ menu, and close.
  - **Title:** with the done circle beside it.
  - **Buttons** to add details: labels, dates, checklist, members, and a general "add".
  - **Description:** a rich-text editor with formatting, a Markdown toggle, and explicit Save and Cancel.
  - **"Comments and activity" panel:** a comment box and the card's history, newest first. A "show details" toggle reveals system events such as moves.
- **Mark done or undone** with the circle. A done card shows a check and a dimmed title, and the change is logged. It works without a due date.
- **Move a card:**
  - by dragging it within a list or into another list,
  - or with "Move" in the card menu: pick a board, a list and a position (counted from 1). There's also an "Inbox" tab, a personal place outside boards.
- **Card menu:** join, move, copy, mirror, make template, watch, share, archive. It has no delete.
- **Archive a card** from its menu, from a hover button when it's done, or with a one-key shortcut. There's no confirmation.
- **Restore or delete an archived card** from that card's menu. Delete shows a final warning.

## States

- **Active:** visible in its list.
- **Done:** still active and in its list, shown with a check.
- **Archived:**
  - It leaves the list.
  - Opening it shows a banner with the date and time it was archived, and the detail buttons are hidden.
  - The comment box is still there.
  - Its menu swaps Archive for Restore and Delete.
  - It's listed in the board's "archived items" panel.

## Rules

- New cards go at the bottom of the list.
- A title of only spaces creates nothing and closes the add form. (Lists keep their form open instead.)
- Moving a card logs "moved this card from <list> to <list>".
- The other lists' counts update straight away after a move or drag.
- In the move form, an empty target list offers only position 1.
- Restoring logs "sent this card to the board" and puts the card back in its list.
- Archiving a card asks for no confirmation. Archiving a list does.
- **Deleting a card** also deletes its whole history from the activity feed, and it can't be undone. Our API keeps a "deleted" entry in the board log instead.
- The card's address and title use a per-board sequence number plus a slug of the title.

## Edge cases, empty and error states

- An archived card can apparently still take comments, because the comment box stays. Not tested. Our API returns 422 for writes on a frozen card.

## Open questions

- Where does a restored card go: its old position or the end of the list? (Only seen with a single-card list.)
- Can an archived card really get new comments?
- Is there a limit on title length? How do pasted links become cards?
- What do "mirror", "copy" and the "Inbox" do exactly?
- Card details: labels, dates, checklist, members, comments. These are the next observe session.
