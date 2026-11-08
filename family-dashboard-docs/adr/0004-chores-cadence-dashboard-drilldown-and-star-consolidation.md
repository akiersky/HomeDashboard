# ADR 0004: Multi-Cadence Chores, Homepage Drilldown, Lock Elimination, and Star Progress Consolidation

- **Status:** Accepted
- **Date:** 2026-10-04
- **Owner:** `decisions` skill

## What was decided

1. **Multi-Cadence Chore Model (Daily, Weekly, Monthly):**
   - Chores now carry an explicit `frequency` attribute (`'daily' | 'weekly' | 'monthly'`).
   - The combined homepage Mission Board (`#todos-kids-main-container`) filters exclusively for `daily` chores and time-of-day routines, keeping the daily kitchen kiosk clean.
   - `weekly` and `monthly` chores are housed directly on the child's individual dashboard (`#todos-kid-page-container`), presented above the "Recent Star Activity" history log with interactive check controls and star celebrations.
   - The Add Chore modal (`#chore-modal`) and parent admin panel support creating chores across all three frequencies.

2. **Homepage Kid Card Drilldown Affordance:**
   - On the homepage Mission Board, kid chart headers (`.kid-chart-header`) and name badges are now interactive touch targets (`role="button"`, `tabindex="0"`, cursor pointer, subtle hover lift, chevron indicator) that switch `stateManager.setActiveMember(kid.id)` and render the child's dashboard.

3. **Elimination of Lock Icons in Favor of Action-Gated PIN Prompts:**
   - Padlock icons (`fa-lock`) were removed from the chores header and wildcard sections.
   - Replaced with direct, friendly action buttons: `+ Add Chore` and `+ Add Wildcard`.
   - Clicking these action buttons prompts for the 4-digit parent PIN (default `1234`) via a modal verification callback before opening the creation dialogs, preventing unauthorized self-assignment while removing visual clutter.

4. **Star Progress Consolidation into the Hero Name Bar:**
   - All star metrics, target reward descriptions, and progress tracking are consolidated into the top `.kid-hero-card`.
   - The progress bar was expanded to a prominent 18px thick gradient track with animated glow and percentage badges.
   - The redundant duplicate star summary card (`.kid-star-summary-card`) in the lower right panel was removed.

5. **Removal of Redundant "Kids Dashboard" Back Button:**
   - The duplicate back button inside `.kid-hero-actions` and `.parent-hero-actions` was removed.
   - Member view navigation is handled universally through the persistent top navbar member filter pills (`Everyone`, `Mom`, `Dad`, `Alex`, `Sam`).

## Why
- Dual display of star statistics (in hero bar and a separate summary card below) caused cognitive load and visual redundancy.
- Households naturally divide chores into daily habits (brush teeth, clear table), weekly routines (bed sheets, recycling bins), and monthly tasks (deep cleaning, pet washing). Artificially restricting all chores to daily clutter degraded kiosk utility.
- Pervasive lock iconography created an adversarial feel in a family environment. Action-triggered PIN verification preserves error prevention without ambient visual friction.
- Tapping a child's name tag on a wall touchscreen is a natural, intuitive gesture that users expect to open that child's detailed space.

## What was rejected and why
- **Modal-only Weekly/Monthly Chores:** Rejected because children need continuous visual visibility into their weekly and monthly goals to remain motivated.
- **Requiring PIN on every individual chore checkoff:** Rejected because gamified micro-interactions must stay zero-friction for children checking off their own completed tasks; parental trust with activity logging and admin reset controls is preferred.
- **Retaining the "Kids Dashboard" button:** Rejected because the main navbar already features persistent member filter chips; duplicate back buttons confuse the navigation mental model.

## Scope
Applies to `index.html`, `styles.css`, `js/bundle.js` (`ChoresModule`, `ChoresAdminModule`, `StateManager`), `data/dashboard-data.json`, and `family-dashboard-docs/AUDIT_CRAFT_FINDINGS.md`.
