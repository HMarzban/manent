import { expect, test } from "bun:test";
import { join } from "node:path";
import { compareRuns, isDeterministic, toBaseline } from "../compare.ts";
import type { MetricSummary, ResultFile, ScenarioResult } from "../result.ts";

const TOLERANCE = { deterministicPercent: 2, timingPercent: 25 };

function metric(
  name: string,
  unit: MetricSummary["unit"],
  p50: number,
  p50Interval: [number, number],
): MetricSummary {
  return {
    metric: name,
    unit,
    samples: 10,
    p50,
    p95: p50,
    p99: p50,
    max: p50,
    intervals: { p50: p50Interval, p95: p50Interval, p99: p50Interval },
    processP50: [p50, p50],
    warmup: 0,
    verdict: "no_budget",
    verdictReason: null,
    judgedStat: null,
    raw: [[p50]],
  };
}

function measured(
  id: string,
  area: ScenarioResult["area"],
  metrics: MetricSummary[],
): ScenarioResult {
  return {
    id,
    area,
    workload: null,
    processes: 1,
    outcome: "measured",
    metrics,
    quiet: null,
    elapsedMs: 0,
  };
}

function resultFile(scenarios: ScenarioResult[]): ResultFile {
  return {
    formatVersion: 2,
    startedAt: 1_794_909_600_000,
    finishedAt: 1_794_909_600_000,
    environment: {
      tier: "ci-shared",
      throttle: 1,
      mode: "quick",
      prove: false,
      bun: "1.4.4",
      platform: "linux",
      arch: "x64",
      cpus: 4,
      memoryBytes: 17_179_869_184,
      limits: { cpus: null, memoryBytes: null },
      chromium: null,
      commit: "abc",
      dirty: false,
      corpusVersion: 1,
      command: "bun bench/run.ts --tier ci-shared --quick",
    },
    scenarios,
    unmatched: [],
    unproved: [],
  };
}

test("a regression is a deterministic change past 2 % or a timing interval wholly past 25 %", () => {
  const baseline = resultFile([
    measured("crdt.size", "crdt", [
      metric("live_bytes", "bytes", 1000, [1000, 1000]),
      metric("state_bytes", "bytes", 1000, [1000, 1000]),
      metric("client_ids", "count", 100, [100, 100]),
    ]),
    measured("server.fanout", "server", [
      metric("fanout_ms", "ms", 100, [95, 105]),
      metric("lag_ms", "ms", 100, [95, 105]),
      metric("only_here_ms", "ms", 1, [1, 1]),
    ]),
    measured("server.gone", "server", [metric("x_ms", "ms", 1, [1, 1])]),
  ]);
  const candidate = resultFile([
    measured("server.fanout", "server", [
      metric("fanout_ms", "ms", 135, [130, 140]),
      metric("lag_ms", "ms", 125, [120, 130]),
    ]),
    measured("crdt.size", "crdt", [
      metric("live_bytes", "bytes", 1010, [1010, 1010]),
      metric("state_bytes", "bytes", 1030, [1030, 1030]),
      metric("client_ids", "count", 97, [97, 97]),
    ]),
    {
      id: "server.gone",
      area: "server",
      workload: null,
      processes: 1,
      outcome: "not_measured",
      reason: "Docker is not running",
    },
  ]);
  expect(compareRuns(baseline, candidate, TOLERANCE)).toEqual([
    {
      metric: "live_bytes",
      scenario: "crdt.size",
      baseline: 1000,
      candidate: 1010,
      regressed: false,
    },
    {
      metric: "state_bytes",
      scenario: "crdt.size",
      baseline: 1000,
      candidate: 1030,
      regressed: true,
    },
    {
      metric: "client_ids",
      scenario: "crdt.size",
      baseline: 100,
      candidate: 97,
      regressed: true,
    },
    {
      metric: "fanout_ms",
      scenario: "server.fanout",
      baseline: 100,
      candidate: 135,
      regressed: true,
    },
    {
      metric: "lag_ms",
      scenario: "server.fanout",
      baseline: 100,
      candidate: 125,
      regressed: false,
    },
  ]);
});

test("only sizes and counts from fixed seeds, and the blocks loaded, are deterministic", () => {
  const cases: [
    ScenarioResult["area"],
    MetricSummary["unit"],
    string,
    boolean,
  ][] = [
    ["crdt", "bytes", "live_bytes", true],
    ["corpus", "count", "blocks", true],
    ["client", "count", "input_blocks", true],
    ["server", "count", "input_blocks", true],
    ["crdt", "ms", "load_ms", false],
    ["crdt", "percent", "ratio", false],
    ["server", "bytes", "rss_bytes", false],
    ["client", "count", "dom_nodes", false],
  ];
  expect(
    cases.map(([area, unit, name]) => {
      const m = metric(name, unit, 1, [1, 1]);
      return isDeterministic(measured("s", area, [m]), m);
    }),
  ).toEqual(cases.map(([, , , deterministic]) => deterministic));
});

test("a baseline keeps only deterministic metrics, and only scenarios that still hold one", () => {
  const bytes = metric("live_bytes", "bytes", 1000, [1000, 1000]);
  const blocks = metric("input_blocks", "count", 3000, [3000, 3000]);
  const file = resultFile([
    measured("crdt.size", "crdt", [bytes, metric("load_ms", "ms", 4, [3, 5])]),
    measured("server.fanout", "server", [metric("fanout_ms", "ms", 9, [8, 9])]),
    measured("typing-120", "client", [
      metric("keystroke_paint", "ms", 9, [8, 9]),
      blocks,
    ]),
    {
      id: "server.gone",
      area: "server",
      workload: null,
      processes: 1,
      outcome: "not_measured",
      reason: "Docker is not running",
    },
  ]);
  expect(toBaseline(file)).toEqual({
    ...file,
    scenarios: [
      measured("crdt.size", "crdt", [bytes]),
      measured("typing-120", "client", [blocks]),
    ],
  });
});

const QUICK_STEPS = [
  { uses: "actions/checkout@v5", with: { "persist-credentials": false } },
  { uses: "oven-sh/setup-bun@v2", with: { "bun-version": "1.4.4" } },
  {
    uses: "actions/cache@v4",
    with: {
      path: "~/.bun/install/cache",
      key: "${{ runner.os }}-bun-1.4.4-${{ hashFiles('bun.lock') }}",
      "restore-keys": "${{ runner.os }}-bun-1.4.4-\n",
    },
  },
  { run: "bun install --frozen-lockfile" },
  { run: "bun x playwright install --with-deps chromium" },
  { run: "bun run bench --tier ci-shared --quick" },
];

test("the published workflow runs the quick suite on three systems and compares only on Linux", async () => {
  const workflow: unknown = Bun.YAML.parse(
    await Bun.file(
      join(import.meta.dir, "../../.github/workflows/bench.yml"),
    ).text(),
  );
  expect(workflow).toEqual({
    name: "bench",
    on: { pull_request: null, workflow_dispatch: null },
    permissions: { contents: "read" },
    concurrency: {
      group: "bench-${{ github.ref }}",
      "cancel-in-progress": "${{ github.ref != 'refs/heads/main' }}",
    },
    jobs: {
      deterministic: {
        "runs-on": "ubuntu-24.04",
        "timeout-minutes": 45,
        steps: [
          ...QUICK_STEPS,
          {
            run: 'bun run bench compare bench/baseline.json "$(ls -t bench/results/*.json | head -1)"',
          },
          {
            if: "always()",
            uses: "actions/upload-artifact@v4",
            with: { name: "bench-results-linux", path: "bench/results/" },
          },
        ],
      },
      works: {
        "timeout-minutes": 45,
        strategy: {
          "fail-fast": false,
          matrix: { os: ["windows-2025", "macos-26"] },
        },
        "runs-on": "${{ matrix.os }}",
        steps: [
          ...QUICK_STEPS,
          {
            if: "always()",
            uses: "actions/upload-artifact@v4",
            with: {
              name: "bench-results-${{ matrix.os }}",
              path: "bench/results/",
            },
          },
        ],
      },
    },
  });
});
