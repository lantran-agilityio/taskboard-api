# Retrospective

Written on 2026-11-16, after step 33. It looks back on the whole exercise: observing a product, turning that into requirements, a prototype and a build plan, then building the frontend from the plan and checking it. The detail is in [`build-plan.md`](build-plan.md). This file says what worked, what the plan got wrong, and what to do differently next time.

## Timeline

| Date | Steps | What happened |
| --- | --- | --- |
| 2026-11-09 | 12–15 | All four phases in one day: three observe sessions (boards; lists and cards; card details), then requirements, prototype and build plan, each committed as it was finished |
| 2026-11-10 | 16–21 | The API gaps the plan found: default labels, descriptions and stars, closed boards, restore in place and sorting, reads for the UI, checklists |
| 2026-11-11 to 11-13 | 22–28 | The frontend, built in the plan's order, screen by screen |
| 2026-11-13 | 29–31 | Check against the plan (4 issues), two people at once (2 issues), second observe session |
| 2026-11-13 to 11-16 | 32–33 | The deferred requirements and touch and keyboard moves, then a recheck in a real browser (1 issue) |

## What worked

- **The API was there before the plan.** The build plan could map every requirement to a real endpoint, not an imagined one, and it showed the gaps exactly: at first ✓ 28 · ◐ 11 · ✗ 10 · — 3, which became six small API steps (16–21) before any frontend work.
- **One committed file per phase.** Every session started from the file the last one left, not from a summary of a long conversation. That mattered most for the second observe session, two days and many sessions after the first.
- **Open questions instead of guesses.** When the prototype or plan needed something the requirements didn't say, it became a numbered question rather than an assumption. Step 31 answered all nine in one session.
- **Decisions written down with their reasons** (D1–D13). Where the build deliberately differs from the product (one owner, D5; no comments on archived cards, D10; the API's 422 for an empty name, D4), the reason is in the plan, so a later difference reads as a choice, not a bug.
- **Clicking through every requirement ID.** Steps 29 and 33 checked the real app requirement by requirement, as the prototype had been checked. That found five of the seven issues; the tests had passed for all of them.

## What the plan got wrong

The seven issues fall into four kinds:

| Kind | Issues | Why the plan missed it |
| --- | --- | --- |
| The log's words, not just its entries | 1 (board creation not logged), 2 (renames didn't say from what) | The plan checked that an endpoint existed and published an event, not what the log would say from it. Issue 2 only shows when the earlier entry is on another page |
| Typing faster than a save | 3 (titles typed in "Add a card" lost), 7 (the first checklist item lost) | The tests' fake API answers at once, so there's never a gap between a save and the next key. Against a real server the gap is a round trip |
| State held outside the board's data | 5 (a card deleted by someone else stayed open), 6 (a role change didn't reach the person) | The plan's realtime risk was about drag order, so step 25 was tested by one person. The two-person check waited until step 30 |
| Wording | 4 ("1 cards") | Nothing to learn beyond "read the hover text too" |

The plan was also wrong once by design: step 25 said the frontend would skip its own echoed events by `actor_id`. The build applied every event instead, because applying one is idempotent, and that also kept a user's other tabs in step. Step 29 changed the plan to match.

Of the inferred requirements, the three marked `unconfirmed` (R-MEMBER-05, R-DATE-03, R-CHECK-05) were all confirmed in step 31. The one place inference was wrong was a decision, not a requirement: D10 assumed the product doesn't take comments on archived cards, and it does.

## Next time

- **Have the plan say what the user will read**, not only which endpoint covers a requirement: for logs, notifications and counts, the exact sentence. Issues 1 and 2 would have been gaps in step 15, not finds in step 29.
- **Give the fake API a delay in some tests.** A test that types the next title while the first save is still pending would have caught issues 3 and 7.
- **Test with two people as soon as there are live updates** (step 24 here), not after the build. Anything that holds its own copy of the board's data (an open dialog, a role) needs a second person to change it.
- **Keep the four phases in one day only when the area is small.** It worked here because the product's core is small and the API already existed; a bigger product would need the observe sessions spread out, with requirements written after each.

## Still open

- **Touch dragging on a real phone.** Step 33 checked it with touch pointer events in Chrome; how it feels under a finger is still to try.
- **Four questions for a later observe session**, listed under "Open questions" in [`requirements.md`](requirements.md). None changes the plan.
- **Several admins** (R-MEMBER-05) and who may comment and invite (R-MEMBER-09) are out of scope (D5). Building them would change the role model, so they'd need their own step in the plan.
