# Settings Tabs & Meal Ideas Refinement

- **Date**: 2026-10-03
- **Focus**: Settings Modal IA & Meal Ideas Management

## What was changed

1. **Tabbed Information Architecture for Settings**:
   - Organized settings into 4 dedicated tabs: **Calendar**, **Todos**, **Meals**, and **General**.
   - Added accessible ARIA tab patterns (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, `tabindex`) with arrow key navigation support (`ArrowRight`, `ArrowLeft`, `Home`, `End`).

2. **Categorization**:
   - **Calendar**: Family member to Home Assistant calendar mapping (`calendar.entity_id`), autocomplete datalist, and instant calendar synchronization button.
   - **Todos**: Google Keep and Google Tasks Home Assistant todo entities, Google Keep web link, plus interactive Family Member Star Targets and goal reward controls for kid chore charts.
   - **Meals**: Home Assistant meal ideas and weekly meal plan todo entities, plus the full Meal Ideas Library manager.
   - **General**: Color theme selector (Light, Auto, Dark), Home Assistant core connection settings with live connection tester, Immich photo screensaver connection/timing settings, and sample data reset.

3. **Meal Ideas Management**:
   - Built a comprehensive Meal Ideas Manager directly inside the Meals tab.
   - **Add**: Quick add field supporting keyboard `Enter` and button click, adding to local storage and Home Assistant (`todo/add_item`).
   - **Modify**: Inline editing with `Save` (check) and `Cancel` (xmark) actions, supporting `Enter` to save and `Escape` to cancel (`todo/update_item`).
   - **Remove**: Dedicated trash button with removal from both local state and Home Assistant (`todo/remove_item`).
   - **Filter**: Real-time search/filter input with active matching count badge.
   - **Sync**: Instant reactivity with the Meal Picker popover in the main weekly planner view.
