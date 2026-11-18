# 0018. Schema and wire changes only add, and content from a newer build is kept

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Clients stay offline for days and desktop apps update late, so documents and messages from a newer build will reach an older one, and the other way round. A rename or a removal breaks every client that has not updated, including one that holds offline edits.

## Options considered

- A protocol version bump for every change. Rejected as the normal path: after a bump, an older client cannot connect until it updates, and a desktop app holding offline edits could then only export them.
- Additions only, with older builds skipping what they do not know. Chosen.

## Decision

Stored shapes, wire frames, codes and the order of unions gain members at the end; nothing is renamed, removed or reordered. An unknown element, attribute or mark is kept: it survives loading, and validation gives it a severity of its own, `newer`, instead of refusing the document. A reader skips and counts a frame type, flag or union member it does not know, and ignores fields after the ones it reads. Every frame starts with its type and a flags byte, and a nested structure is preceded by its length in bytes, so a later build can grow it. A protocol bump is the last resort, and the first message of the handshake never changes. `packages/sync-protocol/test/codec.test.ts` pins the bytes of every frame type and reads a grown structure with the older reader.

## Consequences and trade-offs

- Older and newer builds share documents and connections.
- The cost is permanent: a poor name or an unused field stays forever, and every reader carries code to skip what it does not know.
- A change of meaning, as opposed to an addition, still needs a bump.

## Revisit when

A change cannot be written as an addition. That is the point at which a bump is planned, together with its migration path.
