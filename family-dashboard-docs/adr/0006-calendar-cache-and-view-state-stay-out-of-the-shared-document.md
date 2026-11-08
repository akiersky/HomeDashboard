# ADR 0006: Calendar Cache and View State Stay Out of the Shared Household Document

- **Status:** Accepted
- **Date:** 2026-10-14
- **Owner:** `decisions` skill

## What was decided
1. Events fetched from members' Home Assistant calendars are a cache kept on the tablet (localStorage key `family_dashboard_calendar_v1`). They are not part of the household document, are never pushed to Home Assistant, and are replaced on every calendar sync.
2. Which member a tablet is showing is that tablet's own state. It is saved in the tablet's local copy, never pushed, never adopted from another tablet, and changing it does not count as an edit (`updatedAt` is not stamped).
3. Events a member adds in the dashboard still live in the household document and are shared.

## Why
The household document is shared by last write wins on `updatedAt`. The calendar sync (every 5 minutes) and every tap on a member pill used to stamp a newer `updatedAt` and push the whole document. A tablet that was up to a minute behind could therefore overwrite a chore or star change another tablet had just made. The pushed document also carried about three months of fetched events, and every tablet adopted whatever member another tablet happened to be showing.

## What was rejected and why
- **Per-field timestamps and merging:** a lot of code for a household with two or three tablets. Revisit if the number of tablets grows.
- **Keeping fetched events in the document but not stamping them:** they would still be pushed and adopted, and a copy from an older tablet would bring back a second source of truth for the same event.
- **Putting the cache in Home Assistant's user storage as well:** Home Assistant already is the source; the cache exists only so the calendar paints before the first sync finishes.

## Consequences
- Deleting a Home Assistant event in the dashboard only hides it until the next sync (it always came back at the next sync; now that is the stated behaviour).
- A Home Assistant event cannot be edited in the dashboard, so the event popover hides Edit for it and the calendar feed refuses to save one. An edit used to look saved until the next sync replaced it, and it also travelled to the other tablets in the household document.
- Documents written by earlier versions (events with `ha-` ids, `activeMemberId`, `theme`, `meals`) are cleaned when read: Home Assistant events move to the cache, the retired fields are dropped.
- The Parent PIN is still shared between tablets (it travels in the household document but is never exported).

## Scope
Applies to calendar events fetched from Home Assistant and to the member filter. Shopping and meal lists follow ADR 0008.
