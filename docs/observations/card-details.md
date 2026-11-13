# Observation: card details

- **Observed:** 2026-11-09; second session 2026-11-13 (start dates, checklist item assignees and dates, label names, comments by others)
- **Account and plan:** free workspace, on Card C of the scratch board from [boards.md](boards.md). The board has one member, so assigning other people was not seen. Attachments and the AI checklist (paid) were noted but not tried.

## What a user can do

**The card dialog's buttons** are add, labels, dates, checklist, members and attachment. Once a detail is set, it gets its own section near the top (members, labels, due date) and its button leaves the row. Because of this, the button row shifts as details are added.

### Labels

- **Labels belong to the board** and are picked per card from a picker. The picker has a search box, a tick box and an edit button for each label, "create a new label", and a colourblind-friendly mode.
- **Default labels:** a new board starts with six unnamed labels, one per colour: green, yellow, orange, red, purple and blue.
- **Creating a label:**
  - It has an optional title and a colour from 30: 10 hues (green, yellow, orange, red, purple, blue, sky, lime, pink, grey), each in a subtle, normal or bold shade.
  - "Remove colour" makes a label with no colour.
  - A label created from a card's picker is applied to that card straight away.
- **Editing a label** changes its title and colour. Deleting it asks for confirmation.
- **Label titles** (2026-11-13) are trimmed, and the field has no length limit: a 150-character title was kept whole.

### Dates

- **The picker has:**
  - a calendar,
  - an optional start date,
  - a due date with a time (it defaults to tomorrow, at the current time),
  - a "recurring" choice (default never),
  - a due-date reminder (default one day before; sent to the card's members and watchers),
  - Save and Remove.
- **Start date** (2026-11-13): a date with no time, defaulting to today when ticked.
  - It can be set **without a due date**; the card then shows "Started: <date>" and the details section is titled "Start date". "Recurring" is greyed out without a due date.
  - **Start never comes after due.** Setting the due date before the start moves the start to the day before the due date; setting the start after the due date moves the due date to the day after. The picker can't be saved with them the wrong way round.
  - With both, the card's front and details show a range ("Nov 20 – Nov 21, 3:33 PM").
  - Setting a start date is **not logged**; only the due date is ("set this card to be due …").
- **Due badge on the card's front:**
  - a past due date is allowed, and the badge turns red with an "overdue" tag;
  - marking the card done turns it green with a "complete" tag.

### Checklist

- **Adding:** a card can have checklists, each with a title (default "Checklist").
- **Items:**
  - they're added one after another, and the field stays open between them;
  - each item can also take its own assignee and due date. These are a **paid** feature ("advanced checklists"); they worked on 2026-11-13 only because of the trial. Both can be set while adding an item or later from the item's row.
  - **Item assignee:** picked from the board's members. It shows as an avatar on the item row. It does **not** add the person to the card's members, and it isn't logged.
  - **Item due date:** a date and time (no start date), with a reminder sent to the item's assignee. It may be later than the card's own due date. It shows on the item row, and the card's front checklist badge adds the nearest item date ("0/1 • Nov 25").
- **Ticking an item** strikes it through and updates a percentage bar. A "hide checked items" toggle appears, and the card's front shows done/total (e.g. 1/2).
- **A checklist can be deleted** as a whole.

### Members (assignees)

- **The picker searches the board's members only.** Picking someone adds their avatar to the card's members section and to the card's front.
- **Assigning yourself** is logged as "joined this card". It seems to make you watch the card too: an eye icon appears.

### Comments

- **Writing:** a box at the top of "comments and activity" opens a rich-text editor with formatting and an "insert" menu, plus Save.
- **Display:** comments show newest first, mixed with activity entries. Each one shows the author, a relative time, a reaction button, Edit and Delete.
- **Editing** happens in place, with Save and "discard changes". An edited comment is marked "(edited)".
- **Each comment has its own link.**
- **Others' comments** (2026-11-13, two accounts): a member sees only a reaction button and Reply on someone else's comment. An admin can **delete** others' comments but **not edit** them; Edit stays with the author. An observer can't write comments (with the board's default setting), but still had Edit and Delete on a comment written earlier as a member. Writing a comment ticks "watch" for the writer. See [members.md](members.md).
- **The card's front** shows a comment count.

## States

- **Due date:**
  - none,
  - upcoming (not observed with a date in the future),
  - overdue (red),
  - complete (green, when the card is marked done).
- **Checklist progress** runs from 0% to 100%. The card's front shows done/total.

## Rules

- **The card's done flag is the due date's "complete".** Marking the card done turns its due badge green, and done also works with no due date (see [cards.md](cards.md)). Our API's `due_complete` is the same idea, but it's named after the due date.
- **Every detail change is logged on the card**, in plain words: "set this card to be due yesterday at 4:08 PM", "completed Step one on this card", "added Checklist to this card", "joined this card", "marked this card as complete".
- **Deleting a label** removes it from every card and can't be undone.
- **Deleting a comment** asks for confirmation: it's permanent and can't be undone.
- **Labels can share a colour.** The picker groups labels by colour.

## Edge cases, empty and error states

- A label can have no title (just a colour) or no colour (just a title).
- The due date may be in the past when it's set.

## Open questions

- How are reminders delivered, and what does "recurring" do on the free plan?
- How do @mentions in comments work, and who gets notified?
- How do checklist items convert to cards, and can items be reordered?
- Are duplicate label names allowed?
