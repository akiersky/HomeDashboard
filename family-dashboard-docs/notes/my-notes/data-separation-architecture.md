# Data Separation Architecture & Backup Strategy

- **Date**: 2026-10-03
- **Focus**: Decoupling household data from application logic & client-side state backup/restore

## Context & Motivation
As the dashboard application code (`js/bundle.js`, `index.html`, `styles.css`) is updated and deployed to Home Assistant, household data (chores, routines, star points, weekly meal plans, meal ideas library, custom maintenance tasks, and settings) needed to be safely decoupled so that continuous code improvements never overwrite or erase living family state.

## Architecture

1. **Unified Baseline Data File (`data/dashboard-data.json`)**:
   - Single cohesive JSON file containing baseline seed data: `members`, `chores`, `routines`, `parentTasks`, `recurringReminders`, `kidAchievements`, `meals`, `groceries`, `mealIdeas`, and `settings`.
   - Single-file model was chosen over modular multi-file format to ensure atomic relational integrity across member IDs and enable effortless 1-click backup/migration.

2. **Hydration Lifecycle**:
   - **First Launch / Clean Browser**: If browser `localStorage` is empty, `StateManager.loadBaselineIfEmpty()` fetches `data/dashboard-data.json` with cache-busting, applies any `config.js` environment overrides, and seeds local storage automatically.
   - **Active Runtime**: Local changes persist immediately to `localStorage`.
   - **Code Updates**: When updating app code or pulling new git commits, client-side data remains intact in `localStorage`.

3. **In-App Backup & Restore (Settings -> General -> Data & Backup)**:
   - **Export Data Backup (JSON)**: Serializes live client state into pretty-printed `dashboard-data.json` and triggers browser download.
   - **Import Data Backup (JSON)**: Reads user-uploaded JSON file, validates schema against core dashboard properties, merges with config overrides, and reloads UI.
   - **Reset Data to Baseline**: Clears local storage and re-fetches `./data/dashboard-data.json` from the server.
   - **Household Server Baseline**: Dropping an exported `dashboard-data.json` into `/config/www/data/` establishes it as the default baseline across all household tablets.
