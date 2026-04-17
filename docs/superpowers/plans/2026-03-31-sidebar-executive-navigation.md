# Sidebar Executive Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the left sidebar around an executive, operation-first information architecture while preserving the existing routes and behavior of the underlying views.

**Architecture:** Keep the current sidebar component and route hashes intact. Update only the navigation grouping, labels, Lucide icons, default expanded sections, and view titles that would otherwise contradict the new naming.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript, Lucide icons

---

### Task 1: Update sidebar IA and naming in markup

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Reorder groups to `Operación`, `Planeación`, `Seguimiento`, and footer `Sistema`.
- [ ] Rename links to `Sprint`, `Carga`, `Iniciativas (Epics)`, `Resumen`, `Historial`, and `Manual`.
- [ ] Apply the approved Lucide icons to each destination item.

### Task 2: Set default expansion behavior

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`

- [ ] Mark `Operación` and `Planeación` as default-open groups in the markup.
- [ ] Update sidebar render logic so default-open groups stay expanded on route changes, while the active group also expands when needed.

### Task 3: Align visible titles with the new naming

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`

- [ ] Change the `#by-person` rendered title from `Por persona` to `Carga`.
- [ ] Change fallback sprint title wording from `Sprint Activo` to `Sprint`.

### Task 4: Verify

**Files:**
- Modify: none

- [ ] Run `node --check '/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js'`
- [ ] Inspect the updated sidebar labels via `rg` to confirm the approved names are present.
- [ ] Summarize manual checks needed in browser for expanded groups, active states, and collapsed-sidebar tooltips.
