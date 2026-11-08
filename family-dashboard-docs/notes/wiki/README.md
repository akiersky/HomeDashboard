# About This Wiki

This folder is a compiled, interlinked knowledge base, built and maintained by the `wiki` skill from `../my-notes/` and anything else dropped into the docs folder that this suite didn't produce itself (a spec, a client brief, meeting notes). It isn't hand-written from scratch — `wiki` reads sources, cross-references them, and keeps this folder current.

Once `wiki` has run at least once, this folder holds:
- `index.md` — content-oriented catalog, the front door
- `log.md` — append-only record of what changed and when
- `entities/` — one page per durable "thing" worth its own file (a persona, a recurring decision topic, a domain term)
- `constellation.html` — a standalone interactive graph view, open directly in a browser

**Editing by hand:** every file here is plain markdown, cross-referenced with standard `[text](file.md)` links rather than Obsidian-only `[[wikilink]]` syntax — no Obsidian or specific tool required, safe to open and edit directly. If you correct or add something by hand, note it in `log.md` yourself, or just let the next `wiki` `compile` pass pick up the change (it checks for anything that doesn't match what it last wrote). Deleting/renaming an entity page by hand is safe too; `compile` mode's linting pass (contradictions, staleness, orphans) will flag anything that's now inconsistent rather than silently breaking.
