# 0026. A document is rebuilt only when it is over budget

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

A CRDT document never forgets who wrote to it. In Yjs 13 every transaction computes the full state vector, so its cost rises with every distinct client ID that has ever written to the document, one per editing session, and deleted material leaves structures behind. A long-lived document grows slower and larger with age even when its text does not.

## Options considered

- Never rebuild. Rejected: the cost grows without bound.
- Rebuild only when content is purged. Rejected: documents that are never purged grow the same way.
- Rebuild at every draft or on a schedule. Rejected: each rebuild costs offline writers something (below).
- Rebuild only when a document exceeds its budget. Chosen.

## Decision

The server rebuilds a document, swapping it for a new document made from today's content, with every block ID kept, only when it exceeds a budget for size or client IDs, never on a schedule. A rebuild number is in the wire protocol from its first version, so a client knows which rebuild it holds.

## Consequences and trade-offs

- The evidence and its limits: in a throwaway prototype (Yjs 13 alone, a tiny document, one machine, one run), a single transaction cost about 8 ms once the document had seen 50,000 client IDs; a 30-page script reused as one document for 60 simulated days grew to 32 times its text even with garbage collection on.
- Rebuilds keep typing cost and size flat however long a document lives.
- Their first cost: edits made offline against the old document arrive afterwards as a coarser replay block by block, not a merge character by character. After 90 days they are offered for a manual merge instead.
- Their second cost: undo history is reset.

## Revisit when

The CRDT's cost per transaction stops growing with past writers, as it did in the same prototype on the Yjs 14 pre-release, or offline writers meet replays often.
