import { afterAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { UNITS, runSuite } from "../harness.ts";
import type { ResultFile } from "../harness.ts";
import { bootstrapInterval } from "../stats.ts";

const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

const fixedNow = () => 1_794_909_600_000; // 2026-11-17T10:00:00Z

async function readResult(file: string): Promise<ResultFile> {
  const parsed: unknown = await Bun.file(file).json();
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("formatVersion" in parsed) ||
    parsed.formatVersion !== 1
  )
    throw new Error(`${file} is not a result file of format 1`);
  return parsed as ResultFile;
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
  });
  const result: ResultFile = await readResult(r.file);
  expect(result).toEqual({
    formatVersion: 1,
    startedAt: 1_794_909_600_000,
    tier: "host",
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    scenarios: [],
  });
});

test("a scenario runs in as many fresh processes as it asks for", async () => {
  const root = await trees.tree({
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
  expect(metric.samples).toBe(3);
  expect(pids).toContain(metric.p50);
  expect(metric.p99).toBe(Math.max(...pids));
});

test("samples are summarised as p50, p95 and p99 with an interval, never a mean", async () => {
  const root = await trees.tree({
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
  const result = await readResult(r.file);
  expect(result.scenarios).toEqual([
    {
      id: "fixture.hundred",
      workload: "W1",
      processes: 1,
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

test("a metric's summary names its sample count and its largest sample", async () => {
  const root = await trees.tree({
    "corpus/ten.bench.ts": `
export default {
  id: "fixture.ten",
  workload: null,
  processes: 1,
  async run() {
    return [{ metric: "t", unit: "ms", samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }];
  },
};
`,
  });
  const r = await runSuite({ root, outDir: join(root, "out"), now: fixedNow });
  const result = await readResult(r.file);
  expect(result.scenarios[0]!.metrics).toEqual([
    {
      metric: "t",
      unit: "ms",
      samples: 10,
      p50: 5,
      p95: 10,
      p99: 10,
      max: 10,
      intervals: { p50: [2, 8], p95: [7, 10], p99: [7, 10] },
      verdict: "no_budget",
    },
  ]);
});

test("a budget applies only when its tier is the run's", async () => {
  const root = await trees.tree({
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

test("a scenario whose process fails stops the suite with its output", async () => {
  const root = await trees.tree({
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
    const root = await trees.tree({
      "client/hundred.bench.ts": hundredSamples,
      "budgets.json": text,
    });
    const run = runSuite({ root, outDir: join(root, "out"), now: fixedNow });
    await expect(run).rejects.toThrow(message);
    await expect(run).rejects.toThrow(join(root, "budgets.json"));
  }
});

test("a budget row of the run's tier that matches nothing measured stops the run, unless filtered", async () => {
  const root = await trees.tree({
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

  const otherTier = await trees.tree({
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
    samples: 1,
  });
});

test("a measurement's unit is one of these", () => {
  expect(UNITS).toEqual(["ms", "bytes", "count", "percent"]);
});
