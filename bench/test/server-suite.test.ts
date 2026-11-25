import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";
import type { ScenarioResult } from "../result.ts";
import { soakMinutes } from "../server/soak.bench.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-bench-");
afterAll(() => trees.removeAll());

async function quickRun(filter: string): Promise<ScenarioResult[]> {
  const run = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter,
    mode: "quick",
  });
  return (await readResultFile(run.file)).scenarios;
}

function metricNames(scenarios: readonly ScenarioResult[]): unknown[] {
  return scenarios
    .toSorted((x, y) => (x.id < y.id ? -1 : 1))
    .map((s) =>
      s.outcome === "measured"
        ? { id: s.id, metrics: s.metrics.map((m) => m.metric) }
        : { id: s.id, outcome: s.outcome },
    );
}

test("the suite's server scenarios are found and named", async () => {
  const manyRooms = await quickRun("server/many-rooms");
  const presence = await quickRun("server/presence");
  expect(metricNames([...manyRooms, ...presence])).toEqual([
    {
      id: "server.many-rooms",
      metrics: [
        "rss_per_loaded_room_bytes",
        "rss_per_connection_bytes",
        "heap_per_loaded_room_bytes",
        "rooms_after_idle",
      ],
    },
    {
      id: "server.presence",
      metrics: [
        "deliveries_per_second",
        "presence_bytes_per_second",
        "presence_lag_ms",
      ],
    },
  ]);
  const [roomsResult] = manyRooms;
  if (roomsResult?.outcome !== "measured")
    throw new Error("server.many-rooms did not measure");
  const idle = roomsResult.metrics.find((m) => m.metric === "rooms_after_idle");
  expect(idle?.p50).toBe(0);
  expect([
    soakMinutes("quick", undefined),
    soakMinutes("standard", undefined),
    soakMinutes("full", undefined),
    soakMinutes("standard", "110"),
    soakMinutes("quick", "110"),
  ]).toEqual([1, 10, 480, 110, 110]);
  expect(() => soakMinutes("standard", "0")).toThrow(RangeError);
}, 120_000);
