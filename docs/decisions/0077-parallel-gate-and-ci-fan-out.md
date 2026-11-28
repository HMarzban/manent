# 0077. Parallel gate and CI job fan-out

- Date: 2026-11-26
- Status: Accepted
- Decided by: engineering lead

## Context

Decision 0007 kept one local gate (`bun run verify`), running seven static checks and the full unit-test suite sequentially, and ran `verify`, all three end-to-end browser engines, and the fresh-clone test serially inside one CI job. As the suite grew past 3,700 tests across 590 files, serial execution pushed local and CI runs well past the threshold named in 0007's revisit rule, while downloading all three Playwright browsers before running fast static checks delayed early feedback.

## Options considered

- Keep serial execution and raise CI timeouts. Rejected: wastes developer time and runner capacity on superseded branch pushes and unused browsers.
- Drop checks or split `bun run verify` into optional commands. Rejected: breaks the single-command contract for "done".
- Parallelise inside the single gate with Bun's native `--parallel` runners, fan out CI into independent cached jobs, and parallelise release server compilation. Chosen.

## Decision

`bun run verify` remains the one local gate, running `verify:checks` (`bun run --parallel format:check typecheck lint tracked boundaries records tour`) first and stopping before `test:unit` (`bun test --parallel ./bench ./tools ./packages ./apps`, which implies `--isolate` and starts the heaviest suites first) if any static check does not pass. Locally, `bun run test:e2e:parallel` runs Chromium, Firefox and WebKit concurrently on isolated ports and temporary web build folders.

`.github/workflows/ci.yml` cancels superseded non-`main` runs, caches `~/.bun/install/cache`, and fans out five parallel jobs: `checks` (fast static gate on Linux with no browsers), `verify` (three OSes, Chromium only for benchmark tests), `e2e` (three OSes × three browsers, each installing only its own engine), `clone` (three OSes, no browsers), and `demo` (three OSes, Chromium only). `.github/workflows/release.yml` compiles all six server targets and archives the web app concurrently via `tools/build-server-release.ts`, and `desktop.yml` and `bench.yml` share the same concurrency and Bun cache policy.

## Consequences and trade-offs

- Static checks finish in under a second on a multi-core developer machine (measured at 0.54 s across six checks on an 18-core Mac, excluding local-only working notes), and unit tests scale across all CPU cores while preserving per-file isolation.
- CI fans out across more concurrent runners per push, trading runner concurrency for substantially lower wall-clock latency and avoiding Firefox/WebKit installs on jobs that only need Chromium or no browser at all.
- Subprocess CLI tests must strip `FORCE_COLOR` and set `NO_COLOR=1` because Bun's `--parallel` test workers can propagate colour environment flags.

## Revisit when

Unit tests need cross-runner sharding (`bun test --shard` with `--timings`) to stay under ten minutes on CI, or GitHub runner concurrency limits throttle the `e2e` matrix.
