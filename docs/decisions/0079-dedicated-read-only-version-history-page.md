# 0079. Dedicated read-only Version history page with floating Change-Aware Minimap TOC

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Version history previously lived as a tab inside the editor's narrow right side panel (`Comments | History | Details | Tour`). Placing comparison views, version timelines and restore actions inside the live editing shell created three recurring problems:

1. **Accidental editing during review:** Reviewers inspecting older drafts or comparing two versions still sat inside a live editable ProseMirror document, blurring the boundary between reading history and mutating the working script.
2. **Cramped comparison surfaces:** Side-by-side comparison, diff filters, change steppers and timeline metadata competed with the side panel's fixed width and the left Scenes panel, causing horizontal sheet clipping on laptop viewports.
3. **Hidden entry point and visual noise:** History sat behind the secondary side-panel tab strip rather than beside primary document actions in the title bar, while a docked left-hand outline panel inside the review screen would duplicate Present mode's navigation grammar and shrink the reading stage.

## Options considered

1. **Keep History inside the side panel tab strip and expand the panel when comparing.** Minimal routing work, but keeps the document editable during inspection and leaves Side-by-side comparison cramped alongside open editor panels.
2. **Route to a dedicated `/s/$docId/history` screen that unmounts the editor and adds a docked left-hand outline sidebar.** Separates editing from review, but destroys live editor scroll, selection and undo state on return, and steals horizontal space needed for full-size screenplay sheets and lockstep Side-by-side panes.
3. **Promote History to a top-bar button beside `Share`, navigate to a covered read-only `/s/$docId/history` route (`covered: true`, `editable: () => false`) and overlay a weightless floating Change-Aware Minimap TOC matching Present mode.** Keeps the live editor warm underneath (`inert` and hidden) for zero-loss return, blocks all editing on the review surface, auto-fits read-only script sheets through `page.scaffold.applyZoom()` and gives fast change-oriented scene navigation without sacrificing canvas width.

## Decision

Graduate Version history out of the side-panel tab strip into a dedicated top-bar `HistoryButton` beside `Share` on both Scripts and Rundowns (`⌘⇧H` / `Ctrl+Shift+H`, showing a calm attention dot when `To review` or `Hand-in` items await), leaving the side panel focused on `Comments`, `Details` and `Tour`.

Activating History navigates to the lazy route `/s/$docId/history` (`HistoryScreen`, registered in `SHELL_SCREENS` with `page: "covered"` and `covered: true`), which covers the mounted live editor without tearing it down. Inside `/s/$docId/history`:

- **Read-only guarantee:** Every script and rundown review canvas runs strictly read-only (`editable: () => false` in `mountHistoryPageView`, read-only rundown comparison grid). No typing, drag-reordering or inline editing is permitted.
- **Native auto-fit scaling:** Read-only script canvases (Working preview, `On the page`, `Asterisks only`, `As it was` and lockstep `Side by side` panes) observe their container width and scale sheets cleanly via `page.scaffold.applyZoom()` so full-width screenplay pages never clip horizontally.
- **Weightless floating Change-Aware Minimap TOC:** `HistoryMinimapToc` mirrors Present mode's right-edge ambient tick rail (`end-4`, closed at rest, expanding on hover or click into a floating `.mn-minimap-card` with a `180 ms` leave bridge and `Pin` toggle), adding green change ticks (`data-changed="true"`), a `N of M changed` summary, an `All | Changed (N)` filter pill and per-scene or per-row change counts for one-click jump-to-change navigation.
- **Single-source chrome:** `Name this draft…`, `Copy link` and the primary `Restore` action live once in `HistoryScreenBar` above a calm archival comparison strip, paired with a focused right-hand timeline rail (`All | Drafts only`, `Changes since ▾`, segmented view-mode switch, filter and compact `‹ 1 of N ›` change stepper, pinned `Working · Now` node and bookmark marks on named drafts).

## Consequences and trade-offs

- **Clear mental model and zero state loss:** Writers get an unmistakable, distraction-free review and comparison space where accidental edits cannot happen, while returning via `Back` or `Escape` restores the exact live editor caret, scroll position and undo stack immediately.
- **Consistent navigation grammar:** Present mode and Version history share one floating right-edge Minimap TOC pattern, giving full horizontal room to screenplay pages and Side-by-side comparisons on 1280 px screens.
- **Extra route and read-only view host:** Maintaining `/s/$docId/history` and `history-page-view.ts` adds a dedicated lazy route and read-only `PageView` wrapper that must stay aligned with pagination decorations and diff marks, covered by unit tests (`history-minimap.test.ts`, `screen-problem.dom.test.tsx`) and end-to-end history and Tour suites.

## Revisit when

- Collaborative review workflows require inline commenting directly inside historical snapshots, in which case comment threads would need a read-only snapshot anchor model rather than re-enabling document editing on `/s/$docId/history`.
