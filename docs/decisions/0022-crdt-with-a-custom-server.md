# 0022. A CRDT with a custom sync server, not a central-authority protocol

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

Offline editing is a hard requirement: a writer may work offline for days on several devices, and every edit must merge on reconnection. ProseMirror's own collaboration module uses a central authority, where a client rebases its steps over the server's, and its `rebaseSteps` silently drops a step that no longer applies (read in the module's source). That is weakest exactly after a long time offline.

## Options considered

- A central authority with ProseMirror's collaboration module. Rejected for this product: long offline work is where it drops steps.
- A CRDT with an existing server for it, such as Hocuspocus. Rejected: our server has to validate, order and attribute every update, which the stock server does not do.
- A CRDT with our own server on Bun's WebSockets. Chosen.

## Decision

Documents are a CRDT (decision 0023), synced through our own server, which applies each update, checks it, gives it a sequence number and keeps an ordered, attributed log (decision 0024). Offline edits merge however long they waited, within the limits that rebuilds set (decision 0026).

## Consequences and trade-offs

- For a product that is online first, a central authority is simpler and would be the better pick: remote changes arrive as real editor steps, the schema stays valid by construction, and exact history comes for free.
- A CRDT server cannot cheaply tell what an accepted update means. Rules such as who may accept a suggestion therefore hold only in the interface.
- Everything that must be exact, such as versions, locks, issued revisions and numbers, is sequenced by the server as a request, not merged.
- The CRDT's metadata costs memory and storage.

## Revisit when

Offline work can be relaxed to a few minutes without a connection, or a comparison on the same editing traces shows that the CRDT costs more online than it buys offline.
