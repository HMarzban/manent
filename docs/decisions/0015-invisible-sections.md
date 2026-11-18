# 0015. Invisible sections keep long documents fast

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

A flat document cannot meet the 2,000-page target (decision 0011): most of a keystroke's cost is the browser's own editing and layout work, which grows with the number of blocks. A browser skips it only inside a container it may skip.

## Options considered

- A flat document, `doc → block+`. Rejected: about 38 ms per keystroke at 2,000 pages in the prototype below.
- Scene wrapper nodes. Rejected: splitting or merging a scene would move blocks between containers, which the CRDT does by deleting and re-inserting them, losing concurrent edits.
- Containment on every block. Rejected: slower than none (see the lessons).
- Invisible sections of about 100 blocks. Chosen.

## Decision

The document is `doc → section+ → block+`. A section holds about 100 blocks, is never shown or selected, and carries `content-visibility: auto`. Normal editing never moves an existing block to another section. Four safeguards come with it: each section's intrinsic height comes from the pagination engine through a node view; the sections around the selection stay rendered; the document-start and document-end keys set the selection from the model; and our own commands handle editing across a section boundary. A prototype in three browser engines is to check this first.

## Consequences and trade-offs

- In a throwaway prototype (bare ProseMirror, headless Chromium on one Apple-silicon laptop, synthetic script text, three runs), 2,000 pages in 100-block sections cost about 3 ms per keystroke, against 38 ms flat.
- The editor grows more complex at every section boundary and relies on a browser feature with a recorded caret fault. Nothing is measured with sync, pagination, real fonts or an input method. Short scripts carry the cost too.
- If containment misbehaves in an engine we ship, that engine keeps the wrappers without the CSS, worth only a factor of 1.5 to 3, and its comfort limit is restated from measurement.

## Revisit when

The prototype finds a fault the safeguards cannot fix, or sync changes the measurements.
