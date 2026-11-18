# 0027. One compiled server program on SQLite files

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner

## Context

The server holds the web app, sync, sign-in and storage, and the desktop app needs the same server logic locally. Each extra process, database server or service adds to what must be deployed, backed up and understood.

## Options considered

- Several services around a managed database. Rejected: more to run and keep consistent, and the desktop app could not run the same thing.
- One program on SQLite files. Chosen.

## Decision

The web app, sync, sign-in and storage are one Bun program, compiled to a single binary, and the desktop app runs the same server code. Data lives in SQLite files through `bun:sqlite`. Storage changes are numbered migrations applied in one order, so every file's schema version equals the program's, and an older program is to refuse a newer file rather than misread it.

## Consequences and trade-offs

- A single artifact to deploy and back up, and updates are ordered exactly at no extra cost.
- A crash or a restart pauses sync for everyone until the program is back. Clients keep working offline meanwhile.
- Heavy work, such as rebuilding a 2,000-page script or drawing an issued PDF, runs on the serving thread and can stall other documents. Any such job is to move to a worker once the benchmark measures a stall longer than 20 ms.
- More than one writing host would need another storage driver.
- In a probe build compiled on one machine, the binary was 85 to 110 MB per target; only the macOS arm64 build was run.

## Revisit when

One host is no longer enough, or stalls on the serving thread exceed their budget.
