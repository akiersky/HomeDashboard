# AGENTS.md

This prototype is built with UX Atlas. Docs folder: `family-dashboard-docs/`.

Doc ownership:
- `family-dashboard-docs/UNKNOWNS.md` — appended to by any skill; cleared as questions resolve
- `family-dashboard-docs/PRODUCT_BRIEF.md` — owned by `brief`
- `family-dashboard-docs/COMPETITIVE_ANALYSIS.md` — owned by `competitors`
- `family-dashboard-docs/PERSONA_WALKTHROUGH.md` — owned by `persona`
- `family-dashboard-docs/JOURNEY_MAP.md` — owned by `journey`
- `family-dashboard-docs/OKR.md` — owned by `metrics`
- `family-dashboard-docs/OOUX_OBJECT_MAP.md` — owned by `map`'s `objects` mode
- `DESIGN.md` — owned by `styleguide` (note: design tokens currently defined in `styles.css`)
- `family-dashboard-docs/adr/` — owned by `decisions`
- `family-dashboard-docs/USER_GUIDE.md` — owned by `guide`
- `family-dashboard-docs/REQUIREMENTS.md` — owned by `requirements`
- `CONTEXT.md` — the domain glossary, owned by the `domain-modeling` skill (words only, no implementation detail); symlinked into `family-dashboard-docs/repo/`
- `tests/` — Node tests for the rules in `js/bundle.js` (`node --test "tests/**/*.test.js"`) and a browser smoke suite in `tests/browser/`; see ADR 0005
- `family-dashboard-docs/repo/` — relative symlinks to the repo's root-level docs (`README.md`, `AGENTS.md`, `CLAUDE.md`/`CONTEXT.md` when present) so they're readable from inside the docs vault; edit the originals at the root, not here
- `family-dashboard-docs/notes/` — general notes home, safe to open directly in Obsidian or any other markdown editor; use it for **all** project notes. `family-dashboard-docs/notes/my-notes/` inside it is the raw capture zone (fed by `wiki`'s `note` mode quick captures, or typed by hand); `family-dashboard-docs/notes/wiki/` next to it is owned by `wiki`'s default `compile` mode, which compiles `my-notes/` plus any other document dropped into `family-dashboard-docs/` (specs, client feedback, research) into an interlinked knowledge base

## Working Agreements

- **Keep rules out of the view classes.** Behaviour that is more than drawing (stars, resets, the PIN, calendar rules, list syncing, settings) lives in the modules covered by `tests/`; classes ending in `Module` draw and ask. Run `node --test "tests/**/*.test.js"` before committing a logic change, and use `tests/browser/` for UI wiring: when a module starts returning something different, run the browser suite too, because the screens that use it are only covered there. Never click around in the real app with the real `config.js`: it pushes to your Home Assistant.
- **Capture decisions as they happen.** A non-obvious call made while working in this repo doesn't wait for someone to ask "why did we do it this way?" later: write it up with `decisions` if it's a real tradeoff with a rejected alternative, or with `wiki`'s `note` mode if it's smaller than that but still worth keeping.
- **Don't let a thought evaporate at the end of a session.** Anything worth remembering that doesn't have an obvious home yet, an idea, a risk, an observation, goes through `wiki`'s `note` mode immediately. It lands in `family-dashboard-docs/notes/my-notes/` and folds into `family-dashboard-docs/notes/wiki/` on its own; nothing needs a separate pass to not get lost.
- **Use `family-dashboard-docs/notes/` for all project notes.** Meeting notes, scratch thoughts, research, anything a teammate, PM, client, or user hands over, belongs there (or elsewhere under `family-dashboard-docs/` if it's a standalone document someone else maintains) rather than scattered across the repo or left outside version control entirely. `wiki` picks up anything placed there.
- **Defer to `family-dashboard-docs/UNKNOWNS.md` instead of guessing.** If a decision genuinely needs input this session doesn't have, log it there rather than inventing a plausible-sounding answer (see the suite's own AGENTS.md §2.6).
- **Suggest next steps at natural checkpoints.** After finishing a skill's work, or whenever a session looks like it's wrapping up, briefly state what `help` would recommend next, don't wait to be asked "what now?"
- **Name the slash command when a skill auto-invokes from plain language.** Most people working in this repo won't type `/scaffold` or `/audit` themselves — they'll just describe what they want, and the right skill should fire anyway. When that happens, say which skill ran and its slash form in one short line (e.g. "Using the `styleguide` skill (`/styleguide`) to set up your tokens.") so next time they can invoke it directly instead of relying on inference. Skip this for a skill they've already directly invoked or clearly named in the request — the point is teaching the shortcut, not narrating routine skill use.
