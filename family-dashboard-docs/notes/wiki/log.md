# Log

## [2026-10-03] milestone: setup — Doc shell bootstrapped
> Existing product layered onto UX Atlas

## [2026-10-03] milestone: audit & refine — Code & Craft remediated
> Audited code standards (tokens, semantic markup, focus traps) and craft UX (touch targets, persistent view hashes, modal cancel actions, touch navigation labels). All issues resolved; Craft Health Score 20/20.

## [2026-10-14] milestone: decisions — ADRs 0005 to 0008: deep modules behind a test seam, calendar cache and view state off the shared document, saved member edits win over config, Home Assistant lists are the truth when reachable
> Architecture review carried out: eight candidates implemented in js/bundle.js, covered by 151 Node tests and a browser smoke suite. Rejected: splitting the bundle back into files (it drifted before), a bundler or jsdom (the project has no dependencies), per-field sync merging and an offline write queue (too much for two or three tablets). Ten open questions are in UNKNOWNS.md; the briefing is ARCHITECTURE_REVIEW_2026-10-14.md.
