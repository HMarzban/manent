# 0031. The interface does not render on editor transactions

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

In a long document every keystroke has a small time budget. The editor core's own share of it is small. What pushes a keystroke over budget is work around the editor: interface components rendering again, and plugins that walk the whole document.

In a throwaway prototype (bare ProseMirror with no interface, headless Chromium on one machine, synthetic script text), ProseMirror's own share of a keystroke at 1,000 flat pages was about 1.3 ms of 18 ms; the rest was the browser's own editing, style, layout and paint.

## Options considered

- Interface components that read the editor state directly and render on every change. Rejected: each keystroke would render toolbars and panels.
- Node views rendered by the interface framework for ordinary blocks. Rejected: a component per block multiplies render work with the length of the document.
- Derived values behind an equality check, and plain DOM inside the editor. Chosen.

## Decision

Toolbars and panels subscribe to values derived from the editor state, through a selector with an equality check, so they render only when a value they show has changed. Ordinary blocks have no framework-rendered node view; where a node view is needed, it is plain DOM. A plugin that walks the whole document on a transaction is a defect.

## Consequences and trade-offs

- Typing cost does not depend on the interface.
- Each value the interface shows has to be published explicitly, and plugins need incremental logic instead of a simple full pass.
- Only part of this is checked by the gate: `tools/boundaries.config.ts` keeps the ProseMirror packages out of `ui` and `apps/web`. The rest is checked in review.

## Revisit when

The benchmark shows that rendering stays off the keystroke path but typing is still over budget, which would point somewhere else.
