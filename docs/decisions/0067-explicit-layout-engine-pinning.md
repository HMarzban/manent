# 0067. Scripts pin their layout engine explicitly in script settings

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner

## Context

Manent guarantees that screen, print and PDF share exact page breaks. When a newer build improves pagination rules, silently switching existing scripts onto the newer engine would shift page breaks mid-draft or under a production schedule, whereas freezing the engine forever would prevent future typesetting improvements.

## Options considered

- Always paginate every script with the newest layout engine carried by the build. Rejected: upgrading Manent could silently change page counts and scene breaks on active scripts.
- Store a separate engine-version column in server SQLite outside script settings. Rejected: disconnects layout versioning from the script's own synced settings and offline copy.
- Pin each script's layout engine in the `script.engineVersion` script setting (defaulting to `1` when absent), keep existing and new scripts on engine 1 while carrying newer engines side by side, and offer an explicit "Update layout engine" action before the script is locked. Chosen.

## Decision

Each script pins its layout engine solely via the `script.engineVersion` setting (`1` when unset), and `packages/pagination/src/engines/` carries versioned engines side by side (`v1`, `v2`) advertised via `ENGINE_VERSIONS`. Scripts stay on their pinned engine across builds until an editor explicitly chooses "Update layout engine" in Script settings while the script is unlocked; locked scripts reject engine changes so locked page numbers remain immutable.

## Consequences and trade-offs

- Upgrading Manent never silently alters page breaks in any existing script, and editors can preview and opt in to a newer layout engine deliberately before locking for production.
- Every shipped build must continue carrying older pagination engines alongside newer ones, with unit tests verifying each version's output stays stable.
- Both `script.linesPerPage` and `script.sceneNumbers` follow the same script-setting freeze once a script locks, preventing accidental repagination during production.

## Revisit when

A future release retires an obsolete layout engine after migrating archived scripts, or new formats require additional engine parameters.
