import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { TRACE_SOURCES } from "../corpus/traces.ts";
import type { Trace } from "../corpus/traces.ts";
import automergeScenario, {
  replayInAutomerge,
} from "../crdt/alternatives/automerge.bench.ts";
import loroScenario, { replayInLoro } from "../crdt/alternatives/loro.bench.ts";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-alternatives-");
afterAll(() => trees.removeAll());

const SYNTHETIC_TRACE: Trace = {
  name: "synthetic-alt",
  startContent: "Hello world",
  endContent: "Hi\nthere\n\nfriend!",
  patches: [
    [1, 4, "i"], // "Hi world"
    [2, 1, "\n"], // "Hi\nworld"
    [3, 5, "there\n\nfriend"], // "Hi\nthere\n\nfriend"
    [16, 0, "!"], // "Hi\nthere\n\nfriend!"
    [0, 17, "Alpha\nBeta\nGamma"], // multi-line replace
    [5, 6, " "], // join across newline -> "Alpha Gamma"
    [0, 11, "Hi\nthere\n\nfriend!"],
  ],
};

test("Loro and Automerge replay plain-text traces into line lists matching endContent", () => {
  const loro = replayInLoro(SYNTHETIC_TRACE);
  const automerge = replayInAutomerge(SYNTHETIC_TRACE);
  const expectedPlainBytes = new TextEncoder().encode(
    "Hitherefriend!",
  ).byteLength;

  expect([
    loro.text,
    loro.plainBytes,
    loro.liveBytes > 0,
    automerge.text,
    automerge.plainBytes,
    automerge.liveBytes > 0,
  ]).toEqual([
    SYNTHETIC_TRACE.endContent,
    expectedPlainBytes,
    true,
    SYNTHETIC_TRACE.endContent,
    expectedPlainBytes,
    true,
  ]);
});

test("crdt.loro and crdt.automerge export expected metadata and report not_measured when traces are absent", async () => {
  expect([
    [loroScenario.id, loroScenario.workload, loroScenario.processes],
    [
      automergeScenario.id,
      automergeScenario.workload,
      automergeScenario.processes,
    ],
  ]).toEqual([
    ["crdt.loro", null, 5],
    ["crdt.automerge", null, 5],
  ]);

  const anyFetched = TRACE_SOURCES.some(({ name }) =>
    existsSync(join(repoRoot, "bench/corpus/traces", `${name}.json.gz`)),
  );
  const run = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "crdt/alternatives",
    mode: "quick",
  });
  const scenarios = (await readResultFile(run.file)).scenarios.toSorted(
    (a, b) => (a.id < b.id ? -1 : 1),
  );
  expect(scenarios.length).toBe(2);
  if (!anyFetched) {
    expect(
      scenarios.map((s) => ({
        id: s.id,
        outcome: s.outcome,
        reason: s.outcome === "not_measured" ? s.reason : null,
      })),
    ).toEqual([
      {
        id: "crdt.automerge",
        outcome: "not_measured",
        reason:
          "the editing traces are not fetched: run bun run bench fetch-traces",
      },
      {
        id: "crdt.loro",
        outcome: "not_measured",
        reason:
          "the editing traces are not fetched: run bun run bench fetch-traces",
      },
    ]);
  } else {
    expect(scenarios.map((s) => s.outcome)).toEqual(["measured", "measured"]);
  }
});
