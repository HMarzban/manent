# 0012. The benchmark ships with the app, and its budgets are checked data

- Date: 2026-11-17
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Performance is a stated goal. A benchmark added later measures a build that differs from the shipped one, budgets kept as prose drift away from the code, and a budget file read loosely can turn a typing slip into a pass.

## Options considered

- Instrumentation only in benchmark builds. Rejected: adding it changes what is measured.
- Real older laptops as the hardware tiers. Not chosen: the project owner preferred containers that any machine can reproduce.
- Means, or the best of several runs. Rejected: latency has a long tail, and the tail is what a writer feels.

## Decision

Timing marks ship inside the product build, switched off by a flag (`@manent/perf`, a ring of 10,000 records). Samples are summarised as percentiles with bootstrap intervals, never as a mean (`bench/stats.ts`). `bench/budgets.json` is validated before a run (`bench/budgets.ts`): its version, the fields of every row, and that each row matches something the run measured. A budget row arrives with the first change of the work that builds the scenario measuring it, so until every scenario exists only filtered runs are made (`bun run bench --filter <text>`). The hardware tiers are containers with fixed CPU and memory limits.

## Consequences and trade-offs

- Measurements see the shipped code, and a malformed or orphaned budget row stops the run instead of passing it.
- A container is not an old laptop. Limiting the cores leaves each one fast, so typing is also timed with the browser's CPU throttling, and without a graphics card painting looks slower than it would on real hardware. Windows and macOS cannot run in such containers.
- The harness exists; the suite has no scenarios yet (`bench/harness.ts`).

## Revisit when

The first full run shows the container tiers disagreeing with a real modest machine, or the marks cost something measurable while switched off.
