# 0059. Tiered storage durability and on-demand delivery

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Running the full stack on one machine exposed three coupled bottlenecks: macOS `PRAGMA fullfsync = 1` flushes on derived SQLite caches and disposable staging databases contended with live writes; IndexedDB scans loaded full CRDT blobs for metadata queries and used strict durability even on replaceable cache writes; and first-load delivery inlined seven Inter variable subsets into render-blocking CSS while eagerly precaching heavy on-demand chunks in the service worker.

At the same time, Manent's core durability promise requires that acknowledged document logs, unsynced local writing and set-aside recovered text survive crashes, and that deployed web updates never serve stale unhashed workers.

## Options considered

- **Relax durability everywhere (`synchronous = NORMAL` and `durability: "relaxed"` across all stores).** Rejected: in WAL mode, uncommitted checkpoints on primary `control.sqlite` and project or person logs could drop acknowledged transactions after power loss, and relaxed IndexedDB writes could lose unsynced writing or recovered passages.
- **Keep full `fsync` on every database and eager precache on every asset.** Rejected: derived checkpoints, search indexes, staging seeds and unused font subsets stall local opens and inflate first-frame downloads without improving data safety.
- **Tiered durability by data class, bounded metadata summaries, and split eager vs build-versioned runtime caching.** Chosen: keeps full crash durability on primary logs and user writing while removing unnecessary disk flushes, blob reads and eager transfer bytes from derived caches and optional features.

## Decision

1. Primary SQLite databases (`control.sqlite`, `project-*.sqlite`, `user-*.sqlite`) default to `durability: "full"` (`PRAGMA synchronous = FULL` and `PRAGMA fullfsync = 1` on macOS) and move to schema version 10 with eight additive query indexes appended as migration 10; derived caches (`.checkpoints.sqlite`, `search.sqlite`) explicitly opt into `durability: "normal"`, and disposable staging seeds use `durability: "off"`, all with widened page cache and memory temporary storage.
2. Browser IndexedDB keeps `durability: "strict"` for unsynced own edits and persisted recovered items, uses `durability: "relaxed"` for replaceable cache, remote and metadata writes, bounds cursor scans to document key ranges, and serves document lists from `MetaRecord.waitingCount` summaries without loading CRDT blobs.
3. The web build extracts Latin and Latin-Extended Inter variable `.woff2` files out of render-blocking CSS; the service worker eagerly precaches entry assets, route chunks and `.woff2` fonts, caches content-hashed on-demand assets (`pdfjs-dist`, `@manent/formats`, legacy `.woff` PDF fonts) `CacheFirst` inside a build-versioned cache (`manent-runtime-assets-<buildId>`) pruned on `activate`, and serves the unhashed `/ink-compile.worker.js` `NetworkFirst`.

## Consequences and trade-offs

- Primary user data and recovered writing keep full crash safety on both server SQLite and browser IndexedDB, while derived caches and staging adoption avoid global disk-flush stalls.
- First-load CSS and eager service worker precaching shrink substantially, and on-demand heavy features stay available offline after their first use without freezing unhashed workers across deploys.
- Non-Latin Inter subsets (Cyrillic, Greek, Vietnamese) fall back to system UI fonts unless explicitly added back; derived checkpoints and search indexes remain reconstructible from primary logs if a host crashes mid-write.
- This record records architectural constraints only; machine-specific timing figures belong to the benchmark suite when run under controlled conditions (`docs/development/benchmarks.md`).

## Revisit when

- Manent adds UI localisations requiring non-Latin Inter subsets.
- The Ink compiler worker is content-hashed at build time and can join the hashed `CacheFirst` runtime route.
- A hosted storage backend replaces SQLite for primary document logs.
