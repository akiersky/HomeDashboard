# Unknowns

- Confirm target hardware/deployment mode (wall-mounted touchscreen/kiosk tablet vs desktop browser).
- Confirm whether to formalize existing CSS custom property tokens in `styles.css` into `DESIGN.md` via `/styleguide forge`.

## From the architecture review (2026-10-14)

- Should a Settings edit win over `config.js` for the settings it defines (Home Assistant URL, shopping list entity, Keep URL, doorbell, weather)? Today `config.js` wins on every load, so those Settings fields revert on reload. Members already work the other way (ADR 0007).
- Meal ideas: when the Home Assistant list is reachable but empty, the library now shows empty; it used to show the locally saved ideas. On the first load after upgrading, a tablet whose `todo.meal_ideas` exists but has no items loses the twelve sample ideas from the library (they are still in `data/dashboard-data.json`, and "Reset data" brings them back). The old behaviour already lost them as soon as one idea was added. Confirm empty-means-empty is what you want (ADR 0008).
- Changes made offline to the shopping list, meal ideas or dinner plan are dropped at the next successful load, with a "saved on this tablet only" warning. Is that enough, or should offline changes be queued and replayed?
- Events keep only a start date, so a multi-day event shows on its first day only. This is now one place to change (`CalendarFeed.fromHa`); it needs a decision on how a span should look.
- Monthly and yearly repeating tasks due on the 29th to the 31st drift: JavaScript month overflow turns Jan 31 plus a month into early March.
- The dinner plan stores `Mon|Taco Night` items and only covers the next seven days, so a planner that spans several weeks needs dated items.
- Is the Parent PIN meant to be shared by all tablets? It travels in the household document (never in exports), so a change on one tablet reaches the others.
- The screensaver, the auto theme and the doorbell download every Home Assistant entity state to read one (up to 11 times per screensaver slide). Consider a state subscription.
- The chore dialog's "Both kids" option creates one independent chore per kid; confirm a shared chore (one tick for both) is not wanted.
- Events from Home Assistant calendars (Google) can no longer be edited in the dashboard: the popover hides Edit for them. Edits never reached Google and were undone at the next sync (every 5 minutes). Delete still hides such an event until the next sync. Should a Google event be editable as a local override, and if so how should the original be kept from coming back?
- A parent's hand adjustment of stars (the plus and minus buttons in Manage) is not in the kid's "Recent stars", as before. Logging each click would push real entries out of the 20 kept. Should adjustments show, perhaps as one entry per sitting?
