# ADR 0014: Night Mode Dims With a Black Layer and Takes Sun Times From the Weather Fetch

- **Status:** Accepted
- **Date:** 2026-11-06
- **Owner:** `decisions` skill

## What was decided
1. Night mode is a black full-screen layer whose opacity sets the brightness (5% to 80%), not a change to the tablet's backlight.
2. "Sunset to sunrise" reads today's times from the Open-Meteo weather request the dashboard already makes. Until that has loaded, or if it fails, the set start and stop times apply.
3. While dimmed, the layer catches the first tap, which only wakes the screen. It dims again after the idle timeout (`idleSaverMinutes`).
4. The doorbell popup sits above the layer, so a ring at night is shown at full brightness. Everything else, including the screensaver, sits below it.
5. The settings are household data like the other screensaver settings, so every tablet shares them.

## Why
A web page cannot reach the backlight, and the dashboard runs in several different ways (Home Assistant, a standalone browser, Docker). The layer works in all of them with no setup. The weather request also works in all of them and already uses the household's location.

The first-tap rule exists because nobody can see what they are pressing at 5%: a tap passing through could tick a chore or open the wrong thing. It also means a parent can always get back to Settings, however low the brightness was set.

## What was rejected and why
- **Controlling the real backlight (Fully Kiosk's JavaScript API, a Home Assistant `number` or `light` entity):** specific to one kiosk browser or device, and it needs per-tablet setup. Worth adding as an option if the glow from the layer is still too much; see Consequences.
- **Home Assistant's `sun.sun`:** the auto theme uses it, but it does not exist in Docker mode (ADR 0013), so night mode would need a fallback there anyway.
- **Calculating sunrise and sunset locally:** no network needed, but it adds a solar formula to own and test when the weather response can carry the answer with two extra words in the URL.
- **Letting taps pass through the layer:** one less tap, but presses buttons nobody can see.

## Consequences
The backlight stays on, so a dimmed LCD still glows in a dark room and uses the same power. A tablet with no internet follows the set times in sun mode. All tablets dim on the same schedule; a bedroom tablet cannot have its own without moving these settings to `scope: 'device'`. Sun mode has no offset (such as 30 minutes after sunset).
