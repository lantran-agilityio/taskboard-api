# Observation: members

- **Observed:** 2026-11-13
- **Account and plan:** two accounts. The first (the board's creator) was on a **premium trial**, so the paid Observer role could be used; the second was a new free account, invited to the scratch board "Observe Two" (private) from the Share dialog. The user logged in and out of each account; nothing was entered on their behalf. The second account was a Member, then an Admin, then an Observer, and finally left the board.

Write behaviour in our own words. No screenshots, copied text, colours or icons.

## What a user can do

- **Invite** (Share dialog): an email or name field, a role choice and a Share button. The role choice offers **Member** and **Observer** (Observer is marked as paid). **Admin can't be chosen when inviting**; it's given afterwards from the members list.
- **See the members:** the Share dialog lists everyone with their role. The viewer's own row comes first, marked "(you)". Each row also says whether the person is a workspace admin or a workspace guest. Before the invitee has finished signing up, their row says the account isn't created yet.
- **Change a role** (admin): each other person's row has a role menu with Admin, Member, Observer and "Remove from board". The change happens at once, with no confirmation.
- **Make someone an admin** (admin): Admin is greyed out for an account whose email isn't confirmed yet ("admins must have a confirmed email"). Once it is, Admin can be chosen, and the board then has **two admins**. An admin can also step another admin down to Member or Observer, or remove them.
- **Step down or leave** (admin): an admin's own role menu has Member, Observer and Leave board. As the **only** admin, all three are greyed out with the reason that a board needs at least one admin. With a second admin, Member and Leave board become available. Observer stayed greyed out for yourself.
- **Leave** (member or observer): from the board menu, or from your own role menu in the Share dialog, after a small confirmation saying you'll be taken off every card on the board. The page you're on doesn't change; on the next load, the board shows a "this board is private" page offering to send the admins a request to join.
- **Share link:** an admin can create a link that lets anyone with it join as a member, copy it, delete it, and change what role it gives. There is also a "join requests" tab, which only admins see.
- **Board permission settings** (board menu → Settings, admin):
  - **Commenting:** disabled, members (default), or members and observers. Two wider choices (workspace members, any user) are greyed out on a private board.
  - **Adding and removing members:** admins only, or all members (default).

## States

Roles are per board. What each one saw on the same board:

| | Admin | Member | Observer |
|---|---|---|---|
| Board, lists and cards | edit | edit | read only: no "add a card", no "add another list" |
| Card dialog | full | full | title, list name and comments only: no detail buttons, no description, no done circle, no comment box |
| Card menu | full | same as admin | copy, mirror, watch, share |
| Rename the board | yes | no (the title isn't editable) | no |
| Board description (About) | edit | edit | read |
| Visibility | change | greyed out | greyed out |
| Close board | in the menu | not in the menu | not in the menu |
| Share button and dialog | invite, change roles, remove, link, join requests | invite (default setting), see roles, can't change anyone's | no Share button in the header or menu |
| Others' comments | delete, but not edit | reply and react only | read |
| Own comments | edit and delete | edit and delete | still edit and delete (written while a member) |
| Leave | only with another admin | yes | yes |
| Star, watch, activity, archived items, labels, copy board | yes | yes | yes (menu entries present) |

- **The "About this board" panel** names the board's admins (the heading is plural) and shows the description. After a member saved a description, they saw a one-off pop-up with it and a note to contact the admin to learn more.
- **On the second account's home page**, a board it was invited to appears under "guest workspaces", because it isn't in that account's own workspace.
- **Stars are per person:** the board starred by the first account showed unstarred for the second.

## Rules

- **A board always has at least one admin**, and can have several. The last admin can't step down or leave; another admin can be added first.
- **Only admins** rename the board, change visibility, close it, change roles and remove others, and change the board's settings. With the default setting, **members can invite** people too.
- **Admins can't edit other people's comments**, but they can delete them. Members can't do either.
- **Observers are read-only:** with the default setting they can't comment either. They can still star, watch, read the activity log and leave.
- **Leaving** takes you off every card on the board. On a private board you lose access completely.
- **Inviting doesn't offer Admin.** New people join as Member or Observer.

## Edge cases, empty and error states

- An invitee who hasn't finished signing up can't be made admin, and their row says the account isn't created yet.
- Leaving didn't change the open page: the board stayed on screen (with "Leave board" gone from the menu) until it was reloaded.
- Admin can't be offered to an unconfirmed email, so a board can't be handed to someone who never signed up.

## Open questions

- Can an observer restore archived items? (Nothing was archived when the second account was an observer.)
- With "members and observers" commenting, do observers get the comment box? (Not changed from the default.)
- Does removing someone (rather than them leaving) also take them off cards, and are they told?
- Does a role change reach the other person's open page without a reload? (Each switch here reloaded the board.)
