# ADR 0007: Saved Edits Win Over `config.js` for the Member Fields Settings Can Edit

- **Status:** Accepted
- **Date:** 2026-10-14
- **Owner:** `decisions` skill

## What was decided
When household data is loaded, adopted from Home Assistant or imported, the order is: built-in defaults, then the saved document, then `config.js`. `config.js` still wins for every setting it defines (connection, entities, doorbell, weather). Members are the exception. `config.js` decides who the members are and their name, role and colour; what was saved for a member survives: stars, goals, icon and calendar entity.

## Why
Settings has fields for a member's icon and calendar entity, but the whole member was rebuilt from `config.js` on every load, so those edits could never stick. Stars and goals had the same problem and were fixed in dcb95bf ("config no longer overwrites saved goals"); icon and calendar entity were missed.

## What was rejected and why
- **`config.js` always wins (the old behaviour for icon and calendar entity):** an edit in Settings reverts silently on the next reload, which makes the field pointless.
- **Saved data always wins, for settings too:** a new Home Assistant URL or token in `config.js` would be ignored once a tablet has saved data. `config.js` is the install's environment file and has to keep that power.
- **Recording which field was edited last and by whom:** more state than this household needs.

## Consequences
A calendar entity or icon changed in `config.js` after a tablet has saved data is ignored for that member field; change it in Settings instead (or reset the data).

## Scope
Applies to the member fields `stars`, `targetReward`, `targetStars`, `goalDoneFor`, `avatar` and `haCalendarEntity`. The same revert still affects settings that `config.js` defines and Settings also edits (for example the shopping list entity); that choice is left open in `UNKNOWNS.md`.
