# JavaScript Architecture

The source code is organized into modular files in [`src/`](../src/):

| File | Module / Responsibility |
| --- | --- |
| `src/helpers.js` | Shared utility helpers (`esc`, `memberColor`, `styleEvent`, `hexRgb`) |
| `src/weather.js` | Live Open-Meteo weather API, AQI calculation, Windy.com radar modal, and clock |
| `src/night-mode.js` | `NightMode`: whether it is night, from set times or sunset and sunrise |
| `src/state-manager.js` | Household state (`StateManager`), `SettingsSchema`, defaults, localStorage, HA remote sync |
| `src/kiosk-mode.js` | Home Assistant Kiosk Mode: switches WallPanel on per device through `wp_*` URL parameters, with an escape hatch |
| `src/ha-websocket.js` | `HAWebSocket` transport: dual-mode auth (native HA session vs LLAT token), subscriptions |
| `src/parent-tasks.js` | `ParentTasks`: repeat, undo, board buckets, calendar projection |
| `src/mission-ledger.js` | `MissionLedger`: chores, routines, wildcards, stars, prizes, daily/weekly/monthly resets |
| `src/ha-lists.js` | `HaList`, `MealPlan`, `storeList`: Home Assistant to-do entities with local fallback |
| `src/calendar-feed.js` | `CalendarFeed`: merging local and HA events, day/agenda queries, column layout |
| `src/calendar-module.js` | `CalendarModule`: calendar view, time grid, day columns, event creation modals |
| `src/chores-module.js` | `ChoresModule`: chore chart, routines, star redemption, confetti animation |
| `src/meals-module.js` | `MealsModule`: dinner planner, recipe/meal ideas bank, shopping list |
| `src/parent-gate.js` | `ParentGate`: Parent PIN gate and new-PIN setup flow (`await gate.ask(...)`) |
| `src/chores-admin.js` | `ChoresAdminModule`: Parent management modal for chores, stars, and rewards |
| `src/photo-frame.js` | `PhotoFrameModule`: Immich photo screensaver, idle timeout, Ken Burns drift animation |
| `src/doorbell.js` | `DoorbellModule`: Live doorbell camera popup and chime on doorbell press |
| `src/renderer.js` | `Renderer`: Screen rendering coordinator, keeping scroll positions across updates |
| `src/app.js` | `FamilyDashboardApp`: Main controller, settings modal tabs, touch scroll, boot lifecycle |

## Compilation & Zero-Drift Guarantee

[`scripts/build.js`](../scripts/build.js) compiles `src/` with zero dependencies into:
1. `js/bundle.js` — for standalone testing and local browser use.
2. `family-dashboard.js` — the distribution bundle for HACS Lovelace plugin installs.

Run the build script anytime you edit `src/`:
```sh
node scripts/build.js
```

[`tests/build.test.js`](../tests/build.test.js) verifies that `js/bundle.js` matches `src/` exactly on every test run (`node --test "tests/**/*.test.js"`), ensuring the bundle never silently drifts from source.
