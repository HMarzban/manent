# 0037. A script's comments live in a document of their own

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Reviewers and readers with `comment` access need to start comment threads, reply, resolve or reopen threads, and work inside named comment rounds without ever holding write permission on the script's text. At the same time, active review rounds generate many edits that should neither bloat the script's CRDT document nor clutter the script's undo history or version diffs.

## Options considered

- Store comments in a root map inside the script's own CRDT document. Rejected: commenters would have to push updates to the script document itself, complicating write admission, mixing comment churn into script checkpoints and rebuilds, and requiring every viewer of the script to download every thread even when Comments is closed.
- Store comments in SQLite tables served only over HTTP. Rejected: writing comments offline and merging concurrent replies across tabs and devices would require a separate sync protocol alongside the CRDT link.
- Give each script a companion CRDT comments document (`kind: "comments"`) with a deterministic ID (`commentsDocId(scriptId)`). Chosen.

## Decision

Each script's comments live in a separate CRDT document whose ID is derived deterministically from the script ID by `commentsDocId(scriptId)` and whose four root maps hold `threads`, `items`, `rounds` and `flags`. Clients sync it over the same WebSocket protocol as any other document, commenters are admitted to push to it without write access to the script, and the server validates every push per entry so nobody can overwrite or delete existing items, forge another author, or change rounds and flags without editor rights.

## Consequences and trade-offs

- Comment traffic never grows the script's live CRDT document, never enters the script's undo stack, and is unaffected when the script is rebuilt.
- Commenters and draft readers with comment permission get offline-capable, real-time syncing comments while remaining strictly read-only on the script document.
- Clients that show Comments subscribe to a second document over the existing connection, and the server updates open comment counts per round after each accepted comments commit.

## Revisit when

A script accumulates so many historical comment rounds that loading one comments document becomes slow, making per-round partitioning worthwhile.
