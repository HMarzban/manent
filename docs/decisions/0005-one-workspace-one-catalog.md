# 0005. One workspace, one lockfile, one version catalog

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Twenty-five workspaces share libraries such as ProseMirror, Yjs and React. If each manifest named its own versions, two copies of one library could load side by side, and an upgrade would mean editing many files. A version published a few hours ago is also the one most likely to be withdrawn or tampered with.

## Options considered

- Versions in each manifest. Rejected: packages drift apart and duplicate copies load.
- Version ranges in one catalog. Rejected: an install could change what runs with no change to the repository.
- A separate task runner on top, such as Turborepo or Nx. Rejected: `bun run --filter` does what is needed.
- One catalog of exact versions. Chosen.

## Decision

One Bun workspace, one `bun.lock`, and one catalog in the root `package.json` that holds every external version, each one exact. Packages refer to it with `catalog:` and to each other with `workspace:*`. `bunfig.toml` sets the isolated linker, under which a package sees only the dependencies its manifest declares, and a minimum release age of three days, so a version younger than that waits and its earlier patch is used meanwhile. The catalog holds only packages some workspace declares: a package that was chosen but is not needed yet enters with the first change that imports it. `tools/test/workspace.test.ts` checks the exact versions, that every entry is used, and the release age.

## Consequences and trade-offs

- An upgrade is one line in one file.
- The newest release of a package is sometimes unavailable on the day it is wanted. A version chosen on paper is pinned only after an install under the rule succeeds (see the lessons).
- With the isolated linker a missing declaration fails at once instead of working by accident.

## Revisit when

A security fix has to be installed sooner than three days after its release, or one catalog stops being enough to keep a single copy of each library.
