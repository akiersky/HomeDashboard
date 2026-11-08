# ADR 0011: Modular Source in `src/` with Zero-Dependency Build Compiler

- **Status:** Accepted
- **Date:** 2026-10-24
- **Owner:** `decisions` skill
- **Supersedes:** ADR 0005 (in part: source code authoring)

## What was decided
1. **Source Code Lives in Modular Files in `src/`:**
   - The monolithic 5,700-line `js/bundle.js` has been split into 18 focused, single-responsibility files in `src/`:
     - `src/helpers.js` (common utilities)
     - `src/weather.js` (weather engine & radar)
     - `src/state-manager.js` (state, settings schema, storage)
     - `src/kiosk-mode.js` (Home Assistant shell hiding & DOM manipulation)
     - `src/ha-websocket.js` (dual-mode WebSocket transport)
     - `src/parent-tasks.js` (parent task rules)
     - `src/mission-ledger.js` (chores, routines, wildcards, stars)
     - `src/ha-lists.js` (Home Assistant to-do entities)
     - `src/calendar-feed.js` (calendar events & queries)
     - `src/calendar-module.js` (calendar UI)
     - `src/chores-module.js` (chores UI & animations)
     - `src/meals-module.js` (dinner planner UI)
     - `src/parent-gate.js` (PIN gate)
     - `src/chores-admin.js` (chores admin panel UI)
     - `src/photo-frame.js` (screensaver UI)
     - `src/doorbell.js` (camera popup)
     - `src/renderer.js` (render coordinator)
     - `src/app.js` (app orchestration, lifecycle, test seam)

2. **Zero-Dependency Compilation via `scripts/build.js`:**
   - `node scripts/build.js` assembles `src/` into:
     - `js/bundle.js` for standalone browser testing and local development.
     - `family-dashboard.js` (with embedded HTML and CSS) for HACS Lovelace plugin distribution.
   - Requires zero external dependencies or `node_modules` (pure Node standard library `fs` and `path`).

3. **Automated Zero-Drift Verification:**
   - Added `tests/build.test.js`, which asserts on every run of `node --test "tests/**/*.test.js"` that `js/bundle.js` strictly matches the assembled output of `src/`.
   - If an edit is made in `src/` without recompiling, the test runner fails immediately with a clear message: `"Run 'node scripts/build.js' to recompile."`

## Why
ADR 0005 originally kept all code in `bundle.js` because earlier unbundled scripts had drifted out of sync without a build process, and adding heavy bundlers (Webpack, Vite, Rollup) violated the project's zero-dependency philosophy.

By using a lightweight, zero-dependency Node build script and coupling it with an automated test in `tests/build.test.js`, we achieve the best of both worlds:
- Authors work with bite-sized, organized files (~50 to 900 lines each instead of 5,700).
- Zero drift is strictly enforced by the test runner.
- The project remains completely dependency-free (no `package.json`, no `npm install`, instant tests).
- HACS distribution remains a clean, single-file bundle as expected by Home Assistant.

## What was rejected and why
- **Vite / Rollup / Webpack:** Rejected to preserve the project constraint of having zero npm dependencies and no `node_modules`.
- **Runtime unbundled script loading in Home Assistant:** Rejected because Lovelace plugins require a single entry-point resource file. Loading 18 files over network in Home Assistant causes latency, cache mismatches, and path resolution issues in `/hacsfiles/`.
