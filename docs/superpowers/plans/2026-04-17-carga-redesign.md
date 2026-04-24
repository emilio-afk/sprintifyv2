# Carga Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `Carga` view so the header is ordered, the mode switch has breathing room, the people lanes become cleaner operational rows, and the historical mode shares the same visual system.

**Architecture:** Keep the work scoped to the existing `Carga` rendering path instead of introducing a new page or component system. Update the `renderByPersonView` markup in `js/ui/ui.js`, restyle the existing lane and toolbar classes in `index.html`, and remove the collapsed-row context-menu path so the visible UI matches the approved minimalist behavior.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript, Chart.js, Font Awesome, Lucide

---

## File Map

- `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`
  Responsibility: render the `Carga` toolbar, current-mode lane rows, historical-mode content, and lane interaction handlers.
- `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`
  Responsibility: define the CSS tokens and layout rules used by the `Carga` toolbar, list header, swimlanes, history cards, and responsive breakpoints.

## Implementation Notes

- Keep the route and data model intact.
- Do not introduce a new test framework for this redesign pass; the repo does not currently have one, so verification stays on syntax checks plus browser QA.
- Make one commit per task once the browser behavior for that task is stable.

### Task 1: Restructure the `Carga` header into clear zones

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Replace the current toolbar markup in `renderByPersonView` so the top area renders as: primary controls row (`Actual | Histórico`, `Sprint`, `Filtros`) followed by a lightweight context-summary row.
- [ ] Remove the always-visible density icon button from the primary row and keep only the filters action visible in the right-side actions area.
- [ ] Change the mode switch buttons from `flex-1` tabs to content-width segmented buttons with more horizontal padding and consistent 36px control height.
- [ ] Convert `.person-scope-strip` from a pill-like box into low-emphasis contextual text with lighter separators and no strong background container.
- [ ] Keep the filters panel behavior intact, but visually subordinate it so it reads as optional advanced controls rather than part of the main header.

### Task 2: Rebuild the collapsed people lane into a four-zone operational row

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Rewrite the collapsed lane markup in `renderByPersonView` so each row has four stable zones: identity, state, bar, and right-side result.
- [ ] In the left zone, keep avatar, name, and one short secondary line only; do not repeat the same state in multiple places.
- [ ] In the state zone, keep a restrained semantic label (`Subutilizado`, `En rango`, `Al límite`, `Sobrecargado`) and reduce chip prominence so it no longer competes with the name.
- [ ] In the bar zone, keep a single clean capacity bar and remove decorative row washes that make the full lane feel tinted.
- [ ] In the right zone, flip the metric emphasis so `pts / capacidad` is primary and percentage is secondary.
- [ ] Keep `Sin asignar` pinned at the top, but restyle it as an exception lane with direct copy such as `76 tareas sin dueño`.

### Task 3: Remove low-value collapsed-row actions and align sorting with the new row grid

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Remove the trailing `person-context-btn` markup from collapsed rows and delete the associated `openPersonContextMenu` interaction path from `js/ui/ui.js`.
- [ ] Remove the related context-menu CSS blocks in `index.html` so there is no hidden styling left for a control that no longer exists.
- [ ] Keep the chevron as the only collapsed-row affordance and ensure it continues to toggle the expanded lane body through `data-person-toggle`.
- [ ] Update `.person-list-header-inner` and related header-cell styles so `Persona`, `Completado`, and `Carga` visually align with the redesigned lane columns.
- [ ] Keep active sorting visible through quiet emphasis only; the user should understand the active order without heavy badges or extra chrome.

### Task 4: Bring `Histórico` and mobile behavior into the same visual system

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Restyle the historical mode header so it uses the same top-level hierarchy as the current mode instead of feeling like a separate screen.
- [ ] Reduce the visual weight of historical KPI pills and cards so the page still reads as workload analysis, not a chart dashboard.
- [ ] Keep the current historical analytics content, but tighten spacing, surfaces, and headings so it inherits the same calmer language as the redesigned current view.
- [ ] Update responsive CSS so mobile stacks the controls as `Actual | Histórico`, then `Sprint`, then `Filtros`.
- [ ] Ensure column headers can collapse away on mobile while each lane still explains itself through its internal content and metric layout.

### Task 5: Clean up, verify, and capture manual QA

**Files:**
- Modify: none

- [ ] Run `node --check '/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js'` and confirm there are no syntax errors.
- [ ] Run `npm run lint` from `/Users/milloemilio/Desktop/sprintify ok/S19` and fix any issues introduced by the redesign work.
- [ ] Run `rg -n "person-context-btn|person-context-dropdown|data-person-context|fa-table-cells|fa-table-cells-large" '/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js' '/Users/milloemilio/Desktop/sprintify ok/S19/index.html'` and confirm only the intended affordances remain.
- [ ] Manually verify in the browser that: the segmented control has breathing room, the summary line no longer looks like a boxed widget, rows read left-to-right without trailing noise, `Sin asignar` is clearly distinct, sorting headers align with row content, and mobile stacking follows the approved order.
- [ ] Commit the completed redesign work with one final message that reflects the `Carga` UI redesign once manual QA is complete.

## Self-Review

### Spec Coverage

- Header hierarchy and breathing room: covered by Task 1.
- Lane simplification and removal of low-value controls: covered by Tasks 2 and 3.
- Filters, expansion, and historical continuity: covered by Tasks 1, 3, and 4.
- Visual system and responsive behavior: covered by Tasks 2 and 4.
- Verification and implementation closeout: covered by Task 5.

### Placeholder Scan

- No placeholder markers or deferred implementation notes remain in this plan.
- Every task points to exact repo files and concrete UI areas to change.

### Scope Check

- The work stays inside the existing `Carga` view and does not branch into unrelated app surfaces.
- No separate subsystem plan is needed; this is one bounded redesign inside the same page flow.
