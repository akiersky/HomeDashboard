# Architecture review, 2026-10-14

**Status:** committed on branch `calendar-critique-fixes` and not pushed. The top commit is this architecture work; the one below it holds the prize store, chores edit mode and screensaver work that was already in the tree when the review began. A snapshot of every stage is also kept as a git ref (see "Rollback").

This is the briefing for the work that followed the `improve-codebase-architecture` review. All eight candidates from the review were done, plus the free deletions. The aim was that the rules the dashboard follows (stars, the Parent PIN, the calendar, the lists, sync, settings) live in a few modules with small interfaces that run in Node without a browser, while the screens only draw and ask. The decision and its rejected alternatives are in [ADR 0005](adr/0005-deep-modules-inside-the-bundle-tested-through-a-seam.md).

`js/bundle.js` is still one file with no build step. It went from 5,591 to 5,424 lines even though modules were added, because several copies of the same rule collapsed into one.

## Check it first

- Run `node --test "tests/**/*.test.js"`. It runs 151 tests with no dependencies.
- The browser smoke suite (`tests/browser/README.md`) clicks through the real screens against a copy of the app with a fake Home Assistant: 50 checks. Do not click around in the real app with your real `config.js`. The app pushes the household data to your Home Assistant on every change, so test clicks would land in the family's real data.
- Try the changes under "Things that behave differently" on one tablet before the wall display.
- Answer the twelve questions in [UNKNOWNS.md](UNKNOWNS.md), section "From the architecture review (2026-10-14)". Each one is a call that was left open rather than guessed.

## What was done, candidate by candidate

The numbers are those of the review report.

| # | Candidate | Now lives in | What the module hides |
| --- | --- | --- | --- |
| 01 | Chore and star rules in one module | `MissionLedger` | Ticking routines and chores, wildcards and claiming, star balance and the activity log, the Prize store and buying, the daily / weekly / monthly reset, adding and moving chores, "Both kids" |
| 02 | Parent PIN gate that fails closed | `ParentGate`, `pinDialogView` | Verify, the default PIN, the new-PIN flow, every way the dialog can be dismissed. Callers write `await gate.ask(...)` |
| 03 | Calendar event rules out of `CalendarModule` | `CalendarFeed`, `localCache` | Reading Home Assistant events, time parsing, merging identical events, day and agenda queries, column layout, the cache kept on the tablet |
| 04 | One module for every Home Assistant list | `HaList`, `MealPlan`, with `storeList` / `memoryList` for the local copy | Shopping list, meal ideas and dinner plan: loading, writing, the local fallback, telling the screens |
| 05 | One owner for re-rendering | `Renderer`, `keepScrollPositions` | Rendering once per change, only the screens that are showing, keeping scroll positions around every render |
| 06 | One seam for the household data | `StateManager` with the adapters `browserStorage` and `haUserData` | Defaults, saved copy, `config.js`, saving, sharing with Home Assistant by last write wins, backup, import, reset |
| 07 | Parent-task rules out of the board renderer | `ParentTasks` | Repeating, undo, the board's priority / theme / time grouping, drop rules, the calendar projection |
| 08 | Declare each setting once | `SETTINGS`, `SettingsSchema` | A setting's default, `config.js` key, form field, scope (device, private or household) and whether it is exported. Adding a setting is one entry |

`HAWebSocket` also changed: its calls now time out and are rejected when the connection drops, and it reads the URL and token when it connects, not when it is created.

Free deletions (code with no caller): `FamilyTasksModule` and its Settings field, the `haTasksTodoEntity` and `theme` entries in `config.example.js`, `inkOn`, `getRelativeDateStr`, `renderLegend`, the iCal helpers, `handleAddIdea`, the unused `add-chore-btn` listener, the `window.mealPlanData` global, and the `openPinModal` / `promptNewPin` pair. The retired fields are dropped from saved documents when they are read.

## Things that behave differently

These are the visible differences. Most are decisions, recorded as ADRs or as questions in `UNKNOWNS.md`.

- **Settings edits to a member stick.** A member's icon and calendar entity (and stars and goals) survive a reload. `config.js` still decides who the members are, and still wins for every other setting. See [ADR 0007](adr/0007-saved-member-edits-win-over-config.md).
- **Other settings still revert on reload.** The Home Assistant URL, shopping list entity, Keep URL, doorbell and weather are re-applied from `config.js` on every load. Whether that should change is the first open question in `UNKNOWNS.md`.
- **Home Assistant lists are the truth when it is reachable.** Even an empty meal-ideas list now shows empty, where it used to fall back to the saved ideas. See [ADR 0008](adr/0008-home-assistant-lists-are-the-truth-when-reachable.md).
- **Offline changes to a list are kept on the tablet only.** The tablet warns "Saved on this tablet only", and the next successful load replaces them with the Home Assistant list. Items typed while Home Assistant was down used to vanish with no message.
- **Dinner pins on the calendar cover the next seven days only,** matched by weekday. Before, every Monday in the calendar showed the same dinner.
- **Calendar sync and the member pills no longer rewrite the shared document.** Fetched events are a cache on the tablet, and which member a tablet shows is that tablet's own business. A tablet that was a minute behind could previously overwrite a chore or star change another tablet had just made. See [ADR 0006](adr/0006-calendar-cache-and-view-state-stay-out-of-the-shared-document.md).
- **Deleting a Home Assistant event in the dashboard hides it until the next sync.** It always came back at the next sync; that is now the stated behaviour.
- **Google calendar events have no Edit button.** The event popover shows only Delete for them. An edit used to look saved until the next sync replaced it (every 5 minutes) and it also travelled to the other tablets. Your own events are edited as before.
- **Requests to Home Assistant give up after 10 seconds** (30 seconds for calendar events). Before, a request that never got an answer waited forever.
- **The Settings screen no longer has a "Family Tasks entity" field.** The module behind it had no screen and refetched a Home Assistant list on every change.
- **Adding a chore from the header asks for the PIN first.** Before, the chore dialog opened behind the PIN dialog and stayed open after Cancel.

## Bugs fixed on the way

- The header "Add chore" PIN check never blocked (above). Every PIN-gated action now goes through one gate that refuses if the dialog cannot be shown.
- The star animation was measured on a row that a synchronous re-render had already replaced. Re-rendering is now coalesced, so the animation finds its row.
- Completed one-off parent tasks stayed on the calendar, because the frequency `'none'` (the form's default) counted as repeating.
- Requests to Home Assistant never settled if the connection closed mid-request. They are rejected now, and also after a timeout.
- Settings edits to a member's icon and calendar entity reverted on reload.
- Local-mode shopping list changes did not re-render the list.
- Several actions re-rendered every screen twice (the admin panel re-announced a change after saving). Each change now renders each showing screen once.

## Independent review

A second agent read the whole diff against the snapshot and ran scratch checks. It found one crash and three smaller defects, all fixed and covered by tests, one unrequested behaviour change (reverted), and two points that were decisions already recorded.

- **Fixed: the screensaver crashed when an event was still to come today.** `CalendarFeed.remaining()` returns plain events but the screensaver still unpacked the old `{ e, t }` pairs, so the clock, date and photo never appeared. It is now covered by a browser check with an event later today, and a failing events list can no longer stop the clock.
- **Fixed: a shopping list or meal ideas list kept on the tablet showed an older copy after a sync.** The list held on to the array it was built with, so a sync that brought another tablet's items did not show, and the next add pushed the old copy back over them. The list is now read from the household data each time (tested with a real sync).
- **Fixed: editing a Google event looked saved and was not.** Edit is now hidden for those events (see above).
- **Fixed: a slow calendar fetch could be cut off.** The new 10-second limit is 30 seconds for calendar events.
- **Reverted: a hand adjustment of stars wrote an entry to "Recent stars".** That was new behaviour nobody asked for, and repeated clicks pushed real entries out of the 20 kept. It is logged as a question in `UNKNOWNS.md`.
- **Already decided, kept:** an empty Home Assistant list is the truth, and the dinner plan covers the next seven days. Both are in `UNKNOWNS.md`, with the upgrade effect on the sample meal ideas spelled out.

The same review found no way past the Parent PIN, no tokens in exports or pushes, nothing in the added code that Safari 15 cannot run, and the same results as the old code for calendar time parsing and column layout over about 3,000 generated cases.

## Left alone on purpose

The weather block, the modal helpers, touch scrolling, confetti and the audio synths already have small interfaces. The roster of two kids (`alex` and `sam`) is still fixed in `index.html` and a few lists, and multi-day events still show on their first day only. Both are logged in `UNKNOWNS.md` because they need a decision, not a refactor.

## How the tests reach the code

`window.__FD_TEST__` is a test seam at the end of `js/bundle.js`. When a test sets it, the bundle hands over its modules and skips booting. `tests/helpers/load-bundle.js` runs the real file in Node with a stub `window`. The terms (module, interface, seam, adapter) follow the vocabulary of the `codebase-design` skill, and the domain words are in [CONTEXT.md](../CONTEXT.md).

The new code stays within ES2021 so that it still runs in the Safari on older iPads (for example, no `Array.prototype.at`).

## Rollback

Every stage was snapshotted as a commit that no branch points to, so nothing shows up in `git log`:

| Ref | State |
| --- | --- |
| `refs/backup/pre-architecture-work` | the working tree before any of this work |
| `refs/backup/arch-1-dead-code-pin-tasks` | dead code removed, `ParentGate`, `ParentTasks` |
| `refs/backup/arch-2-ledger` | plus `MissionLedger` |
| `refs/backup/arch-3-calendar-feed` | plus `CalendarFeed` |
| `refs/backup/arch-4-ha-lists` | plus the Home Assistant lists |
| `refs/backup/arch-5-all-candidates` | everything, before the final documentation |
| `refs/backup/arch-6-after-review` | everything, with the independent review's fixes (the state described here) |

- Undo all of it in one step: `git revert HEAD` (the top commit holds the whole architecture work).
- See everything that changed: `git show --stat HEAD`.
- Bring one file back from before: `git checkout HEAD~1 -- js/bundle.js`.
- Look at a stage without changing the tree: `git show refs/backup/arch-3-calendar-feed:js/bundle.js | less`.

The refs hold only the tracked files as they were at each stage, so the files this work added (`tests/`, `CONTEXT.md`, the ADRs 0005 to 0008, this briefing) are not in them. They live in the local repository only and are not pushed. Now that the work is committed they are a second way back; delete them when you no longer need it: `git for-each-ref --format='%(refname)' refs/backup | xargs -n1 git update-ref -d`.
