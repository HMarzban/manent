# 0039. Private writing merges at hand-in through the three-way block merger

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

A writer working on a pass of a shared script sometimes needs to write privately before bringing those changes back to the room, while the room continues editing the live script. Handing those changes back must be safe, reversible, idempotent on retries, and clear about any block both sides edited.

## Options considered

- Keep private edits as unpushed local Yjs updates on the shared script document and push them all at Hand in. Rejected: a writer working across days or multiple devices could not sync their private work to the server, would risk automatic CRDT interleaving inside rewritten lines, and could not work on the room copy in parallel.
- Run a separate CRDT merge on the server at Hand in. Rejected: merging two diverged Yjs documents silently interleaves concurrent rewrites of the same line instead of surfacing both wordings for the writer to choose.
- Store the private pass in its own private CRDT document (`kind: "private"`) and merge it back into the live script at Hand in through the three-way block merger in `packages/revisions/src/merge/`. Chosen.

## Decision

Writing privately creates one open private document per writer and script, seeded with the script's blocks, settings and material at a recorded base position. At Hand in, the server marks the private copy read-only before reading it, runs `mergeByBlock(base, mine, theirs)` from `packages/revisions/src/merge/` against the live room, applies the resulting block operations as the writer's edits while adding new material entries, records a "Before hand-in" version and the idempotent hand-in answer in the same SQLite commit, and returns any overlaps and set-aside passages to To review.

## Consequences and trade-offs

- Private work syncs across the writer's own devices while remaining invisible to the room until Hand in, and a single "Before hand-in" version lets the room restore the exact pre-merge script in one step.
- Reusing the same block-level three-way merger used by offline recovery and document rebuilds keeps merge semantics consistent across the product and surfaces overlapping rewrites cleanly under To review.
- Closing the copy before reading it guarantees no late keystroke is missed, and storing the answer under a request key makes retried hand-ins idempotent.
- Because the merge runs once at Hand in rather than continuously, a long-running private pass that rewrites scenes heavily edited by the room will produce more items in To review.

## Revisit when

Writers need incremental pulls from the room into an open private copy before Hand in, which would require advancing the copy's stored base position.
