# 0040. The room's driver is held in server memory and announced over the socket

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

When a writers' room presents a script in a Room window, one person at a time drives what the room follows and receives pitched lines. Taking keys must never leave two people believing they are both driving, yet driving is ephemeral session state that only matters while someone is actively connected to the script.

## Options considered

- Store the active driver in the script's CRDT document or in SQLite. Rejected: CRDT last-writer-wins semantics would allow two writers to take keys concurrently offline or under latency and converge unpredictably, while persisting ephemeral session state to SQLite would leave stale drivers behind after a server restart.
- Elect a driver peer-to-peer through awareness presence messages. Rejected: awareness is soft, eventually consistent state that cannot atomically refuse a second writer who clicks Take keys at the same instant.
- Hold the driver per script in server memory, change it through compare-and-swap HTTP routes, and announce every change to the script's subscribers with a `driver_changed` control frame. Chosen.

## Decision

The server holds at most one active driver per script in memory (`createDriverService`), judged from the caller's stored access. Taking keys succeeds only for a writer when nobody drives or when the current driver matches the caller's `expectedDriverUserId` (otherwise answering `driver_taken` with who took keys first); every take, release or departure broadcasts a `driver_changed` control message to the script's subscribers, and the driver is released automatically when their last edit subscription leaves—except when a rebuild moves subscribers to a newer room generation.

## Consequences and trade-offs

- Compare-and-swap in one authoritative process guarantees that at most one person drives a script at any moment and gives the losing caller the winner's name immediately.
- On the desktop app, the local node decides the driver for a script held only on the device and relays requests to the cloud server for a synced script.
- A server restart clears the active driver cleanly; whoever is presenting takes keys again in one click.
- Because the state lives in one server's memory, running multiple server processes in front of one project would later need a shared coordinator for driver leases.

## Revisit when

Manent scales a single project across more than one server process, requiring shared lease coordination for room drivers.
