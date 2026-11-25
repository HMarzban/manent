# 0062. Deleted documents stay in Trash for thirty days on the server clock

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Deleting a script immediately and irreversibly risks accidental data loss in a collaborative workspace, especially when another collaborator is editing the same script offline. At the same time, deleted documents must leave active project lists, search results and public API responses immediately, and eventually be tombstoned so storage does not grow without bound.

## Options considered

- Tombstone deleted scripts immediately with no recovery window. Rejected: one accidental click in a shared workspace permanently destroys work.
- Track Trash purely inside client-written CRDT index fields without a server table or sweep. Rejected: relies on client clocks and leaves no authoritative purge schedule when nobody has the workspace open.
- Record Trash rows in `control.sqlite` on the server clock with a 30-day retention window, mirror `trashedAt` and `trashedByUserId` in the document's index, keep edits to trashed scripts intact, and tombstone due rows in an hourly sweep. Chosen.

## Decision

Moving a document to Trash (`POST /api/trash/move`) writes an authoritative row in `control.sqlite` with `purgeAfter = deletedAt + 30 days` (`TRASH_KEEP_MS`) using the server clock and updates `trashedAt` and `trashedByUserId` in the workspace or private index. Any owner or person with the `delete` capability can restore it (`POST /api/trash/restore`) before the hourly sweep (`TRASH_SWEEP_INTERVAL_MS`) tombstones expired rows and removes their index entries; edits on trashed scripts and offline local copies are preserved until purge.

## Consequences and trade-offs

- Accidental deletions are reversible for thirty days with consistent remaining-day counts across all clients, while search, Library lists and `/api/v1/` hide trashed scripts immediately.
- Keeping Trash rows in `control.sqlite` means background-seed adoption (`apps/server/src/seed/adopt.ts`) must copy workspace Trash rows alongside directory entries so seeded Trash appears on the live server.
- Permanent early emptying of Trash before thirty days is not offered in this build.

## Revisit when

Workspace owners ask for configurable retention windows or an explicit "Empty Trash" action for compliance or quota management.
