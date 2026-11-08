# Browser smoke tests

Clicks through the real screens (chores, PIN gate, prize store, parent tasks, calendar, meals, settings, sync) in a browser. It runs against a copy of the app with a **fake Home Assistant**, so it never talks to your real one.

```sh
tests/browser/sandbox.sh                      # builds $TMPDIR/family-dashboard-sandbox
python3 -m http.server 8766 --directory "$TMPDIR/family-dashboard-sandbox"
```

Open `http://localhost:8766/`, clear the site's storage (`localStorage.clear()`), reload, then in the console:

```js
await __smoke()            // everything, about 15 seconds
await __smoke('calendar')  // one group
location.reload()          // then, after the reload:
await __smokeReload()      // edits and the calendar cache survive a reload
```

`window.__ha` is the fake Home Assistant: `__ha.down = true` drops connections, `__ha.failOn = ['todo.add_item']` rejects a call, `__ha.todos`, `__ha.calendars` and `__ha.userData` hold what it serves, `__ha.log` records every request. `?ha=off` runs the app with no Home Assistant at all.

**Do not use the real `config.js` for this.** The real app pushes the household data to your Home Assistant on every change, so clicking around in it changes your family's real data. `sandbox.sh` writes a stub `config.js` into the copy and never reads yours.

The pure rules (stars, PIN, calendar layout, sync, lists, settings) are covered faster by the Node tests in `tests/`: `node --test "tests/**/*.test.js"`.
