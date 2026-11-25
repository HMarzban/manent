# 0060. Full-text search uses a derived SQLite index behind a port

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Writers working in large studios with dozens of projects need fast full-text search across script bodies, notes, cuts and rundown cells, filtered by document kind, folder and date, without adding synchronous indexing work to the document write path or coupling server logic to one SQLite driver.

## Options considered

- Scan every project SQLite file on each query. Rejected: opening and replaying dozens of CRDT logs on every search request is too slow for a studio workspace.
- Embed full-text tables inside each project SQLite file and update them inside the commit transaction. Rejected: couples indexing to the write path, complicates cross-project queries and mixes derived search state with authoritative logs.
- Maintain one derived SQLite FTS5 file (`search.sqlite`) using the `unicode61` tokeniser behind a `SearchIndex` storage port, populated asynchronously off the write path and recreated automatically when its schema version changes. Chosen.

## Decision

Full-text search lives behind the `SearchIndex` port in `packages/storage/src/ports/search.ts`, backed on the server by a derived `search.sqlite` database using SQLite FTS5 (`unicode61`) tagged with `PRAGMA user_version = SEARCH_INDEX_VERSION`. When the stored version does not match, the file's tables are dropped and repopulated by the asynchronous catch-up indexer, and every query result is filtered against live directory roles, Trash state and Private-folder membership.

## Consequences and trade-offs

- Document commits stay fast because indexing runs off the write path, and schema changes never require risky migrations on derived search data.
- Because `search.sqlite` is derived and can be deleted or repopulated at any time, a freshly adopted background workspace must trigger catch-up indexing before queries see its documents.
- Query latency and index size at full studio scale on modest hardware have not yet been published in the benchmark report, and desktop local-node offline full-text indexing remains deferred.

## Revisit when

Benchmark runs show SQLite FTS5 query latency or catch-up time exceeds target budgets for large studios, or hosted deployments need a shared search service across multiple server processes.
