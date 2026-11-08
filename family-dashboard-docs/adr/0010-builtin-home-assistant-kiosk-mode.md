# ADR 0010: Built-in Home Assistant Kiosk Mode via Shadow DOM Style Injection

- **Status:** Superseded by [ADR 0012](0012-kiosk-mode-through-wallpanel.md)
- **Date:** 2026-10-24
- **Owner:** `decisions` skill

## What was decided
1. **Device-Scoped Kiosk Mode Setting:**
   - Added `haKioskMode` (boolean, default `false`) to `SETTINGS` with `scope: 'device'`.
   - Toggleable directly in the dashboard Settings modal under **Home Assistant Integration** (protected by Parent PIN).
   - Because it is device-scoped, it persists in `localStorage` on the tablet where it is enabled, without forcing desktop workstations or mobile phones into kiosk mode via shared document sync.
   - Can also be seeded in `config.js` via `haKioskMode: true`.

2. **Shadow DOM Style Injection:**
   - In Home Assistant, navigation and header elements live inside nested Shadow DOMs (`home-assistant-main` and `hui-root`).
   - When enabled, `applyHaKioskMode(true)` injects scoped `<style id="fd-ha-kiosk-style">` tags into:
     - `haDoc.head` (collapsing `--app-drawer-width` and `--header-height` CSS variables).
     - `home-assistant-main.shadowRoot` (hiding `ha-sidebar`, `#drawer`, and `.mdc-drawer`).
     - `ha-panel-lovelace` and `hui-root.shadowRoot` (hiding `app-header`, `app-toolbar`, `ha-top-app-bar-fixed`, and removing `#view` top padding).
   - When disabled, all injected style elements are immediately removed and a `resize` event is dispatched on the window, cleanly restoring Home Assistant's native header and sidebar without requiring a page reload.

3. **Transition Resilience via MutationObserver:**
   - Home Assistant frequently recreates views or resolvers during navigation or entity updates. A lightweight `MutationObserver` on `home-assistant-main` re-applies kiosk styles if the panel or view root is replaced.

4. **URL Safety Escape:**
   - Appending `?disable_kiosk`, `?disable_km`, or `?kiosk=0` / `?kiosk=false` to the dashboard URL immediately bypasses kiosk mode, ensuring administrators never lock themselves out of Home Assistant controls.

## Why
Wall-mounted kitchen touchscreens require an edge-to-edge, distraction-free display. Requiring users to install and maintain third-party kiosk extensions (like `kiosk-mode` or `card-mod` themes) creates external dependencies, brittle YAML configurations, and potential breakage during Home Assistant core upgrades. Building the capability directly into Family Dashboard provides an effortless one-click setup.

## What was rejected and why
- **Syncing Kiosk Mode across devices:** Rejected because wall-mounted kitchen tablets need kiosk mode, while family members viewing the dashboard from desktop browsers or phones still need Home Assistant's sidebar and navigation.
- **Hiding Family Dashboard's own header:** Rejected because the user specifically requested hiding Home Assistant's header and sidebar, while keeping the Family Dashboard interface and settings gear accessible.
- **Requiring external HACS dependencies (e.g. `kiosk-mode`):** Rejected to keep Family Dashboard truly zero-dependency and installable in a single step.
