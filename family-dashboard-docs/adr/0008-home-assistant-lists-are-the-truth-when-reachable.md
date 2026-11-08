# ADR 0008: Home Assistant To-Do Lists Are the Truth When Reachable; Offline Changes Stay Local

- **Status:** Accepted
- **Date:** 2026-10-14
- **Owner:** `decisions` skill

## What was decided
The shopping list, the meal ideas and the dinner plan are Home Assistant to-do entities, each with a local copy:
1. With an entity configured and Home Assistant reachable, the entity's list is what is shown, even when it is empty, and it is kept as the local copy.
2. When Home Assistant cannot be reached, the local copy is shown and changes are applied to it. The user is warned ("Saved on this tablet only").
3. The next successful load replaces the local copy with the entity's list, so changes made offline are dropped. With no entity configured the local copy is the list.
4. The shopping list is re-read every minute so changes made elsewhere (Google Keep on a phone) appear on a tablet that never reloads. That re-read pauses while a change could not be sent, so the change is not wiped within the minute; a later change that gets through, or a reload, resumes it and replaces the local copy as in point 3.
5. The dinner plan covers the next seven days only; the calendar asks the plan for a date's dinner and gets nothing outside that window.

## Why
The previous code kept two stores per list and disagreed with itself: an item typed while Home Assistant was down was dropped without a message, local-mode changes did not re-render, the meal plan was published to the calendar through a global variable keyed by weekday only (so every Monday in the calendar showed the same dinner), and a list module with no screen at all kept fetching on every change.

## What was rejected and why
- **Queue offline writes and replay them:** needs conflict rules (renamed or removed elsewhere in the meantime), retries and a visible "pending" state. Kitchen use is mostly online; a warning is enough.
- **Show an error and discard the change (the old behaviour for shopping items):** the item simply vanished.
- **Treat an empty Home Assistant list as "not configured" and show the local copy (the old behaviour for meal ideas):** hides the truth when someone empties the list on purpose.

## Scope
Applies to the three lists. Calendars follow ADR 0006. Items from Home Assistant keep their ids; a local item gets a `li-` id until the next load.
