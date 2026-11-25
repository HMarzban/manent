# 0038. A copy is a new document with fresh block IDs and a source record

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Writers copy scripts in several situations: duplicating the working script or an older version from History, trying a production lock on a copy first, or starting a new format document from an existing outline or script. Reusing block IDs or CRDT history across copies would tangle identity-keyed metadata, revision tracking and cross-document references.

## Options considered

- Clone the underlying CRDT update log so the copy inherits the original's block IDs and history. Rejected: duplicate block IDs across documents would confuse cross-document references, carry over unwanted production locks and comments, and inherit accumulated CRDT tombstones.
- Copy only the plain text with no record of origin. Rejected: writers could no longer open the source beside the new document or trace which version a copy branched from.
- Create a brand-new CRDT document with freshly allocated block IDs and record its provenance in the project index's `source` map. Chosen.

## Decision

Every copy is a new CRDT document whose blocks receive fresh IDs while preserving text, marks, notes and script settings, declining pending suggestions and omitting comments, version history and production state. Its provenance (`docId`, `versionId` or `null` for the working state, `copiedAt`, and optional chapter mappings) is stored under the copy's document ID in the project index's `source` map.

## Consequences and trade-offs

- Each copy starts with a clean, compact CRDT document and independent block identity, so locks, comments and revisions on the original and the copy never interfere.
- Because provenance lives in the project index, the interface can open the source document beside a derived work and tell the writer where a copy came from even offline.
- A copy cannot later be three-way merged back into its source by block ID; writers who intend to merge changes back into the room use a private copy instead.

## Revisit when

A workflow needs to merge edits from a duplicated script back into its source document by shared block identity rather than through a private copy.
