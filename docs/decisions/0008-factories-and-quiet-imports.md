# 0008. Packages export factories, and importing a module does nothing

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

The server's core has to run in three places: the server program, the desktop app's local process and the tests. A module that grabs a socket, a file or a database as soon as it is imported cannot be loaded by a test, or by another process that wants only its types, and two such imports fight over one port.

## Options considered

- Packages that start their own listeners. Rejected: only one process can own a port, and every test would have to stop what an import started.
- A dependency-injection framework. Rejected: more machinery than the problem needs.
- Factories, and imports with no side effects. Chosen.

## Decision

`server-core` and `local-node` export functions that build handlers; they never listen. Only an app (`apps/server`, and later `apps/desktop`) starts them. No module opens a socket, file, database, timer or listener when it is imported, and the work of a script sits under `if (import.meta.main)`. The clock, randomness, storage and transport are passed in.

## Consequences and trade-offs

- Tests import any package and drive it with fakes, and one core serves the server and the desktop process.
- Each app carries a little more wiring.
- This is a convention, checked in review. `tools/test/workspace.test.ts` imports every package's entry, which shows that importing does not throw, not that it opened nothing.

## Revisit when

A module needs a resource at load time that no factory can create for it.
