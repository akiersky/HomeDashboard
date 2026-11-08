# ADR 0005: Deep Modules Inside `js/bundle.js`, Tested Through a Test Seam

- **Status:** Accepted
- **Date:** 2026-10-14
- **Owner:** `decisions` skill

## What was decided
1. The client stays one script: `js/bundle.js`, one IIFE, no build step. Inside it, the rules that used to be spread across view classes now live in modules with small interfaces: `ParentGate` (the Parent PIN), `ParentTasks`, `MissionLedger` (chores, routines, wildcards, stars, prizes), `CalendarFeed`, `HaList` and `MealPlan` (Home Assistant to-do lists), `StateManager` with `SettingsSchema` (the household data and its storage), and `Renderer` (when screens re-render). Views draw and ask; modules decide.
2. Modules receive what they depend on (the household store, a clock, Home Assistant, storage, the PIN dialog) as constructor arguments instead of reaching for globals, so each one runs without a DOM.
3. Tests live in `tests/` and use Node's built-in runner: `node --test "tests/**/*.test.js"`. `tests/helpers/load-bundle.js` runs the real `js/bundle.js` in Node with a stub `window`. When `window.__FD_TEST__` is set, the bundle hands its modules to the test and skips booting (search for "Test seam" at the end of the file).
4. A browser smoke suite in `tests/browser/` drives the real UI against a token-free copy of the app and a fake Home Assistant.

## Why
- Chore and star rules, calendar rules and sync rules were each implemented in several view classes. Every change touched several places, and real bugs hid in how the pieces were called: a PIN check that never blocked, a star animation measured on a row that was already replaced, Settings edits that reverted on reload.
- The project had no tests, so correctness depended on clicking through the app on the wall display.

## What was rejected and why
- **Splitting `bundle.js` back into ES module files:** the project did this before (`js/app.js`, `js/calendar.js`, ...); the copies drifted from the bundle and were deleted (see `js/README.md`). Separate files also all have to be copied to Home Assistant's `/local/` folder. The modules work as well inside one file, and tests load that file directly.
- **A bundler or framework:** "no build step" is a project constraint: static files served by Home Assistant or any HTTP server.
- **jsdom, Vitest or a `package.json`:** each would add `node_modules` to a project that has no dependencies. The modules are written to need no DOM, so the built-in runner is enough.
- **Testing only in the browser:** slow and not repeatable, and it cannot reach rules like the Sunday reset or last-write-wins sync. The browser suite stays as a second layer for the DOM wiring.

## Scope
Applies to `js/bundle.js` and `tests/`. Weather, the screensaver, the doorbell, the accessibility helpers and the touch-scroll fallback already had small interfaces and were left alone. This decision does not say how the file is ordered or named internally.
