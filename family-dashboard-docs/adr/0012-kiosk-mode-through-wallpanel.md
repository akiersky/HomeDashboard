# ADR 0012: Kiosk Mode Through the WallPanel Integration

- **Status:** Accepted (supersedes [ADR 0010](0010-builtin-home-assistant-kiosk-mode.md))
- **Date:** 2026-10-25
- **Owner:** `decisions` skill

## What was decided
- The Kiosk Mode setting (`haKioskMode`, still device-scoped) now switches on [WallPanel](https://github.com/j-a-n/lovelace-wallpanel) instead of injecting styles into Home Assistant's shadow DOM.
- WallPanel reads `wp_*` URL parameters over the dashboard's `wallpanel:` YAML. The setting adds `wp_enabled=true&wp_hide_toolbar=true&wp_hide_sidebar=true&wp_idle_time=0` to the Home Assistant page URL (and removes them when switched off), reloading the page only when the URL changes. It runs at boot and about 1.5 seconds after settings are saved, so the save reaches Home Assistant before the reload.
- The URL escape (`?disable_kiosk`, `?disable_km`, `?kiosk=0`) still wins: it never adds the parameters, and it removes them if present.
- Settings links to WallPanel, which the user installs (HACS or GitHub).

## Why
The injected CSS hid the sidebar but left its width reserved, so a gap stayed on the left on Home Assistant 2026.10. WallPanel is maintained against Home Assistant's frontend, so it keeps working through upgrades.

## What was rejected and why
- **Keeping the style injection and patching the leftover gap:** a generic "zero the margins" pass fixed a mock page but not the real Home Assistant, and it would break on every frontend change.
- **Editing the dashboard's `wallpanel:` YAML from the app:** the setting is per device, and the YAML is shared by every device that opens the dashboard.

## Consequences
- Kiosk Mode needs WallPanel installed; without it the toggle does nothing.
- WallPanel reads the URL parameters from the page URL, so navigating inside Home Assistant to a URL without them can drop kiosk mode until the next reload.
