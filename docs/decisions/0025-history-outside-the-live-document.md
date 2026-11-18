# 0025. History lives outside the live document

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Writers need versions, drafts and comparisons over months of work. A CRDT can keep its history inside the document when garbage collection is off, but then the document every client loads grows with every edit ever made.

## Options considered

- History in the live document, with garbage collection off. Rejected: in a throwaway prototype (Yjs 13 alone, a 120-page script rewritten over 400 to 1,200 simulated editing sessions, one run on one machine), the document grew to 18 to 20 times its plain text and took about twice as long to load as the same edits with collection on, which stayed at 4.4 to 4.6 times.
- Positions in the server's log. Chosen for automatic versions made online during their first day, where a version costs one row.
- Content snapshots kept apart from the document. Chosen for drafts, baselines, issued revisions, every version made offline, and automatic versions after their first day.

## Decision

Garbage collection is on wherever a document is built, and `@manent/crdt`'s factory is the only way to build one. Each version is either a point in the server's log or a content snapshot stored apart from the live document; it is never loaded with that document and never sent to a client that did not ask for it.

## Consequences and trade-offs

- The live document stays small however many versions exist, and snapshots survive a rebuild or a change of CRDT.
- Once its log is dropped, an old version has authorship per block, not per character.
- The kept log grows storage by about 0.8 MB per typist-hour, an estimate, until a rebuild replaces it. The budget is 1 MB per typist-hour, with 2 MB as the hard limit.
- Between two syncs, history is the device's own snapshots, not every keystroke.

## Revisit when

Per-character authorship of old versions becomes a requirement, or measured log growth exceeds its budget.
