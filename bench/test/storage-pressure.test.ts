import { afterAll, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import * as driver from "../client/driver.ts";
import type { BenchDemo, BenchPage } from "../client/driver.ts";
import {
  countChangesLost,
  makeTypedText,
  readOriginUsage,
  requireCdp,
  setOriginQuota,
} from "../client/storage-pressure/shared.ts";
import { NotMeasured } from "../env.ts";
import { runSuite } from "../harness.ts";
import { readResultFile } from "../result.ts";

const benchRoot = join(import.meta.dir, "..");
const trees = createTempTrees("manent-storage-pressure-");
afterAll(() => trees.removeAll());

let mockStart: (() => Promise<BenchDemo>) | null = null;
const realStart = driver.startBenchDemo;

mock.module("../client/driver.ts", () => ({
  ...driver,
  startBenchDemo: (options?: { dataDir?: string }) =>
    mockStart === null ? realStart(options) : mockStart(),
}));

const quotaScenario = (
  await import("../client/storage-pressure/quota-120.bench.ts")
).default;
const unpersistedScenario = (
  await import("../client/storage-pressure/unpersisted-120.bench.ts")
).default;

test("storage pressure scenarios declare their expected ids, workload, and process counts", () => {
  expect([
    [quotaScenario.id, quotaScenario.workload, quotaScenario.processes],
    [
      unpersistedScenario.id,
      unpersistedScenario.workload,
      unpersistedScenario.processes,
    ],
  ]).toEqual([
    ["storage-quota-120", "W1", 1],
    ["storage-unpersisted-120", "W1", 1],
  ]);
});

test("countChangesLost counts missing typed characters accurately", () => {
  const typed = makeTypedText(10);
  expect(typed.length).toBe(10);
  expect(countChangesLost("INT. ROOM", typed, `INT. ROOM${typed}`)).toBe(0);
  expect(
    countChangesLost("INT. ROOM", typed, `INT. ROOM${typed.slice(0, 6)}`),
  ).toBe(4);
  expect(countChangesLost("INT. ROOM", typed, "INT. ROOM")).toBe(10);
  expect(countChangesLost("INT. ROOM", "", "INT. ROOM")).toBe(0);
});

test("requireCdp and CDP storage helpers throw NotMeasured when CDP is absent or refuses", async () => {
  const noCdpPage = {
    page: {} as BenchPage["page"],
    cdp: null as unknown as BenchPage["cdp"],
    userId: "dana",
    close: async () => {},
  };
  let thrown: unknown = null;
  try {
    requireCdp(noCdpPage);
  } catch (cause) {
    thrown = cause;
  }
  expect(thrown).toBeInstanceOf(NotMeasured);
  expect(thrown instanceof NotMeasured ? thrown.code : null).toBe(
    "not_measured",
  );

  const refusingCdp = {
    send: async () => {
      throw new Error("Protocol error: Storage domain not supported");
    },
  } as unknown as NonNullable<BenchPage["cdp"]>;

  await expect(
    readOriginUsage(refusingCdp, "http://127.0.0.1:1234"),
  ).rejects.toBeInstanceOf(NotMeasured);
  await expect(
    setOriginQuota(refusingCdp, "http://127.0.0.1:1234", 65_536),
  ).rejects.toBeInstanceOf(NotMeasured);
});

test("both scenarios throw NotMeasured when Chromium is missing or CDP is null, and stop the demo", async () => {
  try {
    // 1. Missing Chromium binary at launch
    mockStart = async () => {
      throw new Error(
        "browserType.launch: Executable doesn't exist at /nonexistent/chrome",
      );
    };
    await expect(quotaScenario.run()).rejects.toBeInstanceOf(NotMeasured);
    await expect(unpersistedScenario.run()).rejects.toBeInstanceOf(NotMeasured);

    // 2. Non-Chromium page with null CDP still cleans up demo.stop()
    let stopped = 0;
    mockStart = async () => ({
      url: "http://127.0.0.1:51234",
      dataDir: "",
      openPage: async ({ userId }) => ({
        page: {} as BenchPage["page"],
        cdp: null as unknown as BenchPage["cdp"],
        userId,
        close: async () => {},
      }),
      token: async () => "",
      whileStopped: async () => {},
      share: async () => {},
      stop: async () => {
        stopped += 1;
      },
    });
    await expect(quotaScenario.run()).rejects.toBeInstanceOf(NotMeasured);
    await expect(unpersistedScenario.run()).rejects.toBeInstanceOf(NotMeasured);
    expect(stopped).toBe(2);
  } finally {
    mockStart = null;
  }
});

test("runSuite discovers both storage-pressure scenarios and records not_measured when prerequisites are absent", async () => {
  const run = await runSuite({
    root: benchRoot,
    outDir: await trees.tree({}),
    filter: "client/storage-pressure",
    mode: "quick",
    cannotRun: "Chromium with CDP is unavailable",
  });
  expect(run.scenarios).toBe(2);
  expect(run.notMeasured).toBe(2);
  expect(run.failed).toBe(0);
  const result = await readResultFile(run.file);
  expect(
    result.scenarios.map((s) => [
      s.id,
      s.area,
      s.workload,
      s.outcome,
      s.outcome === "not_measured" ? s.reason : null,
    ]),
  ).toEqual([
    [
      "storage-quota-120",
      "client",
      "W1",
      "not_measured",
      "Chromium with CDP is unavailable",
    ],
    [
      "storage-unpersisted-120",
      "client",
      "W1",
      "not_measured",
      "Chromium with CDP is unavailable",
    ],
  ]);
});
