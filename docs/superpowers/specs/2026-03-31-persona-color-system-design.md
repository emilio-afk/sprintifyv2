# Persona Color System Design

## Summary

Approved direction for `Por Persona` is a hybrid semantic color system:

- Lane color communicates `risk/capacity`.
- Internal lane content communicates `work status`.
- Brand green remains reserved for system UI, not operational meaning inside lanes.

This design also includes one immediate visual correction:

- Remove the general green wash from collapsed lanes.
- Keep four visible lane tones, but make them semantic and controlled.

## Why

The current view mixes brand color with operational meaning. That makes the lanes feel green even when the state being shown is not "healthy" or "optimal", and it blurs two different questions:

1. How healthy is this person's load?
2. Where is this person's work right now?

The new system separates those meanings.

## Semantic Model

### 1. Lane semantics: risk / capacity

Lane-level color answers: `How is this person doing in terms of load?`

- `Overloaded`
  - strong: `#A84D57`
  - soft: `#F7E9EB`
- `At limit`
  - strong: `#7E6F40`
  - soft: `#F4EFDF`
- `Optimal`
  - strong: `#4E698E`
  - soft: `#EBF1F8`
- `Underloaded`
  - strong: `#7A7567`
  - soft: `#EFEEE9`

### 2. Work semantics: task state

Inner lane color answers: `Where is the work?`

- `Done`: `#476C9B`
- `In progress`: `#0F8C76`
- `Todo`: `#C38C47`
- `Free`: `#D9DDD2`

### 3. Brand/system UI

System-level UI continues to use brand green:

- active tabs
- focus rings
- CTA and toolbar actions
- generic product UI signals

Brand green should not be used as the semantic color for `optimal` lanes.

## Application Rules

### Lane-level elements

These use the lane semantic family:

- lane left border
- lane background tint
- lane risk chip
- lane risk/status dot
- utilization percentage
- load/capacity numeric emphasis

### Work-state elements

These use the work-state family:

- capacity bar segments
- work legend chips
- internal breakdowns
- micro-stats derived from done / in progress / todo / free

### Interaction states

Hover and focus should not inject semantic color into the lane background.

- hover remains neutral
- focus uses system focus styling
- semantic meaning should come from the lane's assigned state, not from interaction chrome

## Historical View Rules

Historical view should remain consistent with the same semantic split:

- `done` metrics and historical heat values use `Done` blue
- `live load` uses `In progress` teal
- pending/open future work uses `Todo` copper
- capacity reference uses neutral gray
- overloaded counts use overloaded red
- unassigned stays neutral

The historical table should stay mostly neutral and only tint values by the meaning of the metric being displayed.

## Immediate Visual Fix

The current collapsed lane header has a general green tint caused by a background mix using brand green.

Approved fix:

- remove the general brand-green wash from collapsed lane backgrounds
- keep lane tint tied only to semantic state
- maintain four visible state families

## Implementation Notes

The implementation should:

- remove green brand tint from `.person-swimlane-toggle`
- assign per-state semantic tint to lane container/header
- keep bar/legend colors separate from lane-state colors
- preserve accessibility contrast and non-color cues

## Out of Scope

- changing risk calculation logic
- redefining capacity formulas
- redesigning all product colors outside `Por Persona`
- changing brand green itself
