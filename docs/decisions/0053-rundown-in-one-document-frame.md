# 0053. The rundown opens in the one document frame by kind

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Rundowns share almost every outer shell element with scripts: the `/s/<doc>` link structure, title bar and presence list, sync status, state bar, side panel (including Details), Send screen (`/s/<doc>/send/<form>`), Beside pane for opening a linked story alongside the grid, command palette and keyboard navigation. Only the main document body, Details scope and status-bar readout differ from a script editor.

## Options considered

- Add a separate top-level route and duplicate the document shell for rundowns. Rejected: duplicates access checks, title bar, state bar, Beside layout, Send links and navigation logic, and forces every caller to know a document's kind before building its URL.
- Branch on document kind inline inside the script editor screen. Rejected: tangles rundown grid state into the script editor and works against the web app's registry seams.
- Open rundowns at `/s/$docId` inside the single document frame, selecting the body, Details scope and status readout from kind-keyed registries. Chosen.

## Decision

A rundown opens at `/s/$docId` in the same document frame as every script. `DOCUMENT_BODIES` resolves `kind: "rundown"` to `RundownScreen`, `DetailsScope` switches the Details tab to the `rundown` scope alone, and `STATUS_READOUTS` renders the rundown's row readout while reusing the title bar, state bar, Beside pane and Send screen.

## Consequences and trade-offs

- Links, bookmarks, Library rows, Share controls and Beside story splits behave consistently across scripts and rundowns with no duplicated shell code.
- Opening a story row Beside the rundown reuses the existing Beside split host, with focus returning to the row when the story closes.
- The document frame must resolve a document's kind before rendering its body and keep script-only surfaces (such as pagination controls and production locks) hidden when a rundown is open.

## Revisit when

Rundowns need a multi-pane broadcast console layout that no longer fits inside the shared document header, side panel and Beside shell.
