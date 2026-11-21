# Benchmarks

The benchmark suite in `bench/` measures the page engine, typing, the CRDT and the server. It ships with the code so anyone can run it on their own machine.

> [!IMPORTANT]
> No benchmark result has been published yet, and none is quoted in these documents. A figure from your own run describes your machine, your Bun and that run only.

## Run it

```sh
make bench                        # or: bun run bench — every scenario
bun run bench --filter engine-120 # only the scenarios whose path contains the text
```

Each run prints its tier and how many scenarios it found, and writes one JSON file to `bench/results/` (not tracked). The file records Bun's version, the platform, and for each metric its unit, the number of samples, p50, p95, p99 and max, with a bootstrap interval for each percentile. A mean is never reported.

## Scenarios

| Folder          | Scenarios                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `bench/client/` | `pagination-engine-120`, `-400`, `-2000`: laying out a script of that many pages; `typing-120`, `typing-2000`, `paste-50` |
| `bench/crdt/`   | `rebuild-size`, `rebuild-time`: an aged script's size against its text, and the time to rebuild it                        |
| `bench/server/` | `durability`, `fanout`, `join-storm`, `persistence`, `push-cost`, `rebuild-stall`, `room-memory`, `soak`                  |

A scenario is a `*.bench.ts` file whose default export is a `Scenario` (`bench/harness.ts`): an id, a workload, how many processes to run and a `run()` that returns measurements. Timing scenarios run in five or more fresh processes and pool their samples; counting scenarios run once.

`MANENT_SOAK_MINUTES` sets the length of the soak scenario (a whole number, 2 or more; 2 by default).

## Budgets

`bench/budgets.json` holds a budget and a hard limit for each metric, for one reference machine class, named by its `tier`. The harness reads the file before a run and stops on a malformed row. A run judges each metric `pass`, `over_budget` or `hard_fail` only when its tier is the file's; otherwise every metric is `no_budget`. A run on a development machine runs under the tier `host`, so today every metric is `no_budget` and a run cannot fail on a budget. Setting the reference machine and publishing its report are planned.

The interface's hard limits, such as the time to open a popover, a panel or a screen, are checked by `e2e/interface/budgets.e2e.ts` in Chromium, as part of the end-to-end tests.

## Adding a scenario

1. Put a `*.bench.ts` file under `bench/corpus/`, `bench/crdt/`, `bench/client/` or `bench/server/`.
2. Add its budget rows to `bench/budgets.json`. An unfiltered run fails if a budget row has no measured metric.
3. State the conditions of any figure you quote: machine, data, number of runs and what was not covered.
