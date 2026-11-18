# 0007. One gate: `bun run verify`

- Date: 2026-11-17
- Status: Accepted
- Decided by: engineering lead

## Context

Many contributors work in parallel, so "it passes" must mean the same thing for everyone. Separate commands for each check invite running only some of them, and continuous integration needs a remote, which the repository did not have when this was decided.

## Options considered

- A script for each check, run as needed. Rejected: steps get skipped.
- Checks only in continuous integration. Rejected: the answer comes late.
- One local command that runs every check in a fixed order. Chosen.

## Decision

`bun run verify` runs, in this order and stopping at the first step that does not pass: `format:check` (`bun fmt --check`), `typecheck` (`bun check`), `lint` (oxlint with warnings denied), `tracked`, `boundaries`, `records`, `tour` and `test:unit`. The type and format steps are called `typecheck` and `format`, not `check` and `fmt`, because a script that has the name of a Bun command replaces that command (see the lessons).

`.github/workflows/ci.yml` runs the same gate after a frozen install on `ubuntu-24.04`, `macos-26` and `windows-2025`, then installs the test browsers and runs the end-to-end tests and the fresh-clone test.

## Consequences and trade-offs

- One sentence tells a contributor what "done" means.
- The gate grows slower with each check, and every step runs even for a one-line change. The cheap steps come first, so most problems stop it early.
- The workflow file states what will run. This record makes no claim that a run has passed.

## Revisit when

The gate takes so long that people stop running it, or a check is needed that cannot run on a contributor's machine.
