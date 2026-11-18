# 0019. Pagination is a pure function of the document, drawn with decorations

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

A page number must mean the same text for every collaborator, in the PDF and on paper. Measuring the browser's layout gives different answers per machine, font, zoom and engine, a frame late. Script formats use a fixed-pitch font, so a block's line count is arithmetic.

## Options considered

- Page nodes in the document. Rejected: edits would move content between page nodes, which the CRDT merges badly.
- Measuring the DOM. Rejected: results differ between machines, measuring feeds back into what is drawn, and it cannot run on a server or in a test.
- CSS fragmentation. Rejected: the browser decides the breaks, so collaborators and the PDF can disagree.
- A canvas. Rejected: it gives up the browser's own text editing.
- Arithmetic from the model, drawn with decorations. Chosen: the project owner chose decorations, the engineering lead the arithmetic.

## Decision

Pages are a pure function of the blocks, the shared page profile, the engine's version and the table of locked pages, with no measuring and no fonts. Page breaks and page furniture are view decorations, never document content. The engine is versioned, so a script keeps its pagination until it is upgraded on purpose.

## Consequences and trade-offs

- Collaborators and the PDF agree on every page, and tests and a server can run the engine.
- In a throwaway prototype (a simplified rule set, synthetic text, one machine, no editor or DOM cost counted), the arithmetic took about 0.05 ms per keystroke at 124 pages.
- Identical pages are promised only for text in the bundled script font, with no page-for-page match claimed against an incumbent desktop program. Text in wide, right-to-left or complex scripts is preserved but laid out wrongly.
- Where a browser wraps differently, the screen is corrected to the model.

## Revisit when

Writers need page-for-page agreement with another program, or a language arrives that a fixed-pitch model cannot lay out.
