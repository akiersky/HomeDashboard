# ADR 0001: Kids Dashboard Side-by-Side Layout and Adult-Only Wildcard Permissions

- **Status:** Accepted
- **Date:** 2026-10-03
- **Owner:** `decisions` skill

## What was decided
1. **Side-by-Side Kids Todo Layout:** The main kids chore view is structured as a 3-column layout (`1fr 1fr 340px`):
   - **Column 1:** Alex's chore chart (routines and daily chores)
   - **Column 2:** Sam's chore chart (routines and daily chores)
   - **Column 3 (Far Right):** Available Wildcard chores panel
2. **Elimination of Redundant Sidebar Cards:** The standalone star rewards card and sidebar badges panel on the left were removed from the kids main dashboard because stars, progress, and goals are already integrated into each child's card header and dedicated achievement views.
3. **Adult-Only Wildcard Creation & Modification:** Only parents with verified PIN access can create, edit titles/points, or delete wildcard chores. Kids can only claim available wildcard chores from their board. Standard chore addition (`#chore-modal`) only permits assigning to specific kids, not wildcards.

## Why
On a shared family kitchen smart display (e.g. wall tablet, touch display), both kids need to see their routines simultaneously without flipping tabs or losing their place. Stacking or separating them caused friction during morning and bedtime routines. Wildcards serve as high-value incentive rewards; allowing kids to add or edit them created an exploit vector where star rewards could be inflated without parental oversight.

## What was rejected and why
- **Keeping separate tabbed views for each kid on the main dashboard:** Rejected because kitchen displays are shared ambient surfaces; toggling back and forth between siblings during shared morning/evening rush caused confusion and friction.
- **Keeping the left star reward jars sidebar:** Rejected because it duplicated the star counts already visible in each kid's card header and took up 280px of horizontal space that was needed for side-by-side kid charts.
- **Allowing kids to create wildcard chores from the standard "Add Chore" modal:** Rejected because wildcard chores reward bonus stars; parents must maintain authority over the reward economy and available bonus tasks.

## Scope
Applies to the main Todos/Chores view (`#todos-view`), the chore creation modal (`#chore-modal`), and the admin panel (`ChoresAdminModule`). Individual kid achievement pages and parent tactical views remain separate and contextual.
