import { afterAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { bootstrapInterval } from "@manent/perf";
import { createTempTrees } from "@manent/testkit";
import { UNITS, runSuite } from "../harness.ts";
import { afterWarmup } from "../measure.ts";
import { readResultFile } from "../result.ts";
import type { MetricSummary, ScenarioResult } from "../result.ts";

const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

const fixedNow = () => 1_794_909_600_000; // 2026-11-17T10:00:00Z
const envModule = JSON.stringify(join(import.meta.dir, "../env.ts"));

/** A scenario file whose run() executes `body`. */
function scenarioFile(id: string, processes: number, body: string): string {
  return `
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NotMeasured } from ${envModule};
export default {
  id: ${JSON.stringify(id)},
  workload: null,
  processes: ${processes},
  async run() {
    ${body}
  },
};
`;
}

/** A scenario file that reports `samples` of an ms metric in every process. */
function timing(
  id: string,
  processes: number,
  metric: string,
  samples: readonly number[],
): string {
  return scenarioFile(
    id,
    processes,
    `return [{ metric: ${JSON.stringify(metric)}, unit: "ms", samples: ${JSON.stringify(samples)} }];`,
  );
}

/** The n-th of `values` in the n-th process: each process counts itself in a file beside it. */
const byProcess = (values: readonly number[]): string =>
  `appendFileSync(join(import.meta.dir, "n.log"), "x");
    const n = readFileSync(join(import.meta.dir, "n.log"), "utf8").length;
    const value = ${JSON.stringify(values)}[n - 1];`;

function budgetFile(
  budgets: unknown,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    formatVersion: 1,
    tier: "D-modest",
    budgets,
    ...extra,
  });
}

const row = (
  scenario: string,
  metric: string,
  stat: string,
  budget: number,
  hardFail: number,
) => ({ scenario, metric, stat, budget, hardFail });

/** The run's scenario results, read back through the reader. */
async function resultsOf(run: { file: string }): Promise<ScenarioResult[]> {
  return (await readResultFile(run.file)).scenarios;
}

/** The metrics of the only scenario of a run, which must have been measured. */
async function metricsOf(run: { file: string }): Promise<MetricSummary[]> {
  const [only] = await resultsOf(run);
  if (only?.outcome !== "measured")
    throw new Error(`the scenario was ${only?.outcome}, not measured`);
  return only.metrics;
}

const hundredSamples = `
export default {
  id: "fixture.hundred",
  workload: "W1",
  processes: 1,
  async run() {
    console.log("a scenario may print above its result");
    return [{ metric: "typing", unit: "ms", samples: Array.from({ length: 100 }, (_, i) => 100 - i) }];
  },
};
`;

test("an empty suite writes a result file named for its start", async () => {
  const emptyDir = await trees.tree({});
  const outDir = join(await trees.tree({}), "results");
  const r = await runSuite({ root: emptyDir, outDir, now: fixedNow });
  expect(r).toEqual({
    file: join(outDir, "2026-11-17T10-00-00Z.json"),
    scenarios: 0,
    hardFails: 0,
    failed: 0,
    notMeasured: 0,
    void: 0,
    inconclusive: 0,
    unproved: [],
    unmatched: [],
  });
  expect(await readResultFile(r.file)).toMatchObject({
    formatVersion: 2,
    startedAt: 1_794_909_600_000,
    finishedAt: 1_794_909_600_000,
    scenarios: [],
    unmatched: [],
    unproved: [],
  });
});

test("a scenario runs in as many fresh processes as it asks for", async () => {
  const root = await trees.tree({
    "client/pids.bench.ts": scenarioFile(
      "fixture.pids",
      3,
      `appendFileSync(join(import.meta.dir, "pids.log"), process.pid + "\\n");
    return [{ metric: "pid", unit: "count", samples: [process.pid] }];`,
    ),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(r.scenarios).toBe(1);
  const pids = (await readFile(join(root, "client", "pids.log"), "utf8"))
    .trim()
    .split("\n")
    .map(Number);
  expect(pids).toHaveLength(3);
  expect(new Set(pids).size).toBe(3);
  expect(pids).not.toContain(process.pid);
  expect((await resultsOf(r))[0]).toMatchObject({
    id: "fixture.pids",
    area: "client",
    workload: null,
    processes: 3,
    outcome: "measured",
  });
  const [metric] = await metricsOf(r);
  expect(metric!.samples).toBe(3);
  expect(metric!.raw).toEqual(pids.map((pid) => [pid]));
  expect(metric!.p99).toBe(Math.max(...pids));
});

test("samples are summarised as p50, p95 and p99 with an interval, never a mean", async () => {
  const root = await trees.tree({
    "crdt/nested/hundred.bench.ts": hundredSamples,
    "budgets.json": budgetFile([row("fixture.hundred", "typing", "max", 1, 2)]),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(r).toMatchObject({ scenarios: 1, hardFails: 0 });
  expect(await Bun.file(r.file).text()).not.toContain("mean");
  const samples = Array.from({ length: 100 }, (_, i) => 100 - i);
  const interval = (p: number) =>
    bootstrapInterval(samples, p, { rounds: 1000, seed: 4747 });
  expect(await resultsOf(r)).toEqual([
    {
      id: "fixture.hundred",
      area: "crdt",
      workload: "W1",
      processes: 1,
      outcome: "measured",
      quiet: null,
      elapsedMs: 0,
      metrics: [
        {
          metric: "typing",
          unit: "ms",
          samples: 100,
          p50: 50,
          p95: 95,
          p99: 99,
          max: 100,
          intervals: {
            p50: interval(50),
            p95: interval(95),
            p99: interval(99),
          },
          processP50: [50, 50],
          warmup: 0,
          verdict: "no_budget",
          verdictReason: null,
          judgedStat: null,
          raw: [samples],
        },
      ],
    },
  ]);
});

test("a metric's summary names its sample count and its largest sample", async () => {
  const root = await trees.tree({
    "corpus/ten.bench.ts": timing(
      "fixture.ten",
      1,
      "t",
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(await metricsOf(r)).toMatchObject([
    {
      metric: "t",
      unit: "ms",
      samples: 10,
      p50: 5,
      p95: 10,
      p99: 10,
      max: 10,
      intervals: { p50: [2, 8], p95: [7, 10], p99: [7, 10] },
    },
  ]);
});

test("the filter keeps scenarios whose path contains it", async () => {
  const root = await trees.tree({
    "corpus/keep.bench.ts": hundredSamples,
    "server/drop.bench.ts": hundredSamples,
    "other/ignored.bench.ts": hundredSamples,
  });
  const all = await runSuite({ root, outDir: join(root, "a"), now: fixedNow });
  expect(all.scenarios).toBe(2);
  const some = await runSuite({
    root,
    outDir: join(root, "b"),
    filter: "corpus/",
    now: fixedNow,
  });
  expect(some.scenarios).toBe(1);
});

test("a scenario whose process throws could not finish, and keeps what it printed", async () => {
  const root = await trees.tree({
    "client/broken.bench.ts": scenarioFile(
      "fixture.broken",
      1,
      `throw new Error("the fixture broke");`,
    ),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(r.failed).toBe(1);
  const [broken] = await resultsOf(r);
  expect(broken).toMatchObject({ outcome: "failed", exitCode: 1 });
  expect(broken?.outcome === "failed" && broken.output).toContain(
    "the fixture broke",
  );
});

test("a scenario that prints no result could not finish, and says so last", async () => {
  const root = await trees.tree({
    "client/silent.bench.ts": `
export default {
  id: "fixture.silent",
  workload: null,
  processes: 1,
  async run() {
    console.log("working");
    process.stdout.write("still working\\n");
    await new Promise(() => setTimeout(() => process.exit(0), 10));
  },
};
`,
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(await resultsOf(r)).toMatchObject([
    {
      outcome: "failed",
      exitCode: 0,
      output:
        "working\nstill working\n\nclient/silent.bench.ts: the last line of output is not a result",
    },
  ]);
});

test("a malformed budget file stops the run and names the file and the row", async () => {
  const typingRow = row("fixture.hundred", "typing", "p95", 200, 300);
  const cases: [string, string][] = [
    [budgetFile([], { formatVersion: 2 }), "formatVersion must be 1"],
    [budgetFile({}), "budgets must be a list"],
    [budgetFile([], { tier: 7 }), "tier must be a string"],
    ["{ not json", "is not JSON"],
    [budgetFile([{ ...typingRow, stat: "p90" }]), 'row 1 has stat "p90"'],
    [budgetFile([{ ...typingRow, metric: 3 }]), "row 1 needs a scenario"],
    [
      budgetFile([typingRow, { ...typingRow, hardFail: undefined }]),
      "row 2 needs a finite budget and hardFail",
    ],
    [
      budgetFile([{ ...typingRow, budget: 400 }]),
      "row 1 needs a finite budget and hardFail",
    ],
    // a row of another tier is still checked for shape
    [
      budgetFile([{ ...typingRow, stat: "mean" }], { tier: "host" }),
      'row 1 has stat "mean"',
    ],
  ];
  for (const [text, message] of cases) {
    const root = await trees.tree({
      "client/hundred.bench.ts": hundredSamples,
      "budgets.json": text,
    });
    const run = runSuite({ root, outDir: join(root, "out"), now: fixedNow });
    await expect(run).rejects.toThrow(message);
    await expect(run).rejects.toThrow(join(root, "budgets.json"));
  }
});

test("a scenario must say its workload, null included", async () => {
  const root = await trees.tree({
    "corpus/bare.bench.ts": `
export default {
  id: "fixture.bare",
  processes: 1,
  async run() {
    return [{ metric: "size", unit: "bytes", samples: [10] }];
  },
};
`,
  });
  await expect(
    runSuite({ root, outDir: join(root, "out"), now: fixedNow }),
  ).rejects.toThrow("workload");
});

test("output a scenario leaves without a newline does not hide its result", async () => {
  const root = await trees.tree({
    "corpus/chatty.bench.ts": scenarioFile(
      "fixture.chatty",
      1,
      `await Bun.write(Bun.stdout, "progress without a newline");
    return [{ metric: "size", unit: "bytes", samples: [10] }];`,
    ),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(await metricsOf(r)).toMatchObject([{ metric: "size", samples: 1 }]);
});

test("a measurement's unit is one of these", () => {
  expect(UNITS).toEqual(["ms", "bytes", "count", "percent"]);
});

test("constant timing samples are inconclusive", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": timing("a", 5, "m", [5, 5, 5, 5]),
    "budgets.json": budgetFile([row("a", "m", "p95", 4, 8)]),
  });
  const r = await runSuite({
    root,
    outDir: join(root, "out"),
    now: fixedNow,
    tier: "D-modest",
  });
  expect(await metricsOf(r)).toMatchObject([
    {
      samples: 20,
      verdict: "inconclusive",
      verdictReason: "constant",
      judgedStat: "p95",
    },
  ]);
  expect(r.inconclusive).toBe(1);
});

test("a timing scenario needs at least 5 processes", async () => {
  const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
  const run = async (stat: string, mode?: "quick") => {
    const root = await trees.tree({
      "client/a.bench.ts": timing("a", 3, "t", fifty),
      "budgets.json": budgetFile([row("a", "t", stat, 100, 200)]),
    });
    const r = await runSuite({
      root,
      outDir: join(root, "out"),
      now: fixedNow,
      tier: "D-modest",
      mode,
    });
    return (await resultsOf(r))[0];
  };
  expect(await run("p95")).toMatchObject({
    outcome: "failed",
    exitCode: 0,
    output: "a: a timing scenario needs at least 5 processes, not 3",
  });
  expect(await run("max")).toMatchObject({
    outcome: "measured",
    processes: 3,
    metrics: [{ samples: 150, verdict: "pass", judgedStat: "max" }],
  });
  expect(await run("p95", "quick")).toMatchObject({
    outcome: "measured",
    processes: 1,
    metrics: [{ samples: 50, verdict: "no_budget", judgedStat: null }],
  });
});

/** The pooled count, verdict and reason of `perProcess` distinct samples of `metric` in each of 5 processes, under a p95 row. */
async function judgedOver(metric: string, perProcess: number) {
  const samples = Array.from({ length: perProcess }, (_, i) => i + 1);
  const root = await trees.tree({
    "client/a.bench.ts": timing("a", 5, metric, samples),
    "budgets.json": budgetFile([row("a", metric, "p95", 1000, 2000)]),
  });
  const r = await runSuite({
    root,
    outDir: join(root, "out"),
    now: fixedNow,
    tier: "D-modest",
  });
  const [m] = await metricsOf(r);
  return [m!.samples, m!.verdict, m!.verdictReason];
}

test("a percentile needs enough samples to be judged", async () => {
  expect(await judgedOver("t", 6)).toEqual([
    30,
    "inconclusive",
    "too_few_samples",
  ]);
  expect(await judgedOver("t", 8)).toEqual([40, "pass", null]);
  // 170 a process keeps 150 after the warm-up of 20
  expect(await judgedOver("keystroke_paint", 170)).toEqual([
    750,
    "inconclusive",
    "too_few_samples",
  ]);
});

test("a budgeted metric the scenario did not report fails it", async () => {
  const root = await trees.tree({
    "client/s.bench.ts": scenarioFile(
      "s",
      1,
      `return [{ metric: "y", unit: "count", samples: [1] }];`,
    ),
    "budgets.json": budgetFile([row("s", "x", "max", 1, 2)]),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(r.failed).toBe(1);
  expect(await resultsOf(r)).toMatchObject([
    {
      id: "s",
      outcome: "failed",
      exitCode: 0,
      output: "s x was budgeted and not measured",
    },
  ]);
});

test("warm-up samples are dropped and counted", async () => {
  const three = Array.from({ length: 300 }, (_, i) => i);
  expect(afterWarmup(three)).toEqual({ kept: three.slice(30), dropped: 30 });
  expect(afterWarmup(three.slice(0, 100)).dropped).toBe(20);
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  const root = await trees.tree({
    "client/a.bench.ts": scenarioFile(
      "a",
      1,
      `const s = ${JSON.stringify(hundred)};
    return [{ metric: "keystroke_paint", unit: "ms", samples: s }, { metric: "open_ms", unit: "ms", samples: s }];`,
    ),
  });
  const shape = async (mode: "quick" | "standard") => {
    const out = join(root, mode);
    const r = await runSuite({ root, outDir: out, now: fixedNow, mode });
    return (await metricsOf(r)).map((m) => [m.metric, m.warmup, m.raw]);
  };
  expect(await shape("standard")).toEqual([
    ["keystroke_paint", 20, [hundred.slice(20)]],
    ["open_ms", 0, [hundred]],
  ]);
  expect(await shape("quick")).toEqual([
    ["keystroke_paint", 0, [hundred]],
    ["open_ms", 0, [hundred]],
  ]);
});

test("a scenario that says it cannot run is recorded, and the run goes on", async () => {
  const root = await trees.tree({
    "corpus/a.bench.ts": scenarioFile(
      "a",
      1,
      `throw new NotMeasured("traces not fetched");`,
    ),
    "corpus/b.bench.ts": scenarioFile("b", 1, `process.exit(3);`),
    "corpus/c.bench.ts": scenarioFile(
      "c",
      1,
      `return [{ metric: "size", unit: "bytes", samples: [10] }];`,
    ),
  });
  const outDir = join(root, "out");
  const r = await runSuite({ root, outDir, now: fixedNow });
  expect([r.scenarios, r.failed, r.notMeasured]).toEqual([3, 1, 1]);
  const file = await readResultFile(r.file);
  expect(file.scenarios.map((s) => [s.id, s.outcome])).toEqual([
    ["a", "not_measured"],
    ["b", "failed"],
    ["c", "measured"],
  ]);
  expect(file.scenarios.slice(0, 2)).toMatchObject([
    { reason: "traces not fetched" },
    { exitCode: 3 },
  ]);
});

test("a timed scenario on a busy machine is void, with the load it saw", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": timing("a", 1, "t", [1, 2]),
  });
  const waits: number[] = [];
  const r = await runSuite({
    root,
    outDir: join(root, "busy"),
    now: fixedNow,
    quiet: () => ({ load: 9, spread: 1 }),
    waitMs: async (ms) => {
      waits.push(ms);
    },
  });
  expect(waits).toEqual(Array(12).fill(5000));
  expect((await readResultFile(r.file)).scenarios[0]).toMatchObject({
    outcome: "void",
    reason: "busy_machine",
    quiet: { load: 9, spread: 1 },
  });
  expect(r.void).toBe(1);
  // a spread calibration is busy whatever the load says
  const spread = await runSuite({
    root,
    outDir: join(root, "spread"),
    now: fixedNow,
    quiet: () => ({ load: 0, spread: 2 }),
    waitMs: async () => {},
  });
  expect((await resultsOf(spread))[0]).toMatchObject({
    outcome: "void",
    quiet: { load: 0, spread: 2 },
  });
  const calm = await runSuite({
    root,
    outDir: join(root, "calm"),
    now: fixedNow,
    quiet: () => ({ load: 0, spread: 1 }),
    waitMs: async () => {},
  });
  expect((await resultsOf(calm))[0]).toMatchObject({
    outcome: "measured",
    quiet: { load: 0, spread: 1 },
  });
});

test("a row no scenario declares is listed, and the run still writes its file", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": timing("a", 1, "m", [1]),
    "budgets.json": budgetFile([
      row("a", "m", "max", 5, 10),
      row("ghost", "m", "p50", 5, 10),
      row("ghost", "m", "p95", 5, 10),
    ]),
  });
  const r = await runSuite({ root, outDir: join(root, "a"), now: fixedNow });
  expect(r.unmatched).toEqual(["ghost m"]);
  expect((await readResultFile(r.file)).unmatched).toEqual([
    { scenario: "ghost", metric: "m" },
  ]);
  const filtered = await runSuite({
    root,
    outDir: join(root, "b"),
    now: fixedNow,
    filter: "client/",
  });
  expect(filtered.unmatched).toEqual([]);
});

test("a tier that cannot run records every scenario of its areas as not measured", async () => {
  const ran = `appendFileSync(join(import.meta.dir, "ran.log"), "x");
    return [{ metric: "size", unit: "bytes", samples: [1] }];`;
  const root = await trees.tree({
    "server/a.bench.ts": scenarioFile("server.a", 5, ran),
    "server/b.bench.ts": scenarioFile("server.b", 1, ran),
    "corpus/c.bench.ts": scenarioFile("corpus.c", 1, ran),
  });
  const r = await runSuite({
    root,
    outDir: join(root, "out"),
    now: fixedNow,
    areas: ["server"],
    cannotRun: "Docker is not running",
  });
  expect(await resultsOf(r)).toEqual([
    {
      id: "server.a",
      area: "server",
      workload: null,
      processes: 5,
      outcome: "not_measured",
      reason: "Docker is not running",
    },
    {
      id: "server.b",
      area: "server",
      workload: null,
      processes: 1,
      outcome: "not_measured",
      reason: "Docker is not running",
    },
  ]);
  expect(await Bun.file(join(root, "server", "ran.log")).exists()).toBe(false);
});

test("a one-value-a-process metric and a count are judged on their point value", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": scenarioFile(
      "a",
      5,
      `${byProcess([3, 4, 5, 6, 9])}
    return [{ metric: "t", unit: "ms", samples: [value] }, { metric: "c", unit: "count", samples: [0] }];`,
    ),
    "budgets.json": budgetFile([
      row("a", "t", "p50", 4, 8),
      row("a", "c", "p99", 0, 0),
    ]),
  });
  const r = await runSuite({
    root,
    outDir: join(root, "out"),
    now: fixedNow,
    tier: "D-modest",
  });
  expect(
    (await metricsOf(r)).map((m) => [m.metric, m.raw, m.verdict, m.judgedStat]),
  ).toEqual([
    ["t", [[3], [4], [5], [6], [9]], "over_budget", "p50"],
    ["c", [[0], [0], [0], [0], [0]], "pass", "p99"],
  ]);
});

/** A scenario reporting a count of 20 in one process. */
const countOf = (id: string): string =>
  scenarioFile(
    id,
    1,
    `return [{ metric: "c", unit: "count", samples: [20] }];`,
  );

test("a budget applies on the tier that judges its area, at 1x, outside quick mode", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": countOf("client.a"),
    "server/b.bench.ts": countOf("server.b"),
    "server/soak.bench.ts": countOf("server.soak"),
    "budgets.json": budgetFile([
      row("client.a", "c", "max", 5, 10),
      row("server.b", "c", "max", 5, 10),
      row("server.soak", "c", "max", 5, 10),
    ]),
  });
  let n = 0;
  const verdicts = async (options: {
    tier: "D-modest" | "D-small";
    throttle?: 1 | 4;
    mode?: "quick" | "full";
  }) => {
    n += 1;
    const outDir = join(root, `out-${n}`);
    const r = await runSuite({ root, outDir, now: fixedNow, ...options });
    return (await resultsOf(r)).map((s) => [
      s.id,
      s.outcome === "measured" ? s.metrics[0]!.verdict : s.outcome,
    ]);
  };
  expect(await verdicts({ tier: "D-modest" })).toEqual([
    ["client.a", "hard_fail"],
    ["server.b", "no_budget"],
    ["server.soak", "no_budget"],
  ]);
  expect(await verdicts({ tier: "D-small" })).toEqual([
    ["client.a", "no_budget"],
    ["server.b", "hard_fail"],
    ["server.soak", "no_budget"],
  ]);
  expect(await verdicts({ tier: "D-modest", throttle: 4 })).toEqual([
    ["client.a", "no_budget"],
    ["server.b", "no_budget"],
    ["server.soak", "no_budget"],
  ]);
  expect(await verdicts({ tier: "D-modest", mode: "quick" })).toEqual([
    ["client.a", "no_budget"],
    ["server.b", "no_budget"],
    ["server.soak", "no_budget"],
  ]);
  // a soak's rows apply only to a full run
  expect(await verdicts({ tier: "D-small", mode: "full" })).toEqual([
    ["client.a", "no_budget"],
    ["server.b", "hard_fail"],
    ["server.soak", "hard_fail"],
  ]);
});
