# Reverse-engineering workflow

We study Trello's public behaviour and turn it into our own requirements, UI prototype and build plan. The API in this repo is the backend the plan builds on; its one-page spec is [Taskboard API: one-page spec](https://claude.ai/artifact/SZ1Snfsx54LWBUL2beC14Y).

## Phases

Each phase is its own Claude Code session and ends with a committed file.

1. **Observe** (roadmap step 12): Claude drives Chrome on Trello, one area at a time; you log in yourself. Notes go in [`observations/`](observations/), one file per area, copied from [`observations/_template.md`](observations/_template.md).
2. **Requirements** (step 13): the observations become [`requirements.md`](requirements.md), each with an ID, acceptance criteria and a confirmed/unconfirmed status.
3. **Prototype** (step 14): [`../prototype/index.html`](../prototype/), a clickable single-file UI with fake data and our own design, built from `requirements.md` only.
4. **Build plan** (step 15): [`build-plan.md`](build-plan.md) maps each requirement to the API, lists the gaps as new roadmap steps, and orders the frontend build.

## Clean-room rules

- Observe sessions describe; they don't design. Design sessions never open Trello.
- Nothing from the product goes in the repo: no screenshots, copied text, logo, name in the UI, colours or icons.
- A design question the requirements can't answer becomes an open question in `requirements.md`, answered by the next observe session.

## Files

| File | Holds | Written in |
| --- | --- | --- |
| `observations/<area>.md` | What Trello does in one area, in our own words | Step 12 |
| `requirements.md` | Numbered requirements with acceptance criteria | Step 13 |
| `../prototype/index.html` | Clickable UI prototype with fake data | Step 14 |
| `build-plan.md` | Requirement → API coverage, gaps, frontend build order | Step 15 |
