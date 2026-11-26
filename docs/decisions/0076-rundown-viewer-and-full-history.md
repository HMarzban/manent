# 0076. Rundown viewers receive server-projected views and rundowns carry full version history

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Extending external version history (decision 0025), per-cell previous values (decision 0052), and the `edit_rundowns` capability (decision 0054), people with `Can view` or `Can comment` access to a rundown previously saw only a read-only notice rather than the live grid, and rundowns lacked full structural version snapshots, comparison, and restore. History write routes must also enforce `edit_rundowns` atomically inside the document's serialised chain so a concurrent role change cannot slip between authorisation and mutation.

## Options considered

- Sync raw rundown CRDT documents directly to `Can view` and `Can comment` clients and rely solely on decision 0052's single-cell previous value for rollback. Rejected: bypasses the server-projected view boundary for read-only access and leaves producers unable to review or restore structural changes such as added, removed, or reordered rows.
- Replace decision 0052's per-cell previous value with full rundown version history. Rejected: instant one-step cell inspection and undo in the live grid stays useful during fast studio edits alongside full version history.
- Deliver server-projected rundown `VIEW_SNAPSHOT` and incremental `VIEW_PATCH` frames to `Can view` and `Can comment` clients, store content-addressed `RundownJSON` version snapshots with minimal-move comparison and atomic restore, and re-verify `edit_rundowns` inside the serialised chain on every history write. Chosen.

## Decision

`Can view` and `Can comment` rundown readers receive server-projected `VIEW_SNAPSHOT` and `O(changed structs)` incremental `VIEW_PATCH` frames (via `readRundownWrites` across peer pushes and `authorityWrite`), replacing the read-only notice with a live read-only grid, Details, read-only Previous value, Open beside, and History. Rundown versions store content-addressed `RundownJSON` snapshots, compare with longest-increasing-subsequence minimal-move alignment and per-cell diffs, and restore whole rundowns or individual rows atomically under `ORIGIN_RESTORE` without writing server-only `durationMs` or `prompter` fields while preserving decision 0052 `cell.previous` records. Every rundown history write route (`save`, `upload`, `restore`, `name`) verifies `edit_rundowns` inside the document's serialised chain (`inChain()`).

## Consequences and trade-offs

- Read-only viewers and commenters follow live rundowns with no dead controls, producers gain structural history and single-row restore without disturbing air-window safety or prompter sends, and checking authorisation inside `inChain()` eliminates time-of-check-to-time-of-use gaps.
- Incremental `VIEW_PATCH` projection adds modest server work on rundown writes; fan-out latency at full studio viewer scale has not yet been measured in the benchmark suite.

## Revisit when

Rundown version counts or row sizes grow large enough that per-version `RundownJSON` snapshots benefit from delta compression.
