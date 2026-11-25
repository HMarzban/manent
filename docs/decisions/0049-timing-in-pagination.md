# 0049. Timing lives in pagination

- Date: 2026-11-25
- Status: Accepted
- Decided by: engineering lead

## Context

Variety scripts, podcasts and rundowns need deterministic read-rate timing—dialogue characters divided by a project's Read rate plus well-formed `T=m:ss` and `T=mm:ss` bracket durations, grouped by slug—alongside rundown front and back timing (`Dur`, `Cume`, `Start`, `Back`, over/under and air-window bounds). The same calculations must run in the browser editor, in page furniture's Running time slot, in rundown exports and on the server when computing authoritative rundown durations, without introducing new package boundary edges.

## Options considered

- Place timing in `@manent/schema`. Rejected: `schema` owns stored document shapes and validation, not derived layout or broadcast timing.
- Create a new `@manent/timing` workspace. Rejected: adds manifest and boundary-configuration overhead across `editor`, `formats`, `server-core` and `apps/web` for a small set of pure functions.
- Place timing in `packages/pagination/src/timing/`. Chosen: `pagination` is already a pure domain engine reachable from `editor`, `formats`, `server-core` and `apps/web`, with no DOM or Bun dependencies and no boundary change required.

## Decision

Script read-rate timing (`findBracketTimes`, `timeBlock`, `durationMs`, `timeScript`) and rundown clock timing (`timeRundown`) live in `packages/pagination/src/timing/`. Script totals are accumulated as rate-independent `{ dialogueChars, bracketMs }` pairs so changing a project's Read rate re-times every Variety script without re-reading its text.

## Consequences and trade-offs

- One pure implementation serves the editor, the header and footer Running time slot, rundown exports and the server's duration writer, so client and server never disagree on arithmetic.
- Because `timeBlock` operates on one block at a time, the editor can keep totals updated incrementally on keystrokes without walking the whole script.
- `pagination` now holds both page geometry and broadcast timing, which are distinct domains inside one package.
- Per-keystroke timing cost on long Variety scripts has not yet been measured in the benchmark suite.

## Revisit when

Broadcast timing grows into a larger subsystem with its own dependencies or release cadence separate from the page engine.
