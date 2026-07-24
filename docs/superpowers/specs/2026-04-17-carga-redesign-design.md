# Carga Redesign Design

## Summary

Approved direction for the `Carga` view is a minimalist, professional, and operational redesign that reduces chrome, restores hierarchy, and makes the list of people the primary object on screen.

The redesign should stop treating the page as a loose collection of controls, chips, summaries, and lane accessories, and instead present it as a clear management surface for workload review.

Primary principle:

- prioritize scanability and decision-making over visual decoration

## Goals

- Give the top area a clear hierarchy and a stable layout.
- Make `Actual` and `Histórico` feel like deliberate view modes, not cramped tabs.
- Reduce the number of always-visible controls to the few that matter most.
- Redesign each person lane so it reads quickly from left to right.
- Remove actions and chrome that do not support a real user decision.
- Keep the visual language consistent with the existing product shell.

## Current Problems

- The header mixes breadcrumb, page title, mode switch, sprint selector, filters, and summary without clear grouping.
- `Actual` and `Histórico` feel compressed and do not have enough horizontal padding.
- The upper menu texts feel dispersed because they do not belong to distinct visual zones.
- The scope summary has too much visual presence for secondary context.
- Person lanes feel overdesigned in the wrong places: too many small controls and repeated signals, not enough hierarchy.
- The trailing contextual button at the end of each lane adds little value in the collapsed state.

## Approved Layout Structure

### 1. Context

The top of the page should be split into a small breadcrumb and a dominant page title.

- breadcrumb: `Workspace / Operación / Carga`
- title: `Carga`

Intent:

- establish location first
- establish page purpose second
- avoid mixing navigation context with operational controls

### 2. Primary Controls

The main control row should contain only:

- `Actual | Histórico`
- `Sprint`
- `Filtros`

Rules:

- `Actual | Histórico` becomes a real segmented control with comfortable horizontal padding
- the mode switch and sprint selector stay grouped together because both change the scope of the view
- `Filtros` sits on the right as the only visible secondary action
- density toggle and low-frequency controls move into the filters panel

### 3. Context Summary

A lightweight text row should appear below the primary controls:

- `Todos los sprints activos · 6 personas · 232 tareas · 33/240 pts · 18 pts hechos`

Rules:

- this summary is contextual, not promotional
- it should not appear as a high-emphasis card
- alerts such as overload appear only as exceptions at the end of the line

## Approved Person Lane Model

Each lane should be redesigned as a stable operational row with four reading zones.

### 1. Identity

- avatar
- name
- one short secondary line, for example:
  - `30 tareas`
  - `30 tareas · sin avance`

### 2. State

Show a single semantic state:

- `Subutilizado`
- `En rango`
- `Al límite`
- `Sobrecargado`

Rules:

- the state should be short and discrete
- it may appear as text or as a restrained chip
- it should not compete with the name or the load metric

### 3. Visual Load

- one clean horizontal capacity bar
- minimal decoration
- color used only for operational meaning

Rules:

- do not tint the full row with brand green
- keep the bar readable without introducing extra widgets around it

### 4. Result

The right side should prioritize capacity used over raw percentage.

Primary metric:

- `26 / 40 pts`

Secondary metric:

- `65%`

Rules:

- `pts / capacidad` becomes the dominant metric
- percentage becomes supporting information
- the chevron remains only if expansion reveals useful detail

## Elements To Remove Or Reduce

- remove the trailing `···` contextual button from the default collapsed row
- remove repeated state signals that restate the same message in multiple ways
- remove general background washes that make rows feel decorated instead of informative
- remove persistent accessory controls that do not change a decision in collapsed view

## Special Case: Unassigned

`Sin asignar` remains at the top of the list but should be visually treated as an exception case, not as a normal person row.

Rules:

- use neutral-alert styling
- simplify copy to direct operational language such as `76 tareas sin dueño`
- keep it clearly separate from named team members

## Filters And Expansion Rules

### Filters

Always visible:

- `Actual | Histórico`
- `Sprint`
- `Filtros`

Inside the collapsible filters panel:

- persona
- búsqueda
- estado
- orden

Rules:

- do not show chips, badges, pills, and toggles all at once unless the user is actively filtering
- do not duplicate the same control in both the main row and the advanced panel

### Expansion

The collapsed lane should solve most user needs.

Rules:

- collapsed state should answer the primary question: who is loaded, how much, and in what condition
- expanded state should reveal actionable detail such as real tasks or useful columns
- if expansion does not reveal meaningful detail, it should be reconsidered
- the chevron communicates `ver detalle`, not `más acciones`

## Historical View Rules

`Histórico` should feel like the same view system, not a separate product surface.

Rules:

- keep the same header structure
- keep the same primary controls
- change only the central content area

Approved content model:

- top: concise historical KPIs
- below: trend content and a summarized table

Constraint:

- avoid overloading the page with charts if the main job is still to understand workload by person

## Column And Sorting Rules

The list header should align tightly with the row content.

Columns:

- `Persona`
- `Completado`
- `Carga`

Rules:

- labels must align with actual row data positions
- active sorting should be visible but quiet
- users should understand why a row is high or low in the list without excessive explanation

## Visual System

The page should feel executive, calm, and deliberate.

### Surface

- clear overall background
- neutral row surfaces
- minimal container chrome

### Color

Reserve color for meaning:

- risk
- progress
- alerts

Rules:

- brand green remains for system UI and focus states
- brand green should not wash workload rows

### Spacing

- clear breathing room between breadcrumb, title, and controls
- consistent control height: `36px` desktop, `34px` mobile
- more vertical padding inside rows
- separation through whitespace, not heavy borders

### Typography

- strong page title
- small, restrained labels for context and column headers
- person name as the primary row entry point
- load metric strong, but not louder than the entire row

## Responsive Behavior

### Desktop

- one compact primary controls row
- one contextual summary line below
- list header aligned to row content

### Mobile

Approved stacking:

- first row: `Actual | Histórico`
- second row: `Sprint`
- third row: `Filtros`

Rules:

- column headers may collapse away on mobile
- each lane must carry its own semantic clarity when headers are hidden

## Implementation Guidance

- simplify `person-toolbar-main` into contextually clear zones
- turn `person-scope-strip` into low-emphasis contextual text
- remove `person-context-btn` from the default collapsed lane
- rebuild the internal lane layout around a more stable grid
- reduce the visual dominance of `%`
- elevate `pts / capacidad` as the main right-side metric
- keep `Sin asignar` as a special case above the list
- ensure `Actual` and `Histórico` share the same design language

## Out Of Scope

- changing workload formulas
- redefining capacity targets
- redesigning the global application shell
- changing route structure
- changing non-related product views
