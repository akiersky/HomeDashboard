# Craft Audit — Chores & Mission Board

**Date**: 2026-10-04  
**Target**: `family-dashboard` — Todos, Kids' Mission Board, & Kid Dashboards (`#view-chores`, `ChoresModule`)  
**Auditor**: UX Atlas Craft Reviewer  
**Status**: All Findings Remediated & Verified  

---

## Health Score (Remediated)

| # | Dimension | Initial | Post-Fix | Key Improvement |
|---|---|---|---|---|
| 1 | **Visual Hierarchy & Cognitive Load** | 2/4 | 4/4 | All stars and goals consolidated into the hero name bar; removed duplicate summary card and eliminated padlock icons. |
| 2 | **Information Architecture & Navigation** | 2/4 | 4/4 | Kid headers on homepage cards are clickable drill-down targets; redundant "Kids Dashboard" back button removed in favor of top navbar filter chips. |
| 3 | **Consistency & Anti-Patterns** | 2/4 | 4/4 | Full multi-cadence chore model (`daily`, `weekly`, `monthly`) in state, modals, and dedicated dashboard sections. |
| 4 | **Responsive Behavior** | 3/4 | 4/4 | Generous ≥44px touch targets across weekly/monthly cadence cards, wildcard action buttons, and modal dialogs. |
| 5 | **Delight & Craft Heuristics** | 3/4 | 4/4 | Prominent 18px glowing gradient progress bar with live percentage badges and celebratory milestone claims. |
| **Total** | | **12/20** | **20/20** | **Excellent (18–20)** |

---

## What's Working
1. **Gamified Micro-Interactions**: Checking off daily routines and mission items immediately triggers playful star pop animations (`🌟 +Star!`) with synthetic AudioContext chimes, providing instant positive reinforcement.
2. **Clear Routine Grouping**: Daily routines are cleanly divided into temporal routines (☀️ Morning, 🎒 After School, 🌙 Bedtime) that match a child's natural daily schedule.
3. **Collaborative Wildcards**: Shared wildcard bonuses foster cooperative or friendly competitive motivation between siblings for larger household tasks.

---

## Findings (Task List, Most Impactful First)

- **[P1] Fragmented Star Progress & Redundant Summary Card** — Location: `js/bundle.js:renderKidAchievementsPage()`, `styles.css:.kid-star-summary-card`. Violates: `#8 Aesthetic & Minimalist Design`. Impact: Star count and goal reward are duplicated in two disparate locations on the screen, creating visual clutter and diluting the child's focus. Fix: Consolidate all star metrics, target reward badges, and an enlarged, prominent progress bar into the top hero name bar; remove the duplicate summary card. Route to: `refine`.
- **[P1] Kid Names on Homepage Mission Board Lack Drill-down Affordance** — Location: `js/bundle.js:renderKidChart()`, `index.html:#todos-kids-main-container`. Violates: `#7 Flexibility & Efficiency of Use`. Impact: Parents and kids instinctively tap the child's prominent name card or avatar at the top of their column to view achievements, but nothing happens; they must hunt for a secondary text link at the bottom. Fix: Make the kid name and avatar header clickable buttons with hover states, cursor pointers, and touch affordance to switch to that child's dashboard. Route to: `refine`.
- **[P1] Lock Icon Proliferation & High-Friction Admin Gating** — Location: `index.html:#admin-lock-btn`, `#btn-adult-wildcard-manage`, `js/bundle.js:renderWildcardChores()`. Violates: `#8 Aesthetic & Minimalist Design` & `#5 Error Prevention`. Impact: Overt padlock icons across the interface create an adversarial, restrictive feel in a family environment. Fix: Replace lock icons with friendly `+ Add Chore` and `+ Add Wildcard` action buttons that prompt for the 4-digit PIN only upon execution. Route to: `refine`.
- **[P2] Lack of Weekly & Monthly Chore Cadence** — Location: `js/bundle.js:ChoresModule`, `DEFAULT_STATE.chores`, `index.html:#chore-modal`. Violates: `#7 Flexibility & Efficiency of Use`. Impact: Household chores that recur weekly (washing sheets, taking out recycling) or monthly (deep cleaning closet, washing pet bed) cannot be scheduled without cluttering the daily checklist every morning. Fix: Introduce `frequency: 'daily' | 'weekly' | 'monthly'` in state, filter homepage mission board to daily items, and dedicate a prominent section on the kid's dashboard for weekly and monthly chores. Route to: `refine`.
- **[P2] Redundant "Kids Dashboard" Back Button** — Location: `js/bundle.js:2939`, `3126`. Violates: `#4 Consistency & Standards`. Impact: Placing a dedicated "Kids Dashboard" button inside the individual dashboard header clashes with the universal member navigation pills ("Everyone", "Mom", "Dad", "Alex", "Sam") in the main navbar. Fix: Remove the redundant button and rely on consistent member filter pill navigation. Route to: `refine`.
- **[P3] Hero Star Progress Bar Lacks Visual Prominence** — Location: `styles.css:.kid-hero-star-jar`, `.progress-bar-track`. Violates: `#6 Recognition Rather Than Recall`. Impact: The 10px progress bar in the hero card is too understated to feel like a central motivational trophy for children. Fix: Thicken the progress bar to 16–18px, add gradient track styling, a percentage badge, and clear goal indicators. Route to: `refine`.

---

## Persona Red Flags

- **Riley (Household Organizer / Parent)**:
  - Intimidated by multiple padlock icons when wanting to quickly award a bonus wildcard chore.
  - Frustrated that weekly chores (trash day, laundry day) have to be manually tracked or clutter the children's daily morning checklist.
- **Jordan (7-Year-Old Child / Chore Completer)**:
  - Taps their big colorful name tag on the kitchen wall kiosk expecting to see their star trophies and badges, but the header is unresponsive.
  - Gets confused seeing their star count in two different places on their dashboard with different styles.
- **Casey (Kitchen Kiosk Touchscreen User)**:
  - Reaching up to tap the small "Kids Dashboard" back button in the hero header is awkward when the persistent top navigation bar already has the family filter chips.

---

## Patterns & Systemic Issues

- **Heuristic #8 (Aesthetic & Minimalist Design) violated across multiple chore sub-views**: Duplicate information display (stars in hero + stars in card below), padlock iconography, and redundant navigation buttons add extraneous visual elements that compete with primary task completion.
- **Temporal Cadence Gaps**: The previous data model assumed all chores were either daily routines or one-off items. Family chore charts naturally have multi-tiered cadences (Daily, Weekly, Monthly) that require first-class support in data schema, modal creation forms, and dashboard layouts.
