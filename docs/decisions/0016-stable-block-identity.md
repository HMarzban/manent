# 0016. Every block carries its own stable ID

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Comments, scene numbers, locked page numbers, revision records and later prompter cue points all point at blocks. They must keep pointing at the same text through edits, merges, version snapshots and the rebuilds of decision 0026. The CRDT's internal item identifiers do not survive a rebuild.

## Options considered

- A block's position in the document. Rejected: every edit above a block changes it.
- The CRDT's internal identifiers. Rejected: a rebuild replaces them, and they would tie every feature to one library.
- An identifier attribute on each block, owned by the application. Chosen.

## Decision

Every block has an `id` attribute of 16 URL-safe characters drawn from 96 random bits (`packages/schema/src/identity.ts`). It survives version snapshots, rebuilds, import and export. A split leaves the ID on the first half and gives the second half a new ID that records where it came from; a join keeps the earlier block; an element change keeps the ID. A paste gets new IDs, except the first paste of a cut within the same document. Everything that refers to a block keys on this ID.

## Consequences and trade-offs

- Features above the CRDT survive a rebuild or a change of library, because they never see its internals.
- IDs can be duplicated, for example by two people splitting one block at once, or by a careless import. Duplicates have to be found, which `findIdProblems` does, and repaired: a client is to give new IDs to duplicates its own change introduced, and the server to repair the rest.
- A block that is retyped or copied has a new ID, so whatever was keyed on the old one does not follow it.

## Revisit when

A feature needs identity finer than a block, or repairing duplicates becomes frequent enough to cost noticeable time.
