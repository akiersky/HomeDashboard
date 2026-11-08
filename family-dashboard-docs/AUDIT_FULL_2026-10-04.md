# Full Audit — Family Dashboard (craft · code · a11y)

**Date**: 2026-10-04
**Snapshot note**: `index.html`, `styles.css` and `js/bundle.js` were being edited by another process during this audit. Findings cite function/selector names rather than line numbers, and the key claims were re-verified against the files as of ~05:30 PDT.
**Method**: source read of `index.html`, `bundle.js` (all modules), `styles.css` tokens/focus/targets; mechanical tools (`audit-mechanical-checks`, `check-hardcoded-colors`); live run at desktop + 375px, with console and DOM probes; computed contrast for every token pair.
**Corrections to earlier audits**: `AUDIT_CODE_FINDINGS.md` reports token adherence "PASS (zero raw hex)" and a11y "PASS / Good". Neither holds (see Code §1 and the a11y section).

---

# 1. CRAFT AUDIT

## Health Score
| # | Dimension | Score | Key Finding |
|---|---|---|---|
| 1 | Visual Hierarchy & Cognitive Load | 2/4 | Dense kiosk screens; 3 failures on the 8-item checklist (chunking: 4+ routine groups per column; minimal choices: header has 3 nav + 2 tools + 6 member pills + admin lock; hierarchy: stars shown in header, hero and card). |
| 2 | Information Architecture | 3/4 | Three clear views and a member filter. Weak: current-location cues are visual only; Settings holds parent-only controls. |
| 3 | Consistency & Anti-Patterns | 2/4 | Two parallel PIN/permission models; stale placeholder strings; `alert()`/`confirm()` mixed with toasts. |
| 4 | Responsive Behavior | 3/4 | No horizontal page scroll at 375px. Primary controls and some inputs fall under 44px (details below). |
| 5 | Delight & Craft | 3/4 | Star pop + chime, themed auto dark mode, glass panels. No reduced-motion handling. |
| **Total** | | **13/20** | **Acceptable** |

## What's Working
1. Star-pop animation and chime on completion give kids immediate feedback.
2. Routines grouped by Morning / After School / Bedtime match a child's day.
3. Auto light/dark by HA's sun sensor, with a clock fallback, suits an ambient kitchen display.
4. ADRs exist for the major layout calls (`adr/0001`–`0003`).

## Findings
- **[P0] Routine stars can be farmed** — Location: `StateManager.toggleRoutineItem`. Violates: `#5 Error Prevention`. Impact: check → +1 star, uncheck → nothing removed, re-check → +1 again. Verified live: three toggles of one routine moved Alex from 32 to 35 stars. This breaks the reward system for the kids it is built for. Fix: award once per routine per day (track `starAwardedOn`), or subtract on uncheck. Route to: `audit code` / direct fix.
- **[P0] Daily routines and chores never reset** — Location: `StateManager` (no code sets `completedToday = false`; `chore.status` returns to `pending` only via the admin Reset button). Violates: `#2 Match Between System & Real World`, `#1 Visibility of System Status`. Impact: "daily" routines stay checked forever, so the board is wrong from day two. Weekly and monthly chores (`frequency` is in the data) have no recurrence logic either. Fix: store `lastCompletedDate`, derive "done" from it per `frequency`, and check on load and at midnight. Route to: `refine` for UI, code fix for logic.
- **[P1] Weather shows invented data when offline** — Location: `fetchLiveWeatherData` fallback to `DEFAULT_WEATHER_DATA`; `aData?.current?.us_aqi || 32`; per-day `humidity` reuses current humidity. Violates: `#1 Visibility of System Status`, `#9`. Impact: a dead network displays "74°F Sunny, AQI 32" as fact, and the forecast humidity is the same on all five days. Fix: show a stale/offline state with a "last updated" time; use real daily humidity or drop the row.
- **[P1] Parent-only controls are reachable by kids** — Location: Settings gear (`#settings-btn`) → Reset All Data, star targets and reward text, token fields; the PIN gates only the Chore Admin panel. Violates: `#5 Error Prevention`. Impact: a child can wipe the data or edit stars with two taps. Fix: gate Settings behind the same PIN, or split a parent section.
- **[P1] Dishonest status feedback** — Location: `#immich-test-btn` handler (always toasts "Immich photo server ready" after 1 s without any request); `#ha-status-badge` is hard-coded "Connected" in HTML. Violates: `#1`, `#9`. Impact: false confirmation of connections that were never tested. Fix: really test, or remove the button; render the badge as "Not tested" by default.
- **[P2] Settings Immich URL/API key are dead controls** — Location: `#immich-url-input`, `#immich-key-input`; `PhotoFrameModule` uses only the hard-coded HA entity `image.immich_random_favorite_image`. Violates: `#4`, `#6`. Fix: remove the fields, or make the entity configurable.
- **[P2] Current PIN is displayed in plain text** — Location: `ChoresAdminModule.buildPinChangeHTML`. Violates: `#5`. Impact: anyone behind a parent on the shared wall display sees it. Fix: never render it.
- **[P2] Native `alert()` / `confirm()` on a kiosk** — Location: backup import error, reset flow (3 call sites). Violates: `#4`. Fix: use the app's own modal/toast pattern; destructive confirm should name what is lost.
- **[P2] Stale branding** — Location: `<title>`, the HTML greeting placeholder "Smith Family", comments about sample names, CSS tokens. Violates: `#2`. Fix: neutral title; member colors come from `config.js`, so drop the per-name tokens.
- **[P2] Touch targets under 44px** — Measured at 375px: add-chore button 136×29, wildcard-claim 144×33, "View missions" 36px high, lock button 36×36, calendar prev/next 36×36, `.chore-row-check` 22×22 (the whole row is the tap target at 42px), `.meal-day-clear` 28, `.idea-action-btn` 32, `.tactical-check-btn` 32. Violates: `#7`. Fix: 44px minimum for primary controls on a touch kiosk.
- **[P3] Photo screensaver gives no hint that Esc/any key wakes it** — Location: `.photo-frame-hint` says tap only.

## Persona Red Flags
- **Jordan (first-timer)**: the header icon-only buttons (photo frame, settings) rely on `title`, which does not exist on touch. The admin lock icon gives no hint of what it unlocks.
- **Riley (stress-tester)**: refreshing on day two shows yesterday's checks; offline weather looks real; a first-run page throws in the calendar sync (see Code §5); importing a backup replaces everything with only a reload as feedback.
- **Casey (mobile)**: primary add actions sit at the top of long scrolling columns; several controls are under 44px.
- **A child (the real user)**: can farm stars, open Settings, and read the parent PIN from the Change PIN tab once a parent has left the panel open.

## Systemic
- **#1 Visibility of System Status** violated 3×: fake weather fallback, fake Immich test, hard-coded "Connected" badge. Establish one rule: no status is shown that was not measured.
- **#5 Error Prevention** violated 4×: star farming, ungated Settings, plain-text PIN, no undo for completed chores.

---

# 2. CODE AUDIT

## Summary
- Files reviewed: `index.html` (996 lines), `styles.css` (5.5k), `js/bundle.js` (5.6k, one IIFE with 8 classes), `config.js`/`config.example.js`, `js/legacy-modules/` (100 KB, unused), `data/dashboard-data.json`
- Token adherence: **Fail**
- Accessibility hygiene: **Needs remediation**

## Findings & Remediation Steps

### 1. Tokens
- `styles.css` `:root` / `[data-theme="dark"]`: tokens are a single layer of raw hex (`--text-muted: #94a3b8`, `--color-amber: #f59e0b` …). There is no raw-palette → semantic split. Note `--color-warning` and `--color-amber` hold the same value.
- Hex outside token definitions: the `var(--x, #fallback)` fallbacks (e.g. `.admin-…` around `--bg-surface, #fff`), `linear-gradient(… #0284c7 … #0369a1)` + `color: #ffffff` (weather radar button), `.aqi-sensitive { color: #ea580c !important }`, `background: #0b1120`. Replace with tokens.
- Raw hex in config/data: member `color` values live in `config.js` and `dashboard-data.json` (acceptable as user data, but they are applied inline with no contrast check; `${member.color}12` alpha-suffix hack assumes 6-digit hex).
- Inline `style="…"` in markup: 28 in `index.html`, 96 in `bundle.js` template strings (layout, colors, `font-size`). Move to classes.
- No `dark:` overrides (no Tailwind) — n/a.

### 2. Semantic HTML
- One `<h1>` (greeting) — pass. But the document title and the greeting placeholder are stale (see Craft).
- Clickable non-buttons: `.member-pill`, `.chore-row-item`, `.jar-item`, `.timeline-event-card`, `.event-chip`, `.agenda-card-item` are `<div>`s with click handlers (24 found live, 0 focusable). The mechanical tool reported "none" because these elements are created in `bundle.js` template strings; it only scans markup. Use `<button>`.
- Inputs: all labelled except the hidden file input. Several `<label>` elements have no `for` (`Color Theme`, admin PIN-change labels).

### 3. Focus hygiene
- A global `:focus-visible` rule exists, but `.meal-ideas-add-bar input:focus`, `.admin-goal-input:focus`, `.admin-add-form input:focus` set `outline: none` and rely on a border change (check each has ≥3:1).
- Modal Escape works, focus trap works, and focus is restored. Gap: modals lack `role="dialog"`/`aria-modal`/`aria-labelledby` except Weather and Windy (see a11y 4.1.2).
- Escape also closes the *topmost in DOM order*, which is not necessarily the most recently opened modal (PIN modal over admin panel).

### 4. Component / type hygiene
- No build step, no type-check, no lint, no tests. 5.6k-line single IIFE; `js/README.md` calls the unbundled modules "legacy" and `bundle.js` the real source, so the "bundle" is hand-maintained source. Decide: promote `bundle.js` to the source of truth (rename, split with ES modules) or restore a real build.
- Cache-busting is manual (`?v=30`, `?v=26`, `config.js?v=14`) and easy to forget.

### 5. Structure & logic (defects, ranked)
- **[P0] Star farming** — `StateManager.toggleRoutineItem` awards +1 on every check. See Craft.
- **[P0] No daily/weekly reset** — see Craft.
- **[P0 security] Unescaped HTML from calendar events** — `renderTimelineView`, `renderMonthView`, `renderAgendaView` inject `evt.title` and `evt.location` through `innerHTML`; there is no escape helper anywhere in the file. Titles come from Home Assistant/Google Calendar, where anyone can send an invite. An invite titled `<img src=x onerror=…>` runs script in a page whose `localStorage` and `config.js` hold the HA long-lived token (admin-level). 61 `innerHTML` sites in total; the others interpolate user-entered chore, meal, grocery and todo text (`item.title`, `idea`, `g.name`, HA todo summaries). Fix: add `escapeHtml()` and apply it to every interpolation, or build nodes with `textContent`.
- **[P1] First-run crash in calendar sync** — Verified live: `Uncaught TypeError: Cannot read properties of undefined (reading 'filter')` in `syncHomeAssistantCalendars`. `loadBaselineIfEmpty` / `resetToBaseline` assign `dashboard-data.json` (which has no `events` key) straight through `mergeWithConfig`, skipping the DEFAULT_STATE merge that `loadState` and `importData` do. HA calendars therefore never load until a reload. Fix: merge defaults in both baseline paths.
- **[P1] Secrets are copied into persistent state and backups** — `mergeWithConfig` copies `haToken` and `immichApiKey` into `state.settings`, `save()` writes them to `localStorage`, and `exportData()` emits them (plus `parentPin`) into the JSON backup, which the UI tells users to copy around the household. `config.js` itself is gitignored (verified: untracked), but it is served as a static file, so any device on the LAN can `GET /config.js` and read the token. Fix: keep the token out of state and exports; strip secrets on export; serve a scoped token or proxy.
- **[P1] Parent PIN** — default `'1234'`, stored plain in `localStorage` and the exported JSON, compared client-side, displayed in the Change PIN tab, and the chore modal now also takes a PIN. This is a kid speed bump, not security; document it as such, and at minimum stop displaying it and stop exporting it.
- **[P1] Photo-frame interval leak** — `PhotoFrameModule.start()` awaits `fetchImmichPhotos()` before creating its `setInterval`. A tap during that await runs `stop()` (clearing a not-yet-set interval), then `start()` continues and creates an interval that runs forever with the overlay hidden, calling `update_entity` on HA every 30 s. Also `start()` never clears an existing interval. Fix: set a `running` flag/clear first, create the interval synchronously.
- **[P1] Every photo advance and every theme check downloads *all* HA states** — `HAWebSocket.getEntityState` calls `get_states` and filters client-side (also `sun.sun` every 10 min). On a large HA install that is megabytes per call. Use `subscribe_entities` or `render_template`/`get_state` for one entity.
- **[P2] Calendar sync only replaces HA events when ≥1 event was fetched** — if a calendar becomes empty, stale events never clear. Events from HA are also copied into `localStorage` and then editable/deletable locally, then silently reappear at the next 5-minute sync.
- **[P2] `HAWebSocket`** — no reconnect/backoff, no timeout on `pending` requests (a dropped socket leaves promises unresolved), `auth_invalid` leaves the socket open, and `JSON.parse` in `onmessage` is unguarded. The auth token is sent to whatever `haUrl` the settings hold, including plain `ws://`.
- **[P2] Full re-render on every `stateChanged`** — 12 listeners, all of which rebuild their DOM; every checkbox tap re-renders the calendar, chores, filter bar and badges. Fine at this size, but it also makes focus unmanageable once rows become buttons (focus is lost on every render).
- **[P2] Timers never cleared** — 7 `setInterval`s (clock every 1 s rewriting `innerHTML`, weather, calendar, theme, current-time line…). Clock should update `textContent` and only when the minute changes.
- **[P2] ID generation** — `'ch-' + Date.now()` and similar can collide on a fast double-submit.
- **[P3] Dead code** — `parseICS`, `syncAllICalFeeds`, `updateThemeIcon`, `renderSidebarBadges`, `renderRewardJars` target elements that no longer exist; `legacy-modules/` (100 KB) is unreferenced. `window.familyDashboard` and `window.dashboardApp` are two globals for the same object.
- **[P3] Event-card colors** — `memberTagsHtml` hard-codes `rgba(0,0,0,0.25)` and `font-size:9px`.

### 6. Repo hygiene
- **[P1] Nothing is committed** — `git status`: 11 changed files, ~6,100 insertions / ~3,800 deletions, plus untracked `data/`, docs and `legacy-modules/`, against a 3-commit history. A mid-edit session or a bad `git checkout` loses weeks of work. Commit a checkpoint.
- `.gitignore` excludes `.claude/` (fine) and `config.js` (good). `config.example.js` is modified; confirm it holds no real values.
- The earlier session's `AUDIT_CODE_FINDINGS.md` should be re-marked as superseded.
- Token note: during this audit, `config.js` was read and the HA token appeared in this session's tool output. It was not written to any file. If this transcript could be shared, rotate the token in HA (Profile → Security).

---

# 3. a11y AUDIT (WCAG 2.1/2.2 AA)

## AA Compliance Summary
| Principle | Criteria checked | Pass | Fail |
|---|---|---|---|
| Perceivable | 5 | 1 | 4 |
| Operable | 5 | 1 | 4 |
| Understandable | 3 | 2 | 1 |
| Robust | 2 | 0 | 2 |
| **Overall** | **15** | **4** | **11** |

**Rating: Does not meet AA — significant work needed.** The core kid interaction (checking off a chore) cannot be done by keyboard or assistive tech at all.

## Failing Criteria
**Perceivable**
- **1.4.3 Contrast (Minimum)** — computed against actual tokens:
  - `--text-muted` light `#94a3b8` on white: **2.56:1**, on page `#f1f5f9`: **2.34:1** (needs 4.5). Used for subtitles, empty states, helper text, settings hints.
  - `--text-muted` dark `#64748b` on card `#1e293b`: **3.07:1**; on glass `#121c3a`: 3.52:1.
  - White text on `--color-success` `#10b981`: **2.54:1**; on `--color-amber` `#f59e0b` event cards: **2.15:1**; on primary `#3b82f6` buttons: 3.68:1; on rose `#f43f5e`: 3.67:1; on danger `#ef4444`: 3.76:1; purple `#8b5cf6`: 4.23:1.
  - Accent text on light: amber 2.15:1, success 2.54:1, rose 3.67:1.
  - Dark: rose 3.98, purple 3.45, sky 3.57 on `#1e293b`. Member names are colored text, so Mom/Sam/Dad labels fail in both themes.
  - Fix: darken `--text-muted` (≥ `#64748b` light / ≥ `#94a3b8` dark), use dark text on amber/green fills, and derive member text colors per theme.
- **1.4.4 Resize Text** — `index.html` viewport has `maximum-scale=1.0, user-scalable=no`, blocking pinch zoom; `body` is `height:100vh; overflow:hidden`. Remove both restrictions (the kiosk case does not need them).
- **1.4.1 Use of Color** — in the week/3-day timeline, event cards identify the member by background color only (not verified in every view; the agenda view groups by named column). AQI and rain "high" states (`.aqi-*`, `.high-precip`) change only color. Add text or icons.
- **1.4.12 Text Spacing / readability** — 15+ distinct sub-0.9rem font sizes down to 0.68rem (≈11px) and event tags at 9px for a display read from across a kitchen. Set a minimum of 0.8rem (12.8px) for any information, 1rem for body.
- **1.1.1 Non-text content** — Pass for icon buttons that have `aria-label`; the header `#photo-frame-btn`, `#settings-btn`, `#cal-prev-btn`, `#cal-next-btn`, `#add-event-btn`, `#admin-lock-btn` rely on `title` only and have no accessible name. Emoji used as meaning (⭐ counts, 🔒) is announced inconsistently. Counted as part of 4.1.2 below.

**Operable**
- **2.1.1 Keyboard** — Verified live: 24 clickable elements, 0 focusable. Not operable by keyboard: member filter pills, every chore/routine row (the primary task), reward jars, calendar event cards/chips/agenda cards, and the weather-refresh, wildcard and meal-day controls built from templates. The Escape and focus-trap work already added does not help because nothing in the content is reachable. Fix: render these as `<button>` (or `role="checkbox"` + `tabindex="0"` + Space/Enter).
- **2.4.3 Focus Order** — a full re-render on every state change destroys the focused element, so focus drops to `<body>` after each action. Preserve focus (or re-focus by `data-item-id`) after render.
- **2.4.7 Focus Visible** — the global `:focus-visible` exists but `outline: none` is applied to `.meal-ideas-add-bar input:focus`, `.admin-goal-input:focus`, `.admin-add-form input/select:focus`, `.pin-digit` (verify the replacement border is ≥3:1 against its background), and `button:focus:not(:focus-visible)` is fine.
- **2.5.5 / 2.5.8 Target Size** — measured: `chore-row-check` 22×22 (row 42 px mitigates), `meal-day-clear` 28, `idea-action-btn` 32, `tactical-check-btn` 32, calendar nav 36, lock 36, add-chore 29 high, `.member-avatar` decorative. All meet the 24 px WCAG 2.2 minimum but miss the 44 px practical bar for a touch kiosk, so this is a Craft finding, not an AA failure.
- **2.2.2 / motion** — 0 `prefers-reduced-motion` rules; star pops, spinners, slide transitions all run regardless. (AAA in 2.3.3, but expected on a display shared with children.)

**Understandable**
- **3.3.1 / 3.3.3 Error identification** — PIN failure shows an error `div` but it is not tied to the inputs (`aria-describedby`), is not announced, and clears the digits and moves focus without telling AT. Settings import errors use `alert()`. Fix: `role="alert"` on `#pin-error`, `aria-invalid` on inputs.
- Passing: 3.2.1/3.2.2 (no context change on focus/input), 3.3.2 (visible labels; placeholders are supplementary).

**Robust**
- **4.1.2 Name, Role, Value** — modals except Weather and Windy lack `role="dialog"`, `aria-modal`, and `aria-labelledby` (event, chore, reminder, parent-task, settings, PIN, admin panel, meal picker). The nav buttons and member pills have no `aria-current`/`aria-pressed`; calendar view switcher (`.switch-btn`) and `.theme-mode-btn` have no pressed state; admin tabs (`.admin-tab`) are not `role="tab"` while Settings tabs are, which is inconsistent. Icon-only buttons listed in 1.1.1 have no name. `#event-details-popover` has no `role="dialog"` and no focus management.
- **4.1.3 Status Messages** — `#toast-container` has no `aria-live`; every confirmation, sync result and error ("Synced 12 events", "Cannot connect") is silent to screen readers. `#pending-chores-count`, the sync status, and the weather refresh are likewise unannounced. Fix: `role="status" aria-live="polite"` on the container.

## Passing Highlights
- Single `<h1>` and a sensible `h2/h3` outline; form fields have programmatic labels; `lang="en"`.
- Escape closes modals, Tab is trapped inside, and focus returns to the opener.
- Settings tabs implement the full ARIA tab pattern (roles, `aria-selected`, roving tabindex, arrow/Home/End keys) — reuse it for the admin tabs.
- Text popover content uses `textContent`; the weather widget is a real `<button>`.

---

## Suggested order of fixes
1. **Correctness for kids**: star farming, daily/weekly reset, first-run `events` crash.
2. **Escape all interpolated text** (stored XSS path via calendar invites).
3. **Make interactive rows real buttons** (fixes 2.1.1, 4.1.2, 2.4.3 together), add `aria-live` to toasts, dialog roles on modals.
4. **Contrast tokens**: `--text-muted`, white-on-amber/green, per-theme member text colors; drop `user-scalable=no`.
5. **Secrets/PIN**: stop persisting the token and PIN into state/exports, gate Settings, stop displaying the PIN.
6. **Commit a checkpoint**, then decide whether `bundle.js` becomes real modules with a build, and delete `legacy-modules/`.
7. Photo-frame interval leak and the `get_states` cost.

Next in the suite: `refine` for the visual/a11y fixes (2–4), `decisions` for the PIN-as-speed-bump and bundle-vs-modules calls, and `UNKNOWNS.md` still lists the open kiosk-vs-desktop question, which determines how strict the 44 px and zoom rules need to be.

---

## Remediation status (same day)

**Fixed and verified in the running app**: star farming; daily/weekly/monthly reset (`resetPeriodic`); first-run `events` crash (`hydrate`); HTML escaping of all user text (`esc`); Settings behind the parent PIN (and a bug where the PIN callback never fired); PIN no longer displayed; secrets stripped from exports and kept on import; photo-frame interval leak; role/tabindex/`aria-checked`/`aria-pressed` on pills, chore rows, event cards, with Enter/Space and focus kept across re-renders; `role="dialog"` + labels on every modal; `aria-live` toasts, `role="alert"` PIN error; `aria-current`/`aria-pressed` on nav and toggles; icon-button names; viewport zoom restored; contrast tokens (muted, primary, success, danger, amber, sky, rose, purple) with per-theme text variants and a contrast-aware ink for member-coloured cards; hex confined to token definitions; visible focus rings; 12.8px minimum text; 44px targets on touch; `prefers-reduced-motion`; offline weather shown as unavailable; fake Immich test and dead Immich fields removed; stale branding; dead methods and `js/legacy-modules/` deleted (history: `git show 7a3cc01:js/app.js`).

**Not done**
- `HAWebSocket.getEntityState` still pulls all HA states (needs a subscription or a REST call; REST needs CORS set up on the HA side).
- No WebSocket reconnect/timeout; calendar sync still keeps stale events when a calendar empties.
- Two other `confirm()` flows, PIN still a client-side speed bump, `config.js` still publicly served.
- Per-day forecast humidity still repeats the current value.
- Not committed.
