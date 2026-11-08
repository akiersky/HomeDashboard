# ADR 0002: Single Header Architecture for Individual Task Dashboards and Stars-Only Rewards

- **Status:** Accepted
- **Date:** 2026-10-03
- **Owner:** `decisions` skill

## What was decided
1. **Single Header Architecture for Individual Dashboards:**
   - In individual task views (for both kids and parents), the top general `.chores-header-bar` is hidden (`display: none`).
   - The individual contextual hero header card (`.kid-hero-card` for kids, `.parent-hero-card` for parents) acts as the single, authoritative header for the view.
   - All necessary primary controls (e.g. `+ Add Chore`, `+ Add Task`, `+ Add Reminder`, `< Kids Dashboard` navigation) reside within this single header, preventing vertical header stacking.
2. **Deferring Badges in Favor of a Pure Stars Economy:**
   - Gamification badges, trophy rooms, and rank badges were removed from individual dashboards.
   - Motivation and progress are streamlined around a clean **Stars-only** system:
     - Real-time routine & chore star earnings (`+1⭐`, `+2⭐`, etc.)
     - Progress toward a tangible target reward (`${member.stars} / ${member.targetStars} Stars`, progress bar, and reward goal)
     - A dedicated "Recent Star Activity" log showing chronological completion timestamps and star gains.

## Why
- Dual headers (the top chore bar plus the member hero card) consumed unnecessary vertical screen space on kitchen smart displays (e.g. wall tablets, touchscreens) and caused visual redundancy with duplicated titles, subtitles, and add buttons.
- Combining badges and stars created cognitive clutter for younger children before the baseline routine habit loop was established. Stars tied to concrete real-world goals (like Lego sets or family outings) provide clear, immediate motivation.

## What was rejected and why
- **Keeping the top `.chores-header-bar` and deleting the hero cards:** Rejected because hero cards provide crucial member personalization (avatars, distinct member theme colors), live star jar progress bars, and contextual tactical metrics that the generic header bar lacked.
- **Keeping badges in a secondary modal or collapsed accordion:** Rejected to keep the interface focused and simple; badges can be revisited later once daily routine adherence is consistent.

## Scope
Applies to the Todos/Chores module (`#view-chores`), specifically `ChoresModule.prototype.updateHeaderInfo`, `renderKidAchievementsPage`, `renderParentTacticalPage`, and associated styles.
