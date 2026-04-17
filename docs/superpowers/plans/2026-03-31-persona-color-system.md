# Persona Color System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic green lane wash in `Por Persona` with a hybrid semantic color system where lane color communicates risk/capacity and inner content communicates work status.

**Architecture:** Keep the implementation scoped to existing `Por Persona` CSS and rendering logic. Introduce centralized semantic tokens in `index.html`, bind lane state classes to those tokens, and align historical KPIs/charts in `js/ui/ui.js` with the same palette so all visual semantics stay coherent.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript, Chart.js

---

### Task 1: Add semantic color tokens and lane-state bindings

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Add `:root` tokens for lane semantics (`overloaded`, `at-limit`, `optimal`, `underloaded`) and work-state semantics (`done`, `in-progress`, `todo`, `free`).
- [ ] Bind `.person-lane--*` classes to local CSS variables such as `--person-lane-strong`, `--person-lane-soft`, `--person-lane-chip-bg`, and `--person-lane-chip-text`.
- [ ] Remove the generic brand-green tint from `.person-swimlane-toggle` and make hover/focus neutral.

### Task 2: Apply semantic colors to lane internals

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/index.html`

- [ ] Update lane chip, text, dot, percentage, and numeric emphasis styles to use lane semantic variables.
- [ ] Update work-state bars and legend chips so `done` is blue, `in progress` is teal, `todo` is copper, and `free` is neutral.
- [ ] Ensure four visible lane tones remain distinct while keeping backgrounds subtle.

### Task 3: Align historical KPIs and charts

**Files:**
- Modify: `/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js`

- [ ] Replace hardcoded historical KPI accent classes with semantic CSS helper classes.
- [ ] Update Chart.js datasets so completed work uses `done` blue, live load uses teal, pending uses copper, capacity uses neutral gray, and risk counts use the lane semantic palette.
- [ ] Keep the historical table mostly neutral, but align heat/average emphasis with the approved semantic direction.

### Task 4: Verify

**Files:**
- Modify: none

- [ ] Run `node --check '/Users/milloemilio/Desktop/sprintify ok/S19/js/ui/ui.js'`
- [ ] Verify CSS references via `rg` for old green lane wash and mismatched semantic colors.
- [ ] Summarize what changed and note any remaining visual checks that require manual browser review.
