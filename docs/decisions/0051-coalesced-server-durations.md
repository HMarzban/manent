# 0051. Server durations are coalesced per story and written by the authority

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

A rundown displays each linked story's duration (`Dur`), cumulative time (`Cume`), front timing (`Start`), back timing (`Back`) and overall over or under against the target length. Several writers may edit different stories simultaneously while producers monitor the rundown. If browsers computed and pushed `durationMs` into the rundown CRDT directly, concurrent clients with offline edits or stale read rates would overwrite each other and show mismatched totals, and every writer would need edit access to the rundown itself.

## Options considered

- Let each client write `durationMs` into the rundown whenever it edits a story. Rejected: concurrent writers would race on the same row, offline clients would push stale durations on reconnect, and writers without rundown-edit permission could not update durations.
- Recompute and commit `durationMs` synchronously on every story commit. Rejected: rapid typing across a room of stories would turn every story commit into an immediate rundown transaction and broadcast.
- Coalesce story commits per story over 500 ms on the server, then write changed `durationMs` values into each linked rundown as one authority system update while refusing any client push that touches `durationMs`. Chosen.

## Decision

The server (`createRundownDurations`) coalesces commits to each linked story over 500 ms (`DURATION_COALESCE_MS`), recomputes whole-story and per-slug durations rounded to whole seconds at the project's Read rate, and writes changed `durationMs` values into every linked rundown through one `authorityWrite` with `ORIGIN_SYSTEM`. Client pushes that write `durationMs` are refused; a producer's manual `Dur` override lives in the row's `dur` cell and takes precedence until cleared.

## Consequences and trade-offs

- Every collaborator sees one consistent set of authoritative durations, cumulative times and front/back times without writers needing rundown-edit rights, while a writer editing a story open Beside the rundown still sees an immediate local live duration readout while typing.
- Coalescing over 500 ms bounds rundown write amplification during bursts of typing, and a busy or uncommitted write retries once.
- Remote story edits take up to 500 ms to appear in the authoritative rundown column, and offline devices that do not hold a story locally show `—` until they reconnect.
- Server duration write throughput under full daily-show and newsroom load has not yet been measured in the benchmark suite.

## Revisit when

Benchmark measurements show that a 500 ms coalescing window either feels noticeably sluggish to producers or still creates excessive rundown commits at newsroom scale.
