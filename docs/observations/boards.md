# Observation: boards

- **Observed:** 2026-11-09; second session 2026-11-13 with a second account (members, roles, home page, deleting)
- **Account and plan:** free workspace with one existing board. A scratch board was created for this session. Features marked as paid were noted but not explored. On 2026-11-13 the account was on a **premium trial** (14 days left), so some paid features (Observer role, item assignees and dates) could be used; they are marked as paid here.

## What a user can do

- **See their boards:** the home page groups boards by workspace and shows a "recently viewed" row. Each board is a tile with its background and name.
- **Create a board:** from a "create new board" tile, either blank or from a template. The blank form has:
  - a background picker (photos plus solid colours or gradients, with a live preview of the board),
  - a required title,
  - visibility (Private, Workspace or Public).
- **After creating:** the new board opens at once, empty, with the cursor in the "add a list" field.
- **Rename:** click the title in the board header, edit it in place, and press Enter to save.
- **Star / unstar:** a toggle in the board header.
- **Board menu:**
  - about (description), visibility, print/export, star,
  - settings, change background, labels, automation, add-ons,
  - activity, archived items,
  - watch, copy board, email-to-board, close board.
  - Some entries are locked behind a paid plan.
- **Activity:** the menu shows the board's history, newest first, with "All" and "Comments" tabs. Each entry names who did what and when, for example created, added to a workspace, and renamed with the old name.
- **Close a board:** from the menu, after a small confirmation that says it can be reopened later from the boards page.
- **Reopen a board:** from the closed-boards dialog. You pick the workspace it goes back into.
- **Delete a board:** only from the closed-boards dialog. An open board can't be deleted directly.
- **Share:**
  - invite by email or name with a role (Member; Observer is paid),
  - make a share link,
  - see a members list and a "join requests" tab.

## States

- **Open:** fully editable by those allowed.
- **Closed:**
  - The board can still be opened, but it's read-only.
  - A banner explains it's closed and offers "reopen".
  - Add/edit controls and most header tools disappear.
  - It leaves the workspace list and the "recently viewed" row.
  - It appears in a "closed boards" dialog, which has a filter, and each row has Reopen and Delete.
- **Starred:** shown by the filled toggle in the header. On the home page (2026-11-13), starred boards get their own **Starred boards** section at the top, above "recently viewed", and still appear in the other sections with a filled star on the tile.
- **Empty closed-boards list:** shows "no boards have been closed".

## Rules

- A title of only spaces counts as empty. The create button stays disabled and a "title is required" hint shows.
- Clearing the title while renaming and saving changes nothing: the old title comes back, with no error message.
- After a rename, the browser tab title updates, but the URL slug keeps the old name.
- **Board names** (2026-11-13) keep surrounding spaces (the tab title shows them trimmed). The field has no length limit; a 600-character name was accepted.
- **Home page order** (2026-11-13): a workspace's board tiles are in alphabetical order (a board created last but named "Alpha" came first); "recently viewed" is most recent first.
- **Deleting a closed board** (2026-11-13) asks once, in a small popover, that all its lists, cards and history will be deleted with no undo and it can't be reopened. It doesn't ask for the board's name. A short "board deleted" notice follows, and the closed-boards list says none are closed.
- The creator becomes the board's admin.
- **At least one admin:** a board always has at least one admin. The only admin can't step down to member or leave, and those options are disabled with that reason. More than one admin **is** allowed (confirmed 2026-11-13 with a second account; see [members.md](members.md)), unlike our API's single owner.
- **Visibility:**
  - Private: only board members see it; workspace admins can still close it or remove members.
  - Workspace: everyone in the workspace can see and edit it.
  - Public: anyone with the link can see it; only members can edit.
- **Activity log:** creating, adding to a workspace and renaming are each logged.
- **Closing vs deleting:** closing is reversible (an archive), and deleting is a separate, later step.

## Edge cases, empty and error states

- If you dismiss the "add list" field on a new board, an "add a list" button is left.
- Paid-only features show as greyed menu entries with an upgrade badge, not hidden.
- Reopening asks for a workspace even when there is only one.

## Open questions

- What a non-admin member sees in the board menu and the Share dialog: answered in [members.md](members.md).
- Copy board: what is copied (lists, cards, members, labels)?
