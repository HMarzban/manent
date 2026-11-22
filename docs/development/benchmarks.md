# Benchmarks

The benchmark suite in `bench/` measures the page engine, typing, the CRDT and the server. It ships with the code so anyone can run it on their own machine.

> [!IMPORTANT]
> No benchmark result has been published yet, and none is quoted in these documents. A figure from your own run describes your machine, your Bun and that run only.

## Run it

```sh
make bench                                # or: bun run bench — every scenario
bun run bench --filter engine-120         # only the scenarios whose path contains the text
bun run bench --quick --filter history    # one process each, fewer samples, nothing judged
```

| Option or variable      | What it sets                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--quick`, `--full`     | The mode: `quick` runs one process per scenario, takes fewer samples and judges nothing; `standard` is the default; `full` takes the most samples and is the only mode in which the soaks' rows judge |
| `--prove`               | Runs each scenario that has a budget row with a wait added inside every sample, and reports a row that could not fail                                                                                 |
| `MANENT_BENCH_TIER`     | The machine class the run is recorded as: `host` (the default), `D-modest`, `D-typical`, `D-small` or `ci-shared`                                                                                     |
| `MANENT_BENCH_THROTTLE` | The processor slowdown a client scenario applies: 1 (the default), 4 or 6                                                                                                                             |
| `MANENT_SOAK_MINUTES`   | The length of the server soak, a whole number of minutes, 2 or more; 2 by default                                                                                                                     |

Each run prints its tier, slowdown and mode, and how many scenarios were measured, could not finish, were not measured or were void. It writes one JSON file to `bench/results/` (not tracked) recording the commit, Bun's version, the platform and, for each metric, its unit, the number of samples, p50, p95, p99 and max, with a bootstrap interval for each percentile. A mean is never reported. A timing run first checks that the machine is quiet; on a busy machine the scenario is recorded as void, not measured.

## Scenarios

| Folder                     | Scenarios                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bench/client/`            | `pagination-engine-120`, `-400`, `-2000`: laying out a script of that many pages; `typing-120`, `typing-2000` and `paste-50` in the real editor                |
| `bench/client/history/`    | `history.compare.120`, `history.compare.2000`: comparing two versions 400 edits apart, as the History tab does                                                 |
| `bench/client/production/` | `production.lock`, `production.issue`: locking a 120-page script and issuing a revision; `production.marks`: revision marks per keystroke, twelve revisions in |
| `bench/crdt/`              | `crdt.rebuild-size`, `crdt.rebuild-time`: an aged script's size against its text, and the time to rebuild it                                                   |
| `bench/server/`            | `server.durability`, `fanout`, `join-storm`, `persistence`, `push-cost`, `rebuild-stall`, `room-memory`, `soak`                                                |
| `bench/server/history/`    | `history.list.first_page`: the first page of 5,000 thinned versions; `history.version.2000`: the version a session leaves; `history.restore.120`, `.2000`      |
| `bench/demo/`              | `demo.seed`: the seeds of `make demo`, from an empty data folder to the end of the large workspace's background seed                                           |

A scenario is a `*.bench.ts` file whose default export is a `Scenario` (`bench/harness.ts`): an id, a workload, how many processes to run and a `run()` that returns measurements. Timing scenarios run in five or more fresh processes and pool their samples; counting scenarios run once. A scenario that cannot run on this machine says why and is recorded as not measured.

## Budgets

`bench/budgets.json` holds a budget and a hard limit for each metric. Each area of the suite is judged on one reference machine class (`bench/tiers/tiers.ts`): the client, CRDT and corpus scenarios on `D-modest`, the server's on `D-small`, and the desktop and demo scenarios on `host`. The harness reads the file before a run and stops on a malformed row. A row is in force only on its area's tier, at no slowdown, outside quick mode and a proof, and a soak's row only in full mode; a metric with no row in force is `no_budget`. A run on a development machine runs under the tier `host` unless `MANENT_BENCH_TIER` says otherwise, so there only the desktop and demo rows judge.

A metric with a row in force is judged `pass`, `over_budget` or `hard_fail`. A percentile of a timing sampled more than once in a process is judged on its interval: only when the whole interval lies under the budget, or over it, is it decided, and otherwise it is `inconclusive`, as it is with too few samples. A run exits with failure when a scenario could not finish, when a proof finds a row that cannot fail, or when an unfiltered run finds a budget row with no scenario. Some rows belong to scenarios that are still being written, so for now run the suite with `--filter`. Setting the reference machines and publishing their report are in progress.

The interface's hard limits, such as the time to open a popover, a panel or a screen, are checked by `e2e/interface/budgets.e2e.ts` in Chromium, as part of the end-to-end tests.

## Adding a scenario

1. Put a `*.bench.ts` file under `bench/corpus/`, `bench/crdt/`, `bench/client/`, `bench/server/` or `bench/demo/`.
2. Add its budget rows to `bench/budgets.json`. An unfiltered run fails if a budget row has no measured metric.
3. State the conditions of any figure you quote: machine, data, number of runs and what was not covered.
