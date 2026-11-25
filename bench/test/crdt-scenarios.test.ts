import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { TRACE_SOURCES } from "../corpus/traces.ts";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";
import type { ScenarioResult } from "../result.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

/** The sorted ids of the default exports of `dir`'s scenario files. */
async function scenarioIds(dir: string): Promise<string[]> {
  const ids: string[] = [];
  for await (const file of new Bun.Glob("**/*.bench.ts").scan({
    cwd: dir,
    absolute: true,
  })) {
    const { default: exported }: { default?: unknown } = await import(file);
    if (
      typeof exported !== "object" ||
      exported === null ||
      !("id" in exported) ||
      typeof exported.id !== "string"
    )
      throw new Error(`${file} exports no scenario id`);
    ids.push(exported.id);
  }
  return ids.toSorted();
}

/** What a quick run of the scenario files whose path holds `filter` recorded of each. */
async function quickRun(filter: string): Promise<ScenarioResult[]> {
  const run = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter,
    mode: "quick",
  });
  return (await readResultFile(run.file)).scenarios;
}

/** Each scenario's outcome and, once measured, its metrics' names and sample counts, by id. */
function readOut(scenarios: readonly ScenarioResult[]): unknown[] {
  const byId = scenarios.toSorted((x, y) => (x.id < y.id ? -1 : 1));
  return byId.map((s) =>
    s.outcome === "measured"
      ? {
          id: s.id,
          metrics: s.metrics.map((m) => [m.metric, m.samples]),
        }
      : s.outcome === "not_measured"
        ? { id: s.id, reason: s.reason }
        : { id: s.id, outcome: s.outcome },
  );
}

/** The p50 of `metric` among `scenarios`; null when none measured it. */
function p50(
  scenarios: readonly ScenarioResult[],
  metric: string,
): number | null {
  const found = scenarios
    .flatMap((s) => (s.outcome === "measured" ? s.metrics : []))
    .find((m) => m.metric === metric);
  return found?.p50 ?? null;
}

/** The fetched traces' metrics, or why the scenario measured nothing when none is fetched. */
function tracesExpected(): unknown {
  const fetched = TRACE_SOURCES.filter(({ name }) =>
    existsSync(join(repoRoot, "bench/corpus/traces", `${name}.json.gz`)),
  ).map(({ name }) => name.replaceAll("-", "_"));
  if (fetched.length === 0)
    return {
      id: "crdt.traces",
      reason:
        "the editing traces are not fetched: run bun run bench fetch-traces",
    };
  return {
    id: "crdt.traces",
    metrics: fetched.flatMap((t) => [
      [`replay_ms_${t}`, 1],
      [`bytes_ratio_${t}`, 1],
      [`transactions_${t}`, 1],
    ]),
  };
}

// a cold corpus cache builds the 400-session script first, which takes minutes
test("the crdt scenarios are found and measure what the report reads", async () => {
  const ids = await scenarioIds(join(repoRoot, "bench/crdt"));
  expect(ids.filter((id) => !id.startsWith("crdt.rebuild"))).toEqual([
    "crdt.aged",
    "crdt.aged-time",
    "crdt.daily-reuse",
    "crdt.daily-reuse-time",
    "crdt.traces",
  ]);
  const aged = await quickRun("crdt/aged-");
  const daily = await quickRun("crdt/daily-reuse");
  const traces = await quickRun("crdt/traces");
  expect(readOut([...aged, ...daily, ...traces])).toEqual([
    {
      id: "crdt.aged",
      metrics: [
        ["bytes_ratio_400", 1],
        ["client_ids_400", 1],
        ["state_vector_bytes_400", 1],
      ],
    },
    {
      id: "crdt.aged-time",
      metrics: [
        ["load_ms_400", 3],
        ["transaction_ms_400", 3],
      ],
    },
    {
      id: "crdt.daily-reuse",
      metrics: [
        ["bytes_ratio_reused", 1],
        ["bytes_ratio_fresh", 3],
        ["client_ids_reused", 1],
      ],
    },
    {
      id: "crdt.daily-reuse-time",
      metrics: [
        ["load_ms_reused", 3],
        ["load_ms_fresh", 3],
      ],
    },
    tracesExpected(),
  ]);
  // the generator's client id and one for each session; on the reused document, one more each day
  expect([
    p50(aged, "client_ids_400"),
    p50(daily, "client_ids_reused"),
  ]).toEqual([401, 1 + 60 * 12 + 60]);
}, 1_800_000);
