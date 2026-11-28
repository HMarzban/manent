import { afterAll, expect, test } from "bun:test";
import { availableParallelism, cpus, totalmem } from "node:os";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import fc from "fast-check";
import { isRecord } from "../budgets.ts";
import { runSuite } from "../harness.ts";
import { runEnvironment } from "../env.ts";
import { readResultFile, writeResultFile } from "../result.ts";
import type { ResultFile } from "../result.ts";

const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

const fixedNow = () => 1_794_909_600_000; // 2026-11-17T10:00:00Z

function git(...args: string[]): string {
  return Bun.spawnSync(["git", ...args], { cwd: import.meta.dir })
    .stdout.toString()
    .trim();
}

test("the result file records the environment and every raw sample, and never a CPU model", async () => {
  const root = await trees.tree({
    "client/a.bench.ts": `
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
export default {
  id: "a",
  workload: null,
  processes: 2,
  async run() {
    appendFileSync(join(import.meta.dir, "n.log"), "x");
    const n = readFileSync(join(import.meta.dir, "n.log"), "utf8").length;
    return [{ metric: "t", unit: "ms", samples: n === 1 ? [1, 2, 3] : [4, 5] }];
  },
};
`,
  });
  const r = await runSuite({
    root,
    outDir: join(root, "out"),
    now: fixedNow,
    tier: "host",
    throttle: 1,
  });
  const file = await readResultFile(r.file);
  expect(file.environment).toEqual({
    tier: "host",
    throttle: 1,
    mode: "standard",
    prove: false,
    bun: Bun.version,
    platform: process.platform,
    arch: process.arch,
    cpus: availableParallelism(),
    memoryBytes: totalmem(),
    limits: { cpus: null, memoryBytes: null },
    chromium: null,
    commit: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain") !== "",
    corpusVersion: 1,
    command: expect.any(String),
  });
  const written: unknown = JSON.parse(await Bun.file(r.file).text());
  const environment =
    isRecord(written) && isRecord(written.environment)
      ? written.environment
      : {};
  expect(Object.keys(environment)).toEqual([
    "tier",
    "throttle",
    "mode",
    "prove",
    "bun",
    "platform",
    "arch",
    "cpus",
    "memoryBytes",
    "limits",
    "chromium",
    "commit",
    "dirty",
    "corpusVersion",
    "command",
  ]);
  expect(file.scenarios[0]).toMatchObject({
    outcome: "measured",
    metrics: [
      {
        metric: "t",
        raw: [
          [1, 2, 3],
          [4, 5],
        ],
        processP50: [2, 4],
      },
    ],
  });
  const model = cpus()[0]?.model ?? "";
  expect(model).not.toBe("");
  expect(await Bun.file(r.file).text()).not.toContain(model);
});

test("a result file from before tiers is refused with what to do", async () => {
  const root = await trees.tree({
    "old.json": JSON.stringify({ formatVersion: 1, scenarios: [] }),
  });
  const path = join(root, "old.json");
  await expect(readResultFile(path)).rejects.toThrow(
    `${path}: formatVersion 1 is from before tiers; run it again`,
  );
});

const QUIET = { load: 0.5, spread: 1.1 };

/** A file holding every outcome, every nullable field both null and filled. */
const EVERY_OUTCOME: ResultFile = {
  formatVersion: 2,
  startedAt: 1_794_909_600_000,
  finishedAt: 1_794_909_660_000,
  environment: {
    tier: "D-modest",
    throttle: 4,
    mode: "full",
    prove: false,
    bun: "1.4.4",
    platform: "linux",
    arch: "x64",
    cpus: 2,
    memoryBytes: 4_294_967_296,
    limits: { cpus: 2, memoryBytes: null },
    chromium: "141.0.7390.37",
    commit: "0123456789abcdef0123456789abcdef01234567",
    dirty: true,
    corpusVersion: 1,
    command: "bun bench/run.ts --full",
  },
  scenarios: [
    {
      id: "typing-120",
      area: "client",
      workload: "W1",
      processes: 5,
      outcome: "measured",
      metrics: [
        {
          metric: "keystroke_paint",
          unit: "ms",
          samples: 4,
          p50: 2,
          p95: 4,
          p99: 4,
          max: 4,
          intervals: { p50: [1, 3], p95: [3, 4], p99: [3, 4] },
          processP50: [1, 3],
          warmup: 40,
          verdict: "inconclusive",
          verdictReason: "too_few_samples",
          judgedStat: "p95",
          raw: [
            [1, 2],
            [3, 4],
          ],
        },
        {
          metric: "pages",
          unit: "count",
          samples: 1,
          p50: 120,
          p95: 120,
          p99: 120,
          max: 120,
          intervals: { p50: [120, 120], p95: [120, 120], p99: [120, 120] },
          processP50: [120, 120],
          warmup: 0,
          verdict: "no_budget",
          verdictReason: null,
          judgedStat: null,
          raw: [[120]],
        },
      ],
      quiet: QUIET,
      elapsedMs: 61_000,
    },
    {
      id: "crdt.rebuild-size",
      area: "crdt",
      workload: null,
      processes: 1,
      outcome: "measured",
      metrics: [],
      quiet: null,
      elapsedMs: 0,
    },
    {
      id: "server.fanout",
      area: "server",
      workload: null,
      processes: 5,
      outcome: "failed",
      exitCode: 3,
      output: "the room closed",
    },
    {
      id: "crdt.traces",
      area: "crdt",
      workload: null,
      processes: 1,
      outcome: "not_measured",
      reason: "traces not fetched",
    },
    {
      id: "open-120",
      area: "client",
      workload: "W1",
      processes: 5,
      outcome: "void",
      reason: "busy_machine",
      quiet: { load: 9, spread: 1 },
    },
  ],
  unmatched: [{ scenario: "ghost", metric: "m" }],
  unproved: [{ scenario: "bad", metric: "t" }],
};

test("every outcome reads back as it was written", async () => {
  const root = await trees.tree({ "r.json": JSON.stringify(EVERY_OUTCOME) });
  expect(await readResultFile(join(root, "r.json"))).toEqual(EVERY_OUTCOME);
});

/** Every path into `value`, as keys and indexes from the top. */
function pathsOf(value: unknown): (string | number)[][] {
  if (typeof value !== "object" || value === null) return [];
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value);
  return entries.flatMap(([key, v]) => [
    [key],
    ...pathsOf(v).map((rest) => [key, ...rest]),
  ]);
}

/** A copy of `value` whose value at `path` is replaced by one of another kind, or removed. */
function broken(
  value: unknown,
  path: readonly (string | number)[],
  remove: boolean,
): unknown {
  const copy: unknown = structuredClone(value);
  let parent: unknown = copy;
  for (const key of path.slice(0, -1))
    parent = (parent as Record<string | number, unknown>)[key];
  const holder = parent as Record<string | number, unknown>;
  const last = path.at(-1)!;
  const was = holder[last];
  if (remove && !Array.isArray(holder)) delete holder[last];
  else if (typeof was === "string") holder[last] = 7;
  else if (was === null) holder[last] = {};
  else if (typeof was === "object") holder[last] = "x";
  else holder[last] = typeof was === "number" ? "x" : null;
  return copy;
}

test("a result file with any one field broken is refused, naming the file", async () => {
  const root = await trees.tree({});
  const paths = pathsOf(EVERY_OUTCOME);
  let n = 0;
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...paths),
      fc.boolean(),
      async (path, remove) => {
        n += 1;
        const file = join(root, `${n}.json`);
        await Bun.write(
          file,
          JSON.stringify(broken(EVERY_OUTCOME, path, remove)),
        );
        const read = await readResultFile(file).then(
          () => "read",
          (error: unknown) => (error instanceof Error ? error.message : ""),
        );
        expect(read.startsWith(file)).toBe(true);
      },
    ),
    { numRuns: 300 },
  );
}, 30_000);

test("any JSON is either a result file or refused, naming the file", async () => {
  const root = await trees.tree({});
  let n = 0;
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), async (value) => {
      n += 1;
      const file = join(root, `${n}.json`);
      await Bun.write(file, JSON.stringify(value));
      const read = await readResultFile(file).then(
        () => file,
        (error: unknown) => (error instanceof Error ? error.message : ""),
      );
      expect(read.startsWith(file)).toBe(true);
    }),
    { numRuns: 200 },
  );
}, 30_000);

test("two result files that start in the same second are both kept", async () => {
  const outDir = join(await trees.tree({}), "out");
  const second = { ...EVERY_OUTCOME, startedAt: 1_794_909_600_400 };
  expect([
    await writeResultFile(outDir, EVERY_OUTCOME),
    await writeResultFile(outDir, second),
    await writeResultFile(outDir, EVERY_OUTCOME),
  ]).toEqual([
    join(outDir, "2026-11-17T10-00-00Z.json"),
    join(outDir, "2026-11-17T10-00-00Z-2.json"),
    join(outDir, "2026-11-17T10-00-00Z-3.json"),
  ]);
  expect(
    await readResultFile(join(outDir, "2026-11-17T10-00-00Z-2.json")),
  ).toEqual(second);
});

test("a tier's container records the limits it sees, the host's command and the commit its image was built from", () => {
  const run = {
    tier: "D-small",
    throttle: 1,
    mode: "quick",
    prove: false,
    corpusVersion: 1,
  } as const;
  const limits = { cpus: 1, memoryBytes: 1_073_741_824 };
  const was = { ...process.env };
  try {
    process.env.MANENT_BENCH_COMMIT = "0123abcd";
    process.env.MANENT_BENCH_DIRTY = "true";
    expect(
      runEnvironment(run, {
        limits,
        command: "bun bench/run.ts --tier D-small",
      }),
    ).toMatchObject({
      limits,
      commit: "0123abcd",
      dirty: true,
      command: "bun bench/run.ts --tier D-small",
    });
    process.env.MANENT_BENCH_DIRTY = "false";
    expect(runEnvironment(run, null)).toMatchObject({
      limits: { cpus: null, memoryBytes: null },
      commit: "0123abcd",
      dirty: false,
    });
  } finally {
    process.env = was;
  }
  expect(runEnvironment(run, null).commit).toBe(git("rev-parse", "HEAD"));
});
