# Requirements

Written in roadmap step 13 from [`observations/`](observations/) (boards, lists, cards and card details, observed 2026-11-09), and updated in step 31 after a second observe session with two accounts (2026-11-13, which added [`members.md`](observations/members.md)). Design sessions read this file only, never the product.

## IDs and status

- **ID:** `R-<AREA>-<NN>`. Areas: `BOARD`, `MEMBER`, `LIST`, `CARD`, `LABEL`, `DATE`, `CHECK` (checklists), `COMMENT`, `ACTIVITY`. `AUTH`, `SEARCH` and `REALTIME` weren't observed; the API already has them.
- **Status:** `confirmed` (seen in an observation) or `unconfirmed` (inferred; check in the next observe session).
- **Roles** in the user stories: *member* is anyone on the board who can edit; *admin* is a member who manages the board; *observer* is the read-only role (a paid feature in the product). A board can have several admins (R-MEMBER-05).

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
| R-BOARD-05 | Board description | confirmed | boards.md, members.md |
| R-BOARD-06 | Close a board | confirmed | boards.md |
| R-BOARD-07 | See and reopen closed boards | confirmed | boards.md |
| R-BOARD-08 | Delete a closed board | confirmed | boards.md |
| R-MEMBER-01 | Creator is admin | confirmed | boards.md |
| R-MEMBER-02 | Invite a member | confirmed | boards.md |
| R-MEMBER-03 | See board members | confirmed | boards.md |
| R-MEMBER-04 | At least one admin | confirmed | boards.md |
| R-MEMBER-05 | Several admins | confirmed | members.md |
| R-MEMBER-06 | Leave a board | confirmed | members.md |
| R-MEMBER-07 | Observer role | confirmed (paid) | members.md |
| R-MEMBER-08 | Change roles and remove people | confirmed | members.md |
| R-MEMBER-09 | Who may comment and invite | confirmed | members.md |
| R-LIST-01 | Add lists quickly | confirmed | lists.md |
| R-LIST-02 | Rename a list in place | confirmed | lists.md |
| R-LIST-03 | Reorder lists | confirmed | lists.md |
| R-LIST-04 | List header shows card count | confirmed | lists.md |
| R-LIST-05 | Sort a list once | confirmed | lists.md |
| R-LIST-06 | Archive a list | confirmed | lists.md |
| R-LIST-07 | Restore an archived list | confirmed | lists.md |
| R-LIST-08 | Delete an archived list | confirmed | lists.md |
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
| R-DATE-03 | Start date | confirmed | card-details.md |
| R-CHECK-01 | Add a checklist | confirmed | card-details.md |
| R-CHECK-02 | Add and tick items | confirmed | card-details.md |
| R-CHECK-03 | Hide ticked items | confirmed | card-details.md |
| R-CHECK-04 | Delete a checklist | confirmed | card-details.md |
| R-CHECK-05 | Item assignee and due date | confirmed (paid) | card-details.md |
| R-CARD-11 | Assign members to a card | confirmed | card-details.md |
| R-COMMENT-01 | Comment on a card | confirmed | card-details.md |
| R-COMMENT-02 | Edit my comment | confirmed | card-details.md, members.md |
| R-COMMENT-03 | Delete my comment | confirmed | card-details.md, members.md |
| R-COMMENT-04 | Link to a comment | confirmed | card-details.md |
| R-ACTIVITY-01 | Board activity log | confirmed | boards.md |
| R-ACTIVITY-02 | Card activity log | confirmed | cards.md, card-details.md |

## Requirements

### Boards

#### R-BOARD-01: See my boards

As a user, I can see every board I'm on, so that I can open one.

- Acceptance: the home screen lists my open boards as tiles with their names.
- Acceptance: recently opened boards appear in their own row, most recent first.
- Acceptance: the main list of boards is in alphabetical order.
- Acceptance: closed boards don't appear here (see R-BOARD-07).
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-02: Create a board

As a user, I can create a board with a title, so that I can start organising work.

- Acceptance: the title is required; a title of only spaces counts as empty, and Create stays disabled with a "title is required" hint.
- Acceptance: the new board opens at once, empty, ready to add the first list.
- Acceptance: the creation is logged in the board's activity.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-03: Rename a board in place

As an admin, I can click the board's title and edit it in place, so that renaming is quick. Members and observers can't.

- Acceptance: Enter saves; the new title shows in the header and the page title.
- Acceptance: saving an empty title keeps the old one, with no error.
- Acceptance: the rename is logged with the old and new titles.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-04: Star a board

As a user, I can star or unstar a board from its header, so that I can mark the boards I use most.

- Acceptance: the star toggles and shows its state.
- Acceptance: starred boards get their own section at the top of the home screen, and still show (with a filled star) in the other sections.
- Acceptance: stars are per person; starring doesn't change the board for anyone else.
- Source: observations/boards.md · Status: confirmed

#### R-BOARD-05: Board description

As a member, I can read and edit a short description of the board, so that everyone knows its purpose.

- Acceptance: the board menu has an "about" entry that shows the description and names the board's admins.
- Acceptance: members and admins can edit it; observers only read it.
- Source: observations/boards.md, members.md · Status: confirmed

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
- Acceptance: deleting asks once, warning that its lists, cards and history are deleted with no undo. It doesn't ask for the board's name.
- Source: observations/boards.md · Status: confirmed

### Members

#### R-MEMBER-01: Creator is admin

As a user who creates a board, I become its admin, so that someone can always manage it.

- Source: observations/boards.md · Status: confirmed

#### R-MEMBER-02: Invite a member

As an admin, I can invite someone by email or name and choose their role, so that we can work on the board together.

- Acceptance: the share dialog has an invite field, a role choice and an invite button.
- Acceptance: the role choice is Member or Observer (R-MEMBER-07). Admin can't be chosen when inviting; it's given afterwards (R-MEMBER-05).
- Source: observations/boards.md, members.md · Status: confirmed

#### R-MEMBER-03: See board members

As a member, I can see who is on the board and their roles, so that I know who I'm working with.

- Acceptance: the share dialog lists the members with their roles, my own row first.
- Acceptance: everyone on the board can open it; only admins can change roles.
- Source: observations/boards.md, members.md · Status: confirmed

#### R-MEMBER-04: At least one admin

As the only admin, I can't step down or leave, so that a board is never left without an admin.

- Acceptance: those choices are disabled, and the reason is shown.
- Source: observations/boards.md · Status: confirmed

#### R-MEMBER-05: Several admins

As an admin, I can make another member an admin too, so that more than one person can manage the board.

- Acceptance: each other person's role menu offers Admin; the change applies at once, without a confirmation.
- Acceptance: Admin is unavailable, with the reason, for someone whose account isn't confirmed yet.
- Acceptance: with two admins, either can step down or leave, and either can change or remove the other.
- Source: observations/members.md · Status: confirmed

#### R-MEMBER-06: Leave a board

As anyone on a board who isn't its last admin, I can leave it.

- Acceptance: "Leave board" is in the board menu and in my own role menu, after a confirmation that I'll be taken off every card on the board.
- Acceptance: afterwards a private board is closed to me; opening it offers to ask the admins to join.
- Source: observations/members.md · Status: confirmed

#### R-MEMBER-07: Observer role

As an admin, I can give someone the observer role, so that they can follow the board without changing it.

- Acceptance: an observer sees the board, lists, cards, comments, activity and archived items, but gets no add, edit, move or archive controls, no card details and no comment box.
- Acceptance: an observer can still star and watch the board, and leave it.
- Source: observations/members.md · Status: confirmed (a paid feature in the product, seen on a trial)

#### R-MEMBER-08: Change roles and remove people

As an admin, I can change anyone else's role or remove them from the board.

- Acceptance: members and observers see everyone's role but can't change any, except leaving themselves.
- Source: observations/members.md · Status: confirmed

#### R-MEMBER-09: Who may comment and invite

As an admin, I can choose who may comment (nobody, members, or members and observers) and who may add or remove people (admins, or all members).

- Acceptance: by default members comment and members may invite.
- Source: observations/members.md · Status: confirmed

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
- Acceptance: if other lists moved meanwhile, it comes back beside the lists that were its neighbours, not at its old index.
- Source: observations/lists.md · Status: confirmed

#### R-LIST-08: Delete an archived list

As a member, I can permanently delete a list, but only once it's archived.

- Acceptance: active lists have no delete action.
- Acceptance: one confirmation warns that its cards and their history are deleted with it, with no undo.
- Acceptance: the board's log keeps a single "deleted list" entry; the list's earlier entries are removed.
- Source: observations/lists.md · Status: confirmed

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
- Acceptance: an archived card can still take new comments.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-09: Restore an archived card

As a member, I can restore an archived card to its list.

- Acceptance: it's logged as "sent to the board".
- Acceptance: it comes back beside the cards that were its neighbours, not at the end.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-10: Delete an archived card

As a member, I can permanently delete a card, but only once it's archived.

- Acceptance: the confirmation warns that it's permanent and that the card's history goes with it.
- Source: observations/cards.md · Status: confirmed

#### R-CARD-11: Assign members to a card

As a member, I can assign board members to a card.

- Acceptance: the picker searches the board's members only.
- Acceptance: assignees show as avatars in the card and on its front.
- Acceptance: assigning myself is logged as joining the card.
- Source: observations/card-details.md · Status: confirmed (assigning other people is unconfirmed; leaving a board takes you off its cards, R-MEMBER-06)

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

As a member, I can give a card a start date as well as, or instead of, a due date.

- Acceptance: a start date is a date with no time, defaulting to today.
- Acceptance: it's allowed without a due date; the card then shows when it started.
- Acceptance: the start is never after the due date: changing one moves the other to keep them in order.
- Acceptance: with both, the card shows a range. Setting a start date isn't logged.
- Source: observations/card-details.md · Status: confirmed

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

- Acceptance: the assignee is one of the board's members. It isn't added to the card's members, and it isn't logged.
- Acceptance: the due date has a time and may be later than the card's own due date.
- Acceptance: the item row shows both, and the card's front adds the nearest item due date to its checklist count.
- Source: observations/card-details.md · Status: confirmed (a paid feature in the product, seen on a trial)

### Comments

#### R-COMMENT-01: Comment on a card

As a member, I can write a formatted comment on a card.

- Acceptance: it shows at the top with my name and a relative time, mixed with the card's activity, newest first.
- Acceptance: the card's front shows the comment count.
- Source: observations/card-details.md · Status: confirmed

#### R-COMMENT-02: Edit my comment

As the author, I can edit my comment in place, with Save and "discard changes".

- Acceptance: an edited comment is marked "(edited)".
- Acceptance: nobody else can edit it, admins included.
- Source: observations/card-details.md, members.md · Status: confirmed

#### R-COMMENT-03: Delete my comment

As the author, I can delete my comment after a confirmation that it's permanent.

- Acceptance: an admin can delete anyone's comment; other members can't.
- Source: observations/card-details.md, members.md · Status: confirmed

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

**Answered in the second observe session (2026-11-13):**

1. *What can a non-admin member do and see?* Everything an admin can on lists, cards and comments, plus the board description and inviting people (by default). Not: renaming, visibility, closing, roles, settings. See R-MEMBER-07 and [`members.md`](observations/members.md).
2. *Can an admin edit or delete other people's comments?* Delete yes, edit no (R-COMMENT-02, R-COMMENT-03).
3. *Is there a read-only role on the free plan?* The Observer role exists but is a paid feature; it was used on a trial (R-MEMBER-07).
4. *Where do restored cards and lists land?* Beside their old neighbours, not at their old index and not at the end (R-LIST-07, R-CARD-09).
5. *Deleting an archived list or a closed board?* One confirmation each. A list's cards and history go with it; the log keeps one "deleted list" entry (R-LIST-08). A board's deletion doesn't ask for its name (R-BOARD-08).
6. *Can an archived card take new comments?* Yes (R-CARD-08).
7. *Length limits and trimming?* List names: trimmed, at most 512 characters. Label names: trimmed, no limit seen at 150. Board names: not trimmed, 600 characters accepted. Card titles: not trimmed, at most 16,384.
8. *Starred boards and order on home?* A starred section at the top; boards in alphabetical order; recently viewed most recent first (R-BOARD-01, R-BOARD-04).
9. *Start dates?* Allowed without a due date, and never after the due date (R-DATE-03).

**For a later observe session:**

- Can an observer restore archived items, and with "members and observers" commenting, can they comment?
- Does removing someone (rather than them leaving) take them off cards, and are they told?
- Does a role change reach the other person's open page without a reload?
- Are duplicate label names allowed?

**Design decisions for the build plan** (not for the product to answer):

10. **Restoring:** the product restores lists to their original position; the API restores to the end.
11. **Deleting:** the product deletes only after archiving and erases a deleted card's history; the API deletes directly and keeps a "deleted" entry in the log.
12. **Empty rename:** the product silently keeps the old name; the API returns 422.
13. **Roles:** the product allows several admins (now confirmed, R-MEMBER-05); the API has exactly one owner plus editors and viewers.
14. **Labels:** the product has 30 colours, unnamed labels and labels without a colour; the API has 6 colours and requires names.
15. **Boards:** closing a board is a new state the API doesn't have.
