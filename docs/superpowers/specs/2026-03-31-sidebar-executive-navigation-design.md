# Sidebar Executive Navigation Design

## Summary

Approved direction for the left sidebar is a more executive, operation-first information architecture.

The sidebar should stop sounding like a taxonomy of agile artifacts and start sounding like a management cockpit for daily execution.

Primary principle:

- Prioritize `operación diaria` over structural categorization.

## Goals

- Make the first navigation choices useful for daily work.
- Reduce cognitive load by grouping views around decisions, not technical objects.
- Use clearer, more executive labels.
- Keep route structure intact while improving grouping and labeling.
- Introduce a transition label for `Iniciativas (Epics)` so the team can adapt gradually.

## Approved Information Architecture

### 1. Operación

This is the highest-priority group and should appear first.

- `Sprint`
- `Carga`

Intent:

- `Sprint` becomes the operational home for daily execution.
- `Carga` reframes `Por Persona` around workload and management signal instead of layout format.

### 2. Planeación

This group contains work-shaping views.

- `Backlog`
- `Iniciativas (Epics)`

Intent:

- `Backlog` remains the primary intake and planning queue.
- `Iniciativas (Epics)` introduces clearer business language while preserving team familiarity through the transitional parenthetical.

### 3. Seguimiento

This group contains monitoring and historical review.

- `Resumen`
- `Cronograma`
- `Historial`

Intent:

- `Resumen` is the executive snapshot.
- `Cronograma` is the time-based view.
- `Historial` replaces the more literal label `Sprints Archivados`.

### 4. Sistema

This remains in the footer area.

- `Manual`
- `Configuración`

Intent:

- Keep utility and reference items away from daily execution paths.

## Naming Changes

Approved naming:

- `Sprint Activo` -> `Sprint`
- `Por Persona` -> `Carga`
- `Epics` -> `Iniciativas (Epics)`
- `Resumen de Sprints` -> `Resumen`
- `Sprints Archivados` -> `Historial`
- `Manual de Equipo` -> `Manual`

## Lucide Icon Mapping

Approved icon direction:

- `Sprint` -> `flag`
- `Carga` -> `users`
- `Backlog` -> `list-todo`
- `Iniciativas (Epics)` -> `folder-kanban`
- `Resumen` -> `clipboard-list`
- `Cronograma` -> `calendar-range`
- `Historial` -> `archive`
- `Manual` -> `book-copy`
- `Configuración` -> `settings-2`

## Interaction Rules

- Group headers stay as text labels, not destination links.
- Icons are used on destination items, not group titles.
- `Operación` should be expanded by default.
- `Planeación` should also be expanded by default.
- `Seguimiento` can remain collapsed by default.
- `Sistema` stays in footer.

## Content and Route Rules

- Existing route hashes remain unchanged.
- This change is primarily about grouping, iconography, and labels.
- `Carga` still routes to `#by-person`.
- `Iniciativas (Epics)` still routes to `#epics`.
- `Historial` still routes to `#archived-sprints`.

## Tone

The sidebar should feel:

- executive
- clear
- operational
- less “framework taxonomy”
- more “decision-oriented”

## Out of Scope

- changing underlying routes
- changing the actual destination behavior of views
- redesigning the entire shell layout
- introducing new sidebar modules beyond the current view set
