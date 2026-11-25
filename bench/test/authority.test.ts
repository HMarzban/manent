import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { TRACE_SOURCES } from "../corpus/traces.ts";
import type { Trace } from "../corpus/traces.ts";
import authorityScenario from "../crdt/authority/authority.bench.ts";
import {
  measureOfflineDivergence,
  plainTextOf,
  replayThroughAuthority,
} from "../crdt/authority/replay.ts";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";

const repoRoot = join(import.meta.dir, "../..");
const trees = createTempTrees("manent-authority-");
afterAll(() => trees.removeAll());

test("replayThroughAuthority converges client A and client B to exact endContent with JSON step log", () => {
  const trace: Trace = {
    name: "synthetic-lines",
    startContent: "Hello world",
    endContent: "Hi\nthere\n\nfriend!",
    patches: [
      [1, 4, "i"], // "Hi world"
      [2, 1, "\n"], // "Hi\nworld"
      [3, 5, "there\n\nfriend"], // "Hi\nthere\n\nfriend"
      [16, 0, "!"], // "Hi\nthere\n\nfriend!"
      [0, 17, "Alpha\nBeta\nGamma"], // full multi-line replace
      [5, 6, " "], // join lines: "Alpha Gamma"
      [0, 11, "Hi\nthere\n\nfriend!"],
    ],
  };

  const result = replayThroughAuthority(trace);
  const expectedBytes = Buffer.byteLength(
    JSON.stringify(result.authority.steps.map((s) => s.toJSON())),
  );
  expect([
    plainTextOf(result.clientA.doc),
    plainTextOf(result.clientB.doc),
    result.authority.version,
    result.authority.steps.length > 0,
    result.logBytes,
  ]).toEqual([
    trace.endContent,
    trace.endContent,
    result.authority.steps.length,
    true,
    expectedBytes,
  ]);
});

test("measureOfflineDivergence rebases client B unconfirmed steps and counts dropped steps on overlap", () => {
  // First half builds two lines; second half edits inside text that is then deleted so rebaseSteps drops steps.
  const trace: Trace = {
    name: "synthetic-diverge",
    startContent: "Line one text",
    endContent: "L!",
    patches: [
      [13, 0, "\nSecond line"], // midpoint is after 3 patches: "Line one text\nSecond line"
      [0, 0, ""],
      [0, 0, ""],
      [6, 2, "NE"], // inner edit inside [1..25]
      [1, 24, "!"], // outer delete swallowing [6..8]
      [2, 0, ""],
    ],
  };

  const divergence = measureOfflineDivergence(trace);
  expect([
    divergence.unconfirmedBefore > 0,
    divergence.dropped > 0,
    divergence.dropped <= divergence.unconfirmedBefore,
    divergence.unconfirmedBefore - divergence.unconfirmedAfter,
  ]).toEqual([true, true, true, divergence.dropped]);
});

test("crdt.authority exports expected scenario metadata and reports not_measured when traces are absent", async () => {
  expect([
    authorityScenario.id,
    authorityScenario.workload,
    authorityScenario.processes,
  ]).toEqual(["crdt.authority", null, 5]);

  const anyFetched = TRACE_SOURCES.some(({ name }) =>
    existsSync(join(repoRoot, "bench/corpus/traces", `${name}.json.gz`)),
  );
  const run = await runSuite({
    root: join(repoRoot, "bench"),
    outDir: await trees.tree({}),
    filter: "crdt/authority",
    mode: "quick",
  });
  const result = (await readResultFile(run.file)).scenarios;
  expect(result.length).toBe(1);
  const first = result[0]!;
  if (!anyFetched) {
    expect(first).toMatchObject({
      id: "crdt.authority",
      outcome: "not_measured",
      reason:
        "the editing traces are not fetched: run bun run bench fetch-traces",
    });
  } else {
    expect(first.outcome).toBe("measured");
  }
});
