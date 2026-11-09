# Requirements

Written in roadmap step 13 from [`observations/`](observations/) (boards, lists, cards and card details, observed 2026-11-09). Design sessions read this file only, never the product.

## IDs and status

- **ID:** `R-<AREA>-<NN>`. Areas: `BOARD`, `MEMBER`, `LIST`, `CARD`, `LABEL`, `DATE`, `CHECK` (checklists), `COMMENT`, `ACTIVITY`. `AUTH`, `SEARCH` and `REALTIME` weren't observed; the API already has them.
- **Status:** `confirmed` (seen in an observation) or `unconfirmed` (inferred; check in the next observe session).
- **Roles** in the user stories: *member* is anyone on the board who can edit; *admin* is a member who manages the board. The observations only saw a board with one admin, so read-only roles aren't covered.

## Template

```markdown
### R-CARD-01: <short name>

As a <role>, I can <action> so that <reason>.

- Acceptance: <observable result>
- Acceptance: <error or edge case>
- Source: observations/cards.md · Status: confirmed
```

## Scope

**In scope:**
- boards, lists and cards, including archiving and restoring them;
- card details: description, done, labels, due and start dates, checklists, assignees and comments;
- the board and card activity logs;
- members and admins.

**Out of scope.** These were observed but are left out of the practice product, each for the reason given:

| Observed feature | Why left out |
|---|---|
| Workspaces and the three visibility levels | A board is private to its members in our product |
| Board templates, backgrounds, copy board/list/card, make template | Presentation or convenience, not core behaviour |
| Automation, add-ons, external integrations, email-to-board, print/export | Integrations |
| Watching, reminders, recurring dates | Need notification delivery, which our product doesn't have |
| Attachments, card covers, a personal inbox, mirrored cards | Need file storage or cross-board features |
| Comment reactions, list colours, pinned lists, colourblind mode, keyboard shortcuts | Nice to have; revisit after the prototype |

## Summary

| ID | Requirement | Status | Source |
| --- | --- | --- | --- |
| R-BOARD-01 | See my boards | confirmed | boards.md |
| R-BOARD-02 | Create a board | confirmed | boards.md |
| R-BOARD-03 | Rename a board in place | confirmed | boards.md |
| R-BOARD-04 | Star a board | confirmed | boards.md |
| R-BOARD-05 | Board description | unconfirmed | boards.md |
| R-BOARD-06 | Close a board | confirmed | boards.md |
| R-BOARD-07 | See and reopen closed boards | confirmed | boards.md |
| R-BOARD-08 | Delete a closed board | confirmed | boards.md |
| R-MEMBER-01 | Creator is admin | confirmed | boards.md |
| R-MEMBER-02 | Invite a member | confirmed | boards.md |
| R-MEMBER-03 | See board members | confirmed | boards.md |
| R-MEMBER-04 | At least one admin | confirmed | boards.md |
| R-MEMBER-05 | Several admins | unconfirmed | boards.md |
| R-MEMBER-06 | Leave a board | unconfirmed | boards.md |
| R-LIST-01 | Add lists quickly | confirmed | lists.md |
| R-LIST-02 | Rename a list in place | confirmed | lists.md |
| R-LIST-03 | Reorder lists | confirmed | lists.md |
| R-LIST-04 | List header shows card count | confirmed | lists.md |
| R-LIST-05 | Sort a list once | confirmed | lists.md |
| R-LIST-06 | Archive a list | confirmed | lists.md |
| R-LIST-07 | Restore an archived list | confirmed | lists.md |
| R-LIST-08 | Delete an archived list | unconfirmed | lists.md |
| R-CARD-01 | Add cards quickly | confirmed | cards.md |
| R-CARD-02 | Card front shows a summary | confirmed | cards.md, card-details.md |
| R-CARD-03 | Open a card at its own address | confirmed | cards.md |
| R-CARD-04 | Edit title and description | confirmed | cards.md |
| R-CARD-05 | Mark a card done | confirmed | cards.md, card-details.md |
| R-CARD-06 | Move a card by dragging | confirmed | cards.md |
| R-CARD-07 | Move a card with a form | confirmed | cards.md |
| R-CARD-08 | Archive a card | confirmed | cards.md |
| R-CARD-09 | Restore an archived card | confirmed | cards.md |
| R-CARD-10 | Delete an archived card | confirmed | cards.md |
| R-LABEL-01 | Default labels on a new board | confirmed | card-details.md |
| R-LABEL-02 | Apply labels to a card | confirmed | card-details.md |
| R-LABEL-03 | Create a label | confirmed | card-details.md |
| R-LABEL-04 | Edit a label | confirmed | card-details.md |
| R-LABEL-05 | Delete a label | confirmed | card-details.md |
| R-DATE-01 | Set a due date | confirmed | card-details.md |
| R-DATE-02 | Due state on the card | confirmed | card-details.md |
| R-DATE-03 | Start date | unconfirmed | card-details.md |
| R-CHECK-01 | Add a checklist | confirmed | card-details.md |
| R-CHECK-02 | Add and tick items | confirmed | card-details.md |
| R-CHECK-03 | Hide ticked items | confirmed | card-details.md |
| R-CHECK-04 | Delete a checklist | confirmed | card-details.md |
| R-CHECK-05 | Item assignee and due date | unconfirmed | card-details.md |
| R-CARD-11 | Assign members to a card | confirmed | card-details.md |
| R-COMMENT-01 | Comment on a card | confirmed | card-details.md |
| R-COMMENT-02 | Edit my comment | confirmed | card-details.md |
| R-COMMENT-03 | Delete my comment | confirmed | card-details.md |
| R-COMMENT-04 | Link to a comment | confirmed | card-details.md |
| R-ACTIVITY-01 | Board activity log | confirmed | boards.md |
| R-ACTIVITY-02 | Card activity log | confirmed | cards.md, card-details.md |

## Requirements

### Boards

#### R-BOARD-01: See my boards

As a user, I can see every board I'm on, so that I can open one.

- Acceptance: the home screen lists my open boards as tiles with their names.
- Acceptance: recently opened boards appear in their own row.
- Acceptance: closed boards don't appear here (see R-BOARD-07).
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-02: Create a board

As a user, I can create a board with a title, so that I can start organising work.

- Acceptance: the title is required; a title of only spaces counts as empty, and Create stays disabled with a "title is required" hint.
- Acceptance: the new board opens at once, empty, ready to add the first list.
- Acceptance: the creation is logged in the board's activity.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-03: Rename a board in place

As an admin, I can click the board's title and edit it in place, so that renaming is quick.

- Acceptance: Enter saves; the new title shows in the header and the page title.
- Acceptance: saving an empty title keeps the old one, with no error.
- Acceptance: the rename is logged with the old and new titles.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-04: Star a board

As a user, I can star or unstar a board from its header, so that I can mark the boards I use most.

- Acceptance: the star toggles and shows its state.
- Acceptance: a starred board is easier to find on the home screen. Unconfirmed: how they are shown.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-05: Board description

As a member, I can read and edit a short description of the board, so that everyone knows its purpose.

- Acceptance: the board menu has an "about" entry that shows the description.
- Source: observations/boards.md · Status: unconfirmed (only the menu entry was seen)

#### R-BOARD-06: Close a board

As an admin, I can close a board after a short confirmation, so that I can put it away without losing it.

- Acceptance: the confirmation says the board can be reopened later.
- Acceptance: a closed board can still be opened, but it's read-only; a banner offers to reopen it, and the edit controls are hidden.
- Acceptance: it leaves the home screen's lists of boards.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-07: See and reopen closed boards

As an admin, I can see my closed boards in one place and reopen any of them, so that closing is reversible.

- Acceptance: the closed-boards view lists each board with Reopen and Delete; with none closed, it says so.
- Acceptance: a reopened board returns to the home screen and is editable again.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-08: Delete a closed board

As an admin, I can permanently delete a board, but only once it's closed, so that deleting is never one click away from an open board.

- Acceptance: open boards have no delete action.
- Acceptance: deleting asks for confirmation (wording unconfirmed).
- Source: observations/boards.md · Status: confirmed (the confirmation itself wasn't seen)

### Members

#### R-MEMBER-01: Creator is admin

As a user who creates a board, I become its admin, so that someone can always manage it.

- Source: observations/boards.md · Status: confirmed

#### R-MEMBER-02: Invite a member

As an admin, I can invite someone by email or name and choose their role, so that we can work on the board together.

- Acceptance: the share dialog has an invite field, a role choice and an invite button.
- Acceptance: a read-only role exists in the product, but it was locked on the observed plan (unconfirmed for us).
- Source: observations/boards.md · Status: confirmed

#### R-MEMBER-03: See board members

As a member, I can see who is on the board and their roles, so that I know who I'm working with.

- Acceptance: the share dialog lists the members with their roles.
- Source: observations/boards.md · Status: confirmed

#### R-MEMBER-04: At least one admin

As the only admin, I can't step down or leave, so that a board is never left without an admin.

- Acceptance: those choices are disabled, and the reason is shown.
- Source: observations/boards.md · Status: confirmed

#### R-MEMBER-05: Several admins

As an admin, I can make another member an admin too.

- Source: observations/boards.md · Status: unconfirmed (implied by "at least one admin"; needs a second account)

#### R-MEMBER-06: Leave a board

As a member who isn't the last admin, I can leave a board.

- Source: observations/boards.md · Status: unconfirmed (only seen disabled for the last admin)

### Lists

#### R-LIST-01: Add lists quickly

As a member, I can add several lists in a row, so that setting up a board is fast.

- Acceptance: a new list goes at the right end.
- Acceptance: after each list, the form stays open with an empty field; Escape closes it.
- Acceptance: a name of only spaces creates nothing.
- Source: observations/lists.md · Status: confirmed

#### R-LIST-02: Rename a list in place

As a member, I can click a list's name and edit it in place.

- Acceptance: Enter saves; an empty name keeps the old one, with no error.
- Source: observations/lists.md · Status: confirmed

#### R-LIST-03: Reorder lists

As a member, I can change a list's position by dragging it or by choosing a position in a form, so that the board reads in the order I want.

- Acceptance: the form's positions are numbered from 1, and the current one is marked.
- Acceptance: after any move, the other lists close the gap; there are no holes or duplicates.
- Source: observations/lists.md · Status: confirmed

#### R-LIST-04: List header shows card count

As a member, I can see how many cards each list holds.

- Acceptance: the count updates straight away when cards are moved or dragged.
- Source: observations/lists.md, cards.md · Status: confirmed

#### R-LIST-05: Sort a list once

As a member, I can reorder a list's cards by creation date (newest or oldest first) or by title, so that I can tidy a long list.

- Acceptance: it's a one-off reorder; cards added later still go at the end.
- Acceptance: the sort option only shows when the list has cards.
- Source: observations/lists.md · Status: confirmed

#### R-LIST-06: Archive a list

As a member, I can archive a list after a short confirmation, so that it's hidden but kept.

- Acceptance: the list and its cards leave the board.
- Acceptance: the list shows in the board's archived items, under lists. Its cards aren't listed as archived cards.
- Source: observations/lists.md · Status: confirmed

#### R-LIST-07: Restore an archived list

As a member, I can restore an archived list.

- Acceptance: it comes back at its original position, with its cards in their order.
- Source: observations/lists.md · Status: confirmed (what happens when other lists moved in the meantime is unconfirmed)

#### R-LIST-08: Delete an archived list

As a member, I can permanently delete a list, but only once it's archived.

- Acceptance: active lists have no delete action.
- Acceptance: what happens to its cards and what the confirmation says is unconfirmed.
- Source: observations/lists.md · Status: unconfirmed

### Cards

#### R-CARD-01: Add cards quickly

As a member, I can add several cards to a list in a row.

- Acceptance: a new card goes at the bottom of the list.
- Acceptance: after each card the field stays open; Escape closes it.
- Acceptance: a title of only spaces creates nothing and closes the form.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-02: Card front shows a summary

As a member, I can see a card's key details on the board without opening it.

- Acceptance: the front shows the title, labels (as coloured bars, with names when they have them), a done check, the due badge (R-DATE-02), checklist progress (done/total), comment count, a description icon and assignee avatars.
- Source: observations/cards.md, card-details.md · Status: confirmed

#### R-CARD-03: Open a card at its own address

As a member, I can open a card as a dialog with its own shareable address.

- Acceptance: the address has a per-board card number and a slug of the title.
- Acceptance: the dialog shows the card's list (as a way to move it), its title, its details, its description, and a panel with comments and activity.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-04: Edit title and description

As a member, I can edit a card's title and its formatted description.

- Acceptance: the description has basic formatting and explicit Save and Cancel.
- Source: observations/cards.md · Status: confirmed (editing the title in the dialog is unconfirmed)

#### R-CARD-05: Mark a card done

As a member, I can mark a card done or not done, with or without a due date.

- Acceptance: a done card shows a check and a dimmed title, and stays in its list.
- Acceptance: marking it done also marks its due date complete (R-DATE-02). It is one flag.
- Acceptance: the change is logged on the card.
- Source: observations/cards.md, card-details.md · Status: confirmed

#### R-CARD-06: Move a card by dragging

As a member, I can drag a card within its list or into another list.

- Acceptance: the cards close the gap in the old list and make room in the new one; both counts update.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-07: Move a card with a form

As a member, I can move a card by choosing a list and a position.

- Acceptance: positions are numbered from 1; an empty list offers only 1.
- Acceptance: the move is logged as "from <list> to <list>".
- Source: observations/cards.md · Status: confirmed

#### R-CARD-08: Archive a card

As a member, I can archive a card without a confirmation, so that finished work gets out of the way fast.

- Acceptance: the card leaves its list. It shows in the board's archived items, under cards.
- Acceptance: opening it shows when it was archived. Its details can't be changed, and its menu offers Restore and Delete.
- Acceptance: a done card offers archive straight from the board.
- Source: observations/cards.md · Status: confirmed (whether an archived card can take new comments is unconfirmed)

#### R-CARD-09: Restore an archived card

As a member, I can restore an archived card to its list.

- Acceptance: it's logged as "sent to the board".
- Source: observations/cards.md · Status: confirmed (its position in a list with several cards is unconfirmed)

#### R-CARD-10: Delete an archived card

As a member, I can permanently delete a card, but only once it's archived.

- Acceptance: the confirmation warns that it's permanent and that the card's history goes with it.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-11: Assign members to a card

As a member, I can assign board members to a card.

- Acceptance: the picker searches the board's members only.
- Acceptance: assignees show as avatars in the card and on its front.
- Acceptance: assigning myself is logged as joining the card.
- Source: observations/card-details.md · Status: confirmed (assigning other people is unconfirmed)

### Labels

#### R-LABEL-01: Default labels on a new board

As a user, I get six labels on every new board, one each in green, yellow, orange, red, purple and blue, with no names.

- Source: observations/card-details.md · Status: confirmed

#### R-LABEL-02: Apply labels to a card

As a member, I can tick and untick a board's labels on a card.

- Acceptance: the picker can search labels, and it groups them by colour.
- Source: observations/card-details.md · Status: confirmed

#### R-LABEL-03: Create a label

As a member, I can create a label with an optional name and an optional colour from a fixed palette.

- Acceptance: a label needs at least a name or a colour (unconfirmed).
- Acceptance: several labels may share a colour.
- Acceptance: a label created from a card is applied to that card straight away.
- Source: observations/card-details.md · Status: confirmed (the palette size is a design decision; see open questions)

#### R-LABEL-04: Edit a label

As a member, I can change a label's name and colour, and the change shows on every card that has it.

- Source: observations/card-details.md · Status: confirmed

#### R-LABEL-05: Delete a label

As a member, I can delete a label after a confirmation warning that it is removed from every card and that this can't be undone.

- Source: observations/card-details.md · Status: confirmed

### Dates

#### R-DATE-01: Set a due date

As a member, I can set, change or remove a card's due date and time.

- Acceptance: the picker has a calendar and a time, and defaults to tomorrow at the current time.
- Acceptance: a date in the past is allowed.
- Acceptance: setting it is logged in plain words ("due yesterday at 4:08 PM").
- Source: observations/card-details.md · Status: confirmed

#### R-DATE-02: Due state on the card

As a member, I can tell at a glance whether a card is overdue or complete.

- Acceptance: the due badge is red with "overdue" when the date has passed and the card isn't done, and green with "complete" when the card is done.
- Acceptance: what an upcoming or due-soon badge looks like is unconfirmed.
- Source: observations/card-details.md · Status: confirmed

#### R-DATE-03: Start date

As a member, I can give a card a start date as well as a due date.

- Source: observations/card-details.md · Status: unconfirmed (only the optional field was seen)

### Checklists

#### R-CHECK-01: Add a checklist

As a member, I can add one or more named checklists to a card (the default name is "Checklist").

- Acceptance: adding one is logged on the card.
- Source: observations/card-details.md · Status: confirmed (several checklists on one card is unconfirmed)

#### R-CHECK-02: Add and tick items

As a member, I can add items one after another and tick them off.

- Acceptance: a ticked item is struck through.
- Acceptance: a percentage bar shows progress, and the card's front shows done/total.
- Acceptance: ticking an item is logged on the card.
- Source: observations/card-details.md · Status: confirmed

#### R-CHECK-03: Hide ticked items

As a member, I can hide a checklist's ticked items once there are some.

- Source: observations/card-details.md · Status: confirmed

#### R-CHECK-04: Delete a checklist

As a member, I can delete a whole checklist.

- Source: observations/card-details.md · Status: confirmed (whether it asks for confirmation is unconfirmed)

#### R-CHECK-05: Item assignee and due date

As a member, I can give a checklist item its own assignee and due date.

- Source: observations/card-details.md · Status: unconfirmed (the controls were seen, not used)

### Comments

#### R-COMMENT-01: Comment on a card

As a member, I can write a formatted comment on a card.

- Acceptance: it shows at the top with my name and a relative time, mixed with the card's activity, newest first.
- Acceptance: the card's front shows the comment count.
- Source: observations/card-details.md · Status: confirmed

#### R-COMMENT-02: Edit my comment

As the author, I can edit my comment in place, with Save and "discard changes".

- Acceptance: an edited comment is marked "(edited)".
- Source: observations/card-details.md · Status: confirmed (whether others can edit it is unconfirmed)

#### R-COMMENT-03: Delete my comment

As the author, I can delete my comment after a confirmation that it's permanent.

- Source: observations/card-details.md · Status: confirmed (whether admins can delete others' comments is unconfirmed)

#### R-COMMENT-04: Link to a comment

As a member, I can copy a link that goes straight to one comment.

- Source: observations/card-details.md · Status: confirmed

### Activity

#### R-ACTIVITY-01: Board activity log

As a member, I can read everything that happened on the board, newest first, with a comments-only filter.

- Acceptance: each entry names who did what and when, in plain words, including the old values for renames.
- Source: observations/boards.md · Status: confirmed

#### R-ACTIVITY-02: Card activity log

As a member, I can read a card's own history in the card, with system events (such as moves) shown or hidden by a toggle.

- Acceptance: it logs creating, moving, marking done, dates, checklists, joining and restoring.
- Acceptance: deleting a card removes its history (R-CARD-10).
- Source: observations/cards.md, card-details.md · Status: confirmed

## Open questions

**For the next observe session** (most need a second account):

1. What can a non-admin member do and see: the board menu, the share dialog, others' comments?
2. Can an admin edit or delete other people's comments?
3. Is there a read-only role on the free plan, and what can it do?
4. Where does a restored card land in a list with several cards? Where does a restored list land if other lists moved meanwhile?
5. Deleting an archived list: what happens to its cards, and what does it confirm? Deleting a closed board: what does it confirm?
6. Can an archived card take new comments?
7. Are there length limits on board, list and card titles and on label names? Are surrounding spaces trimmed?
8. How are starred boards shown on the home screen, and how are boards sorted there?
9. Is a start date allowed without a due date? Must the start come before the due date?

**Design decisions for the build plan** (not for the product to answer):

10. **Restoring:** the product restores lists to their original position; the API restores to the end.
11. **Deleting:** the product deletes only after archiving and erases a deleted card's history; the API deletes directly and keeps a "deleted" entry in the log.
12. **Empty rename:** the product silently keeps the old name; the API returns 422.
13. **Roles:** the product allows several admins; the API has exactly one owner plus editors and viewers.
14. **Labels:** the product has 30 colours, unnamed labels and labels without a colour; the API has 6 colours and requires names.
15. **Boards:** closing a board is a new state the API doesn't have.
