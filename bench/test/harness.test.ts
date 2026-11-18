import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bootstrapInterval, judge, percentile, runSuite } from "../harness.ts";
import type { Budget } from "../harness.ts";

const made: string[] = [];

afterAll(async () => {
  for (const dir of made) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manent-bench-"));
  made.push(dir);
  return dir;
}

/** A root holding the given files, keyed by path relative to it. */
async function fixtureRoot(files: Record<string, string>): Promise<string> {
  const root = await tempDir();
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return root;
}

const fixedNow = () => new Date("2026-11-17T10:00:00Z");

interface ResultMetric {
  metric: string;
  unit: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  intervals: Record<"p50" | "p95" | "p99", [number, number]>;
  verdict: string;
}
interface ResultFile {
  formatVersion: number;
  startedAt: string;
  tier: string;
  bun: string;
  platform: string;
  arch: string;
  scenarios: {
    id: string;
    workload: string | null;
    processes: number;
    metrics: ResultMetric[];
  }[];
}

async function readResult(file: string): Promise<ResultFile> {
  return (await Bun.file(file).json()) as ResultFile;
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

test("percentiles use nearest rank", () => {
  const s = Array.from({ length: 100 }, (_, i) => i + 1);
  expect([percentile(s, 50), percentile(s, 95), percentile(s, 99)]).toEqual([
    50, 95, 99,
  ]);
  expect(percentile([7], 99)).toBe(7);
  expect(percentile([3, 1, 2], 50)).toBe(2);
  expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  expect(percentile([1, 2, 3, 4], 0)).toBe(1);
  expect(() => percentile([], 50)).toThrow(RangeError);
  expect(() => percentile([1], 101)).toThrow(RangeError);
  expect(() => percentile([1], Number.NaN)).toThrow(RangeError);
});

test("the bootstrap interval is deterministic for a seed and brackets the percentile", () => {
  const s = Array.from({ length: 200 }, (_, i) => ((i * 37) % 101) + i / 10);
  for (const p of [50, 95, 99]) {
    const a = bootstrapInterval(s, p, { rounds: 1000, seed: 4747 });
    const b = bootstrapInterval(s, p, { rounds: 1000, seed: 4747 });
    expect(a).toEqual(b);
    const [lo, hi] = a;
    expect(lo).toBeLessThanOrEqual(percentile(s, p));
    expect(hi).toBeGreaterThanOrEqual(percentile(s, p));
    expect(lo).toBeLessThan(hi);
  }
  expect(bootstrapInterval(s, 50, { rounds: 1000, seed: 1 })).not.toEqual(
    bootstrapInterval(s, 50, { rounds: 1000, seed: 4747 }),
  );
  expect(bootstrapInterval([5, 5, 5], 95, { rounds: 100, seed: 4747 })).toEqual(
    [5, 5],
  );
  expect(() => bootstrapInterval([], 50, { rounds: 10, seed: 1 })).toThrow(
    RangeError,
  );
  expect(() => bootstrapInterval([1], 50, { rounds: 0, seed: 1 })).toThrow(
    RangeError,
  );
});

test("a value is judged against its budget", () => {
  const b: Budget = {
    scenario: "s",
    metric: "m",
    stat: "p95",
    budget: 33,
    hardFail: 50,
  };
  expect([
    judge(20, b),
    judge(40, b),
    judge(60, b),
    judge(60, undefined),
  ]).toEqual(["pass", "over_budget", "hard_fail", "no_budget"]);
  expect([judge(33, b), judge(50, b)]).toEqual(["pass", "over_budget"]);
});

test("a suite with no scenarios runs and writes a result file", async () => {
  const emptyDir = await tempDir();
  const outDir = join(await tempDir(), "results");
  const r = await runSuite({ root: emptyDir, outDir, now: fixedNow });
  expect(r).toEqual({
    file: join(outDir, "2026-11-17T10-00-00Z.json"),
    scenarios: 0,
    hardFails: 0,
  });
  expect(await Bun.file(r.file).json()).toMatchObject({
    formatVersion: 1,
    startedAt: "2026-11-17T10:00:00.000Z",
    tier: "host",
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    scenarios: [],
  });
});

test("a scenario runs in as many fresh processes as it asks for", async () => {
  const root = await fixtureRoot({
    "client/pids.bench.ts": `
import { appendFileSync } from "node:fs";
import { join } from "node:path";
export default {
  id: "fixture.pids",
  workload: null,
  processes: 3,
  async run() {
    appendFileSync(join(import.meta.dir, "pids.log"), process.pid + "\\n");
    return [{ metric: "pid", unit: "count", samples: [process.pid] }];
  },
};
`,
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
  const result = await readResult(r.file);
  expect(result.scenarios).toHaveLength(1);
  expect(result.scenarios[0]).toMatchObject({
    id: "fixture.pids",
    workload: null,
    processes: 3,
  });
  const metric = result.scenarios[0]!.metrics[0]!;
  expect(metric.n).toBe(3);
  expect(pids).toContain(metric.p50);
  expect(metric.p99).toBe(Math.max(...pids));
});

test("samples are summarised as p50, p95 and p99 with an interval, never a mean", async () => {
  const root = await fixtureRoot({
    "crdt/nested/hundred.bench.ts": hundredSamples,
    "budgets.json": JSON.stringify({
      formatVersion: 1,
      tier: "D-modest",
      budgets: [
        {
          scenario: "fixture.hundred",
          metric: "typing",
          stat: "p95",
          budget: 1,
          hardFail: 2,
        },
      ],
    }),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(r).toMatchObject({ scenarios: 1, hardFails: 0 });
  const text = await Bun.file(r.file).text();
  expect(text).not.toContain("mean");
  const result = (await Bun.file(r.file).json()) as ResultFile;
  expect(result.scenarios).toEqual([
    {
      id: "fixture.hundred",
      workload: "W1",
      processes: 1,
      metrics: [
        {
          metric: "typing",
          unit: "ms",
          n: 100,
          p50: 50,
          p95: 95,
          p99: 99,
          intervals: {
            p50: expect.any(Array),
            p95: expect.any(Array),
            p99: expect.any(Array),
          },
          verdict: "no_budget",
        },
      ],
    },
  ]);
  const metric = result.scenarios[0]!.metrics[0]!;
  for (const stat of ["p50", "p95", "p99"] as const) {
    expect(metric.intervals[stat]).toEqual(
      bootstrapInterval(
        Array.from({ length: 100 }, (_, i) => 100 - i),
        Number(stat.slice(1)),
        { rounds: 1000, seed: 4747 },
      ),
    );
  }
});

test("a budget applies only when its tier is the run's", async () => {
  const root = await fixtureRoot({
    "server/hundred.bench.ts": hundredSamples,
    "budgets.json": JSON.stringify({
      formatVersion: 1,
      tier: "host",
      budgets: [
        {
          scenario: "fixture.hundred",
          metric: "typing",
          stat: "max",
          budget: 50,
          hardFail: 90,
        },
      ],
    }),
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  expect(r.hardFails).toBe(1);
  const result = await readResult(r.file);
  expect(result.scenarios[0]!.metrics[0]!.verdict).toBe("hard_fail");
});

test("the filter keeps scenarios whose path contains it", async () => {
  const root = await fixtureRoot({
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

test("a scenario whose process fails stops the suite with its output", async () => {
  const root = await fixtureRoot({
    "client/broken.bench.ts": `
export default {
  id: "fixture.broken",
  workload: null,
  processes: 1,
  async run() {
    throw new Error("the fixture broke");
  },
};
`,
  });
  await expect(
    runSuite({ root, outDir: join(root, "out"), now: fixedNow }),
  ).rejects.toThrow("the fixture broke");
});

function budgetFile(budgets: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ formatVersion: 1, tier: "host", budgets, ...extra });
}

const typingRow = {
  scenario: "fixture.hundred",
  metric: "typing",
  stat: "p95",
  budget: 200,
  hardFail: 300,
};

test("a malformed budget file stops the run and names the file and the row", async () => {
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
      budgetFile([{ ...typingRow, stat: "mean" }], { tier: "D-modest" }),
      'row 1 has stat "mean"',
    ],
  ];
  for (const [text, message] of cases) {
    const root = await fixtureRoot({
      "client/hundred.bench.ts": hundredSamples,
      "budgets.json": text,
    });
    const run = runSuite({ root, outDir: join(root, "out"), now: fixedNow });
    await expect(run).rejects.toThrow(message);
    await expect(run).rejects.toThrow(join(root, "budgets.json"));
  }
});

test("a budget row of the run's tier that matches nothing measured stops the run, unless filtered", async () => {
  const root = await fixtureRoot({
    "client/hundred.bench.ts": hundredSamples,
    "budgets.json": budgetFile([
      typingRow,
      { ...typingRow, metric: "typing.renamed" },
    ]),
  });
  await expect(
    runSuite({ root, outDir: join(root, "out"), now: fixedNow }),
  ).rejects.toThrow(
    "row 2 (fixture.hundred typing.renamed) matches no measured metric",
  );
  const filtered = await runSuite({
    root,
    outDir: join(root, "out"),
    filter: "client/",
    now: fixedNow,
  });
  expect(filtered).toMatchObject({ scenarios: 1, hardFails: 0 });

  const otherTier = await fixtureRoot({
    "client/hundred.bench.ts": hundredSamples,
    "budgets.json": budgetFile([{ ...typingRow, metric: "typing.renamed" }], {
      tier: "D-modest",
    }),
  });
  expect(
    await runSuite({
      root: otherTier,
      outDir: join(otherTier, "out"),
      now: fixedNow,
    }),
  ).toMatchObject({ scenarios: 1, hardFails: 0 });
});

test("a scenario without a workload is recorded with workload null", async () => {
  const root = await fixtureRoot({
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
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  const result = await readResult(r.file);
  expect(result.scenarios[0]).toHaveProperty("workload", null);
});

test("output a scenario leaves without a newline does not hide its result", async () => {
  const root = await fixtureRoot({
    "corpus/chatty.bench.ts": `
export default {
  id: "fixture.chatty",
  workload: null,
  processes: 1,
  async run() {
    await Bun.write(Bun.stdout, "progress without a newline");
    return [{ metric: "size", unit: "bytes", samples: [10] }];
  },
};
`,
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  const result = await readResult(r.file);
  expect(result.scenarios[0]!.metrics[0]).toMatchObject({
    metric: "size",
    n: 1,
  });
});
