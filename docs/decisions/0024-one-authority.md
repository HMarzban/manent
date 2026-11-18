# 0024. The server is the only authority for a synced document

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

The desktop app runs a local node that keeps documents durably and relays them to the server, and that node could order changes itself. Two places that both assign sequence numbers would give one version two identities, and a version must mean one thing.

## Options considered

- Two sequencers, the desktop node and the server. Rejected: their logs would disagree.
- A stateless relay on the server. Rejected: the server could not validate updates or keep the totally ordered, attributed log that history and revisions rely on.
- One authority, holding an in-memory document for each active room. Chosen.

## Decision

For every synced document the server alone is the authority: it numbers updates and orders versions, locks and revisions. The desktop's local node keeps documents durably and relays them; it is the authority for a script only until that script first syncs, when authority passes to the server, once. After the server is restored from a backup, the node heals it as any client does, by sending what the server lacks. The server keeps one in-memory document per active room so that it can validate and order updates. It also gives each collaborator a cursor colour, an index per script handed out as people first open that script to edit, so ten people can work on one script without two of them sharing a colour by chance.

## Consequences and trade-offs

- Every version has one identity, and the log is the single source of truth.
- The server holds memory for every active room, and work that needs the authority, such as locking or issuing, waits for a connection.
- An eleventh person takes the first person's colour again, and the name beside each cursor tells them apart.
- None of this is built yet.

## Revisit when

The product has to work across sites without one server, or room memory becomes the server's limit.
