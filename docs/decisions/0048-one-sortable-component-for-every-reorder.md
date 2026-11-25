# 0048. One sortable component serves every reordered list and grid

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Several surfaces let a person reorder items: scenes in the Scenes tab (both as a virtualised list and as a card grid), acts in the act structure list, labels in the draft ladder in Project settings, and cards across storylines on the series Board. Reordering must work with a pointer, with the keyboard, through registered commands (such as Alt+Up and Alt+Down), and with clear screen-reader announcements on every move.

## Options considered

- Hand-roll HTML drag-and-drop or pointer handlers on each screen that reorders items. Rejected: each screen would have to reimplement keyboard reordering, focus preservation across virtualised rows, and live-region announcements, leading to uneven accessibility.
- Let feature screens import `@dnd-kit/react` directly. Rejected: drag library details and focus workarounds would spread across `apps/web`, violating the UI package boundary and duplicating keyboard and screen-reader behaviour.
- Provide one shared `SortableList` and `SortableArea` component family in `@manent/ui` backed by `@dnd-kit/react` and `@dnd-kit/dom`, used by every reorderable list and grid. Chosen.

## Decision

`@manent/ui` owns one sortable component family (`SortableList`, `SortableLists`, `SortableArea` and `SortableItem`) over `@dnd-kit/react` and `@dnd-kit/dom`, supporting vertical virtualised lists, wrapping card grids, multi-list drags, imperative command moves (`SortableListHandle.move`), focus tracking and screen-reader announcements from `SORTABLE_WORDS`. Every screen that reorders items uses this component rather than talking to the drag library directly.

## Consequences and trade-offs

- Pointer drag, keyboard drag, command moves and screen-reader announcements behave identically across the Scenes tab, Project settings and the Board.
- Virtualised-list scroll workarounds (such as suppressing container scroll offset interference during keyboard drag) live in one place instead of being copied across screens.
- Every reorderable surface adopts the component's item-entry contract (`id` and accessible `label`), and changing the underlying drag library later touches only `@manent/ui`.

## Revisit when

A surface needs freeform two-dimensional canvas positioning that does not fit ordered lists or card grids.
