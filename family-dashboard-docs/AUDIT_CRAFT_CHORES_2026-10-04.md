# Craft Audit — Chores page (Everyone board, kid pages, parent pages)

**Date**: 2026-10-04
**Target**: `#view-chores` — `ChoresModule` (`renderKidChart`, `renderWildcardChores`, `renderKidAchievementsPage`, `renderParentTacticalPage`), `.kid-*`, `.parent-*`, `.tactical-*`, `.chore-*`, `.wildcard-*` in `styles.css`.
**Method**: source read plus live DOM measurement of the three states (Everyone, Alex, Mom) at 1024×768. The browser pane was hidden at audit time, so no fresh screenshots were taken. The Everyone board was last seen visually earlier in this session.
**Supersedes** the earlier chores audit (`AUDIT_CRAFT_FINDINGS.md`), which covered feature gaps rather than visual consistency.

## Measured inconsistency (visible elements on each screen)
| Metric | Everyone | Alex | Mom | Healthy range |
|---|---|---|---|---|
| Distinct font sizes | 10 | 11 | 9 | 4–5 |
| Font weights in use | 400, 500, 600, 700, 800 | 400–900 (six) | 400, 600, 700, 800 | 3 |
| Border radii | 5 | 5 | 6 | 3 |
| Button/clickable variants (class × size × radius × height) | 8 | 2 + 4 | 9 | 3–4 |
| Emoji in rendered text | 49 | 52 | 12 | icons only; emoji only in user content |
| Inline `style=""` in `ChoresModule` templates | 34 | | | 0 |

Button heights on one screen range 23–64 px; "primary" buttons come in 21, 28, 29, 30 and 45 px. Weight 800–900 is used on 22–26 elements per screen, so bold stops signalling anything.

## Health Score
| # | Dimension | Score | Key Finding |
|---|---|---|---|
| 1 | Visual Hierarchy & Cognitive Load | 1/4 | 5 of 8 checklist items fail. Everything is bold, bordered and coloured, so nothing leads. |
| 2 | Information Architecture | 2/4 | The structure is sound (Everyone / kid / parent), but the same facts are shown 2–3 times and the member pills are the only way to move around. |
| 3 | Consistency & Anti-Patterns | 1/4 | 9 button styles, 10+ type sizes, 3 different "list row" designs, 3 different "filter tab" designs. It reads as several screens built at different times. |
| 4 | Responsive Behavior | 2/4 | The Everyone board holds up; kid/parent pages had no scrolling until today's fix; targets are 21–36 px. |
| 5 | Delight & Craft | 2/4 | The star-pop and chime are good. Emoji everywhere cheapens the effect, and spacing is arbitrary. |
| **Total** | | **8/20** | **Poor** |

**Cognitive-load checklist (8 items)** — fails: *Single focus* (a hero, a star jar, a goal card, a streak, an activity log and the chores compete on the kid page); *Chunking* (Everyone board shows 4 routine groups × 2 kids + wildcards + 6 claim buttons); *Visual hierarchy* (see weights); *Minimal choices* (header: 3 nav + 2 tools + 5 member pills + add + lock + settings-like icon, all at equal weight); *Progressive disclosure* (wildcard management, PIN, cadence and star jars all surface at once). 5 failures = high load.

## What's Working
1. **Everyone board structure**: two kid columns plus a wildcard column is easy to read at a glance and suits a wall display.
2. **Routine grouping** (Morning / After School / Bedtime) matches a child's day. Keep it.
3. **Completion feedback** (star pop + chime) is the product's best moment. Preserve it, and don't dilute it with decoration elsewhere.
4. **Theme tokens** are now sound (AA contrast); the redesign can stand on them.

## Findings (most impactful first)
- **[P1] No type scale** — Location: `styles.css` (`.chore-*`, `.kid-*`, `.parent-*`, `.tactical-*`, `.wildcard-*`), 34 inline styles in `ChoresModule`. Violates: `#4 Consistency & Standards`. Impact: 9–11 sizes (10.9–44.8 px) in steps of 0.01–0.05 rem look like mistakes, not hierarchy. Fix: define 5 tokens — `--text-xs 0.8rem` (meta/labels), `--text-sm 0.9rem` (secondary), `--text-md 1rem` (body/row titles), `--text-lg 1.25rem` (card titles), `--text-xl 2rem` (hero numbers) — and map every rule to one. Route to: `refine`.
- **[P1] Button variants proliferate** — Location: `.btn-primary` (21–45 px tall), `.btn-secondary`, `.btn-view-achievements`, `.wildcard-claim-btn`, `.tactical-filter-btn`, `.recurrence-filter-tab`, `.btn-complete-cycle`, `.btn-icon-subtle`, `.tactical-check-btn`, `.tactical-delete-btn`. Violates: `#4`. Impact: the same action (a small secondary action) has three radii (6/8/100 px) and four heights, so users can't learn what is clickable. Fix: three button kinds only — primary, secondary, quiet icon — in one size scale (40 px default, 44 px touch), one radius token. Filters and tabs become one segmented-control component. Route to: `refine`.
- **[P1] Emoji used as UI, decoration and content at once** — 49–52 on the Everyone/kid screens. Locations: section labels (`☀️ Morning`, `🎒 After School`, `🌙 Bedtime`, `📋 Daily Chores`), points (`+3⭐`), buttons and toasts (`🌟`, `🎉`), priority (`🔴🟡🟢`), category selects in `index.html`, plus emoji baked into chore names in `data/dashboard-data.json` and `DEFAULT_STATE`. Violates: `#8 Aesthetic & Minimalist Design`, `#2`. Impact: emoji render differently per OS/device (kiosk Linux/Android vs Mac), can't be themed, change line height, defeat contrast control, and when every row has one none stand out. Fix: Font Awesome (already loaded: `fa-solid`, v6.4) for all UI chrome with one icon colour and size; keep emoji only where the family chose them in chore names. Route to: `refine`.
- **[P1] Same information repeated** — Location: `renderKidChart` (stars in header and progress bar), `renderKidAchievementsPage` (stars in hero, goal card, jar; activity log repeats completions), Everyone board header and each kid header. Violates: `#8`. Impact: three places to look for one number. Fix: one star/goal component (count, goal name, bar) used wherever stars appear; drop the others. Route to: `refine`.
- **[P1] Weight and colour inflation** — 800–900 weight on 22–26 elements, plus member colour on names, borders, bars, avatars and headers. Violates: `#8`. Impact: no focal point; the eye has no path. Fix: two weights (500 body, 700 emphasis); one accent per card (the member colour on avatar + progress only); everything else neutral. Route to: `refine`.
- **[P2] Arbitrary spacing** — Location: `.kid-chart-body`, `.chore-section`, `.chore-row-item` (padding 9×11), `.cadence-chore-card`, `.tactical-*` (gaps 6/8/10/12/14/16/18/20 mixed with inline margins). Violates: `#4`. Fix: 4-step space scale (4/8/16/24); section gap 24, row gap 8, card padding 16, nothing else. Route to: `refine`.
- **[P2] Three list-row designs for the same thing** — `.chore-row-item` (Everyone), `.cadence-chore-card` (kid page, 64 px, 14 px radius), `.tactical-task-item` (parent). All are "a checkable item with a title, a value and a status". Violates: `#4`. Fix: one `ChecklistRow` markup/CSS (check, title, meta, trailing action) with variants by content, not by structure. Route to: `audit code` / `refine`.
- **[P2] Three filter/tab designs** — `.tactical-filter-btn` (6 px), `.recurrence-filter-tab` (8 px), `.switch-btn`, `.admin-tab`, `.settings-tab`, `.theme-mode-btn`. Violates: `#4`. Fix: one segmented control. Route to: `refine`.
- **[P2] Delete is as prominent as complete** — `.tactical-delete-btn` is shown 11× on the parent page at 44 px, next to the check. Violates: `#5 Error Prevention`. Fix: quiet icon, revealed on hover/focus or in an overflow menu, with undo toast instead of confirm. Route to: `refine`.
- **[P2] Parent-only controls clutter the kid view** — "Parent Edit", lock icon, "Add Wildcard", "Manage" appear for everyone and several repeat. Violates: `#8`, `#6`. Fix: one parent entry point (a single "Parent" button) that unlocks edit affordances. Route to: `refine`.
- **[P3] Empty states are text-only** — `.chore-section-empty`, empty wildcard card, empty reminders. Fix: one icon + one line + one action each.
- **[P3] Dense kid page** — the page now scrolls (fixed today), but 1024 px of stacked cards means the star goal is below the fold on a 768 px display. Fix after consolidating the repeated stats.

## Persona Red Flags
- **Child (age 8)** — Tapping a row works, but the row, the "+1⭐", the status icon and the progress bar all say "done" in different ways. On the kid page the goal he cares about is far down. Targets: check circle 22 px.
- **Jordan (first-time parent)** — Three differently styled "add" actions (header add, wildcard add ×2, bottom add) and a lock icon with no label. Cannot tell what "Manage" vs "Parent Edit" vs the lock do.
- **Casey (one-handed, interrupted)** — Primary add actions at the top of long scrolling pages; delete sits beside complete at 44 px on the parent page (one mis-tap removes a task).
- **Alex (power user, Dad)** — No way to bulk-complete or reorder; five filter controls on the parent page with different shapes.

## Patterns & Systemic Issues
- **`#4 Consistency & Standards` violated 6×** (type scale, button variants, row designs, tab designs, radii, spacing). The system has tokens for colour but none for type, space or radius, so every component invented its own. The fix is tokens first, components second.
- **`#8 Aesthetic & Minimalist Design` violated 4×** (emoji, repeated stats, weight inflation, parent controls on kid screens).
- **Inline styles (34 in `ChoresModule`, 89 in the bundle)** bypass every token, so a scale change cannot propagate. They need to become classes as part of the same pass.

## Recommended refine plan (in order)
1. **Tokens**: `--text-xs…xl`, `--space-1…4`, `--radius-sm/md/pill`, two font weights. Replace the existing ad-hoc values in the chores CSS and remove inline styles from `ChoresModule`.
2. **Components**: `Button` (primary / secondary / icon), `SegmentedControl`, `ChecklistRow`, `StarProgress`, `SectionHeader`. Delete the duplicates.
3. **Icons**: one Font Awesome icon map (routine type, priority, category, stars, status) in a single JS object; swap every UI emoji; keep emoji only in user-entered chore names.
4. **Hierarchy pass**: kid page order = hero (name + stars + goal, once) → today's routines → weekly/monthly → activity; Everyone board keeps the 3-column layout with lighter headers.
5. **Parent controls**: one "Parent" entry point; quiet delete with undo.
6. **Verify** in both themes at 1024×768 and 375×812, with contrast and 44 px target checks.

## Decisions needed before refine
- **Icon set**: Font Awesome 6 Free (already loaded, solid style) vs Lucide or Phosphor (cleaner outline look, new dependency). Recommendation: Font Awesome — zero new dependency.
- **Emoji in chore names** (`Clean Up Bedroom 🧸`, `Brush Teeth 🪥`): keep as the family's own content, strip from seed data, or strip everywhere? Recommendation: strip from seed data and defaults; leave whatever the family types.
- **Scope**: chores page only first, or the same token pass across Calendar and Meals so the whole app matches? Recommendation: chores first, tokens defined globally so the other views can follow cheaply.

---

## Remediation (same day, branch `refine-chores-design`)

| Metric (per screen) | Before | After |
|---|---|---|
| Font sizes | 9–11 | 4–5 (`--text-xs…xl`) |
| Font weights | 4–6 | 2 (400, 700) |
| Border radii | 5–6 | 4 |
| Button/clickable variants | 8–9 | 3–7 (primary, secondary, quiet icon, segmented) |
| Emoji in rendered text | 49–52 / 12 | 11 / 1 (member avatars and wildcard names only) |
| Inline styles in chores templates | 34 | 0 |

Changes: tokens for type, space, radius and control height; one `.check-row`, `.item-card`, `.tag`, `.seg`, `.meter`, `.icon-quiet` and button scale; Font Awesome replaces every UI emoji (toasts pick an icon by meaning); the chores render code builds from shared helpers instead of three copies; one parent entry point ("Manage"); the duplicate wildcard Add/Manage buttons are gone; quiet delete with Undo; the fake "3-day streak" badge is removed (it was static seed data); `triggerStarPop` reuses one AudioContext (browsers cap them); seed chore, routine and task names lose their emoji. Existing saved state on a device is untouched, so a tablet keeps its current chore names until edited.

Verified headless at 1280×800 and 375×812, light and dark: no page errors, no horizontal overflow, stars/keyboard/claim/undo/PIN flows pass.
