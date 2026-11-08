# ADR 0009: Dual-Mode Home Assistant Authentication and HACS Packaging

- **Status:** Accepted
- **Date:** 2026-10-18
- **Owner:** `decisions` skill

## What was decided
1. **Dual-Mode Home Assistant Authentication:**
   - When running inside Home Assistant (as a Lovelace card or same-origin panel), `HAWebSocket` detects and reuses the active session (`window.hassConnection` or `this.hass.connection`). In this mode, no Home Assistant URL or Long-Lived Access Token is required.
   - When running outside Home Assistant (standalone kiosk, desktop browser, or development server), `HAWebSocket` falls back to the configured `haUrl` and `haToken`.
   - `haUserData` (storage in `frontend/set_user_data`) is marked ready automatically when a native Home Assistant connection is active.
   - Coordinate detection for live weather prefers WebSocket `get_config` over REST headers when a native connection is present.

2. **HACS Plugin Packaging:**
   - Packaged as a standard Lovelace card / frontend plugin defined in `hacs.json` pointing to `family-dashboard.js`.
   - Built via `node scripts/build.js` with zero dependencies, embedding the DOM template and styles into a custom web component `<family-dashboard>`.
   - Community users install via HACS → Frontend, and add the card to any dashboard in Panel Mode (`panel: true`).
   - Users desiring a dedicated sidebar entry can optionally declare `panel_custom` in `configuration.yaml`.

3. **The card runs the app in a same-origin `srcdoc` iframe.** Lovelace cards render inside shadow roots, where the app's ~270 `document.getElementById` calls and document-level CSS do not reach. The iframe keeps the app unchanged, still sees `window.parent.hassConnection`, shares `localStorage`, and the build embeds `data/dashboard-data.json` as the first-run seed (`window.__FD_SEED__`) because HACS ships a single file. Rejected: rewriting the app to be shadow-DOM-aware (large, risky).

## Why
Requiring a static Long-Lived Access Token when running inside Home Assistant created unnecessary setup friction, security exposure, and required separate URL configuration for local vs remote access (e.g. Nabu Casa). Bridging directly to Home Assistant's active connection provides a zero-configuration installation for community users while preserving full functionality for standalone kiosks.

## What was rejected and why
- **Pure Python Integration:** Rejected as the primary distribution because custom cards provide greater layout flexibility in Lovelace (e.g. kiosk mode, user access controls), have zero Python version breakage risks, and align directly with HACS Frontend distribution standards.
- **Requiring tokens in all environments:** Rejected because Home Assistant's frontend context already possesses an authenticated, auto-renewing WebSocket session.
