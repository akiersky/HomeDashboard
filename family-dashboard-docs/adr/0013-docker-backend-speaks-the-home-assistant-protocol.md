# ADR 0013: The Docker Backend Speaks the Slice of Home Assistant's API the Client Uses

- **Status:** Accepted
- **Date:** 2026-10-26
- **Owner:** `decisions` skill

## What was decided
1. A second way to run: `docker compose up` starts `server/`, a small Node server that serves the dashboard and answers the Home Assistant WebSocket and HTTP calls the client already makes (`frontend/get_user_data`, `todo/item/list`, `todo.*` and `calendar.get_events` services, `get_states`, `get_config`, `homeassistant.update_entity`, `/api/image_proxy`, `/api/camera_proxy_stream`, `/api/calendars`). The client is pointed at its own origin through the standalone path from ADR 0009, so the client has almost no Home Assistant-versus-Docker branching.
2. Backing stores: shared household data and to-do lists in `state.json`; calendars as read-only iCal URLs (expanded with `ical.js`, the one dependency); screensaver photos from an Immich library or a folder; a camera as a proxied MJPEG or snapshot URL; location from `server.json`.
3. Features that need Home Assistant are dropped, not emulated: doorbell press detection, Google Keep sync, sunrise-based theme (falls back to the clock), WallPanel kiosk mode. The camera is a header button instead, which also works with Home Assistant.
4. Authentication is an optional shared password (`PASSWORD`, HTTP Basic, any user name) that guards the page, the API, the WebSocket and the camera stream; unset means open. The Home Assistant token is not used: the server accepts any token, and `config.js` is always served with the page's own origin and the token `local`.
5. Without Home Assistant events, a `POST /api/webhook/<entity_id>` rings every tablet that subscribed to `state_changed`, using the same event the doorbell code already handles. `sun.sun` is computed from `location` when set. The Home Assistant section of Settings is hidden (`config.backend = 'server'`).

## Why
Home Assistant stays the preferred backend, so the client keeps talking its protocol. Sitting behind the same calls means the existing modules (`HaList`, `CalendarFeed`, `StateManager`'s remote copy, the photo frame) and their tests are exercised unchanged by both backends, and the Docker server is a few hundred lines with no client fork.

## What was rejected and why
- **A separate backend interface in the client** (an adapter beside `HAWebSocket`): every caller would change and both paths would need tests in the bundle. The protocol shim keeps that cost on the server side, in one place.
- **CalDAV and Google OAuth for calendars:** write access isn't needed (the dashboard only reads), and iCal URLs work for Google, iCloud, Outlook and Nextcloud with no secrets to store or refresh.
- **Token authentication:** the token would have to live in the page the server serves, so it protects nothing. HTTP Basic works because the browser holds the password and resends it on every request, including the WebSocket. It is not encrypted, so exposure beyond the home network still needs HTTPS in front.
- **Webhook through GET:** any web page could make a tablet ring with an `<img>` tag, so only POST rings.
- **A WebSocket library (`ws`):** about 60 lines cover the JSON text messages needed. Tests drive it with the platform's own client.
- **Other grocery list providers (Grocy, Mealie, CalDAV tasks):** not built. A server-side list provider is the natural seam if wanted; with Home Assistant any `todo.*` integration already works.

## Photo sources
`photos` in `server.json` maps an image entity to one source: `theme`, `folder`, `immich` (favorites, an album, or anything) or `urls`. With none set the server shows a `nature` theme so a fresh install has a working screensaver. Themes are Wikimedia Commons "Featured pictures" categories, chosen because they are free-licensed and need no key or account; the server lists a category once a day and makes one lookup per photo, because Commons rate-limits bursts. Rejected: Google Photos (its API no longer reads a whole library), Unsplash or Pexels (need an API key), bundling pictures in the image (size and licensing), and PhotoPrism or Synology clients (cannot be tested here; a mounted folder covers them).

## Consequences
With no `PASSWORD`, anyone who can reach the port can change household data and see the camera feed (documented in the README). A password in the kiosk URL breaks `fetch()` in browsers, so the kiosk browser's own password setting is the way to supply it. `/config.js` ignores `homeAssistant` in a user's file in this mode. Photo, calendar and camera sources are untested against real Immich or cameras; the tests use fake upstreams.
