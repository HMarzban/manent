import { expect, mock, test } from "bun:test";
import { join } from "node:path";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { readBudgets } from "../budgets.ts";
import * as driver from "../client/driver.ts";
import type { BenchBrowser, BenchPage } from "../client/driver.ts";
import { NotMeasured } from "../env.ts";
import type { Scenario } from "../harness.ts";

const benchRoot = join(import.meta.dir, "..");

/** What a fake page was asked to open: the format and the document. */
interface Opened {
  format: string;
  doc: DocJSON;
}

/** A page that answers the editor hooks a typing scenario calls, from the document it was asked to open, and records it. */
function fakePage(opened: Opened[]) {
  const blocks = () =>
    blocksOf(opened.at(-1)?.doc ?? { type: "doc" }).map((b) => ({
      id: b.attrs.id,
      type: b.attrs.type,
      section: b.section,
    }));
  const hook = (path: readonly string[], args: readonly unknown[]): unknown => {
    switch (path.join(".")) {
      case "open": {
        const [format, doc] = args;
        if (typeof format !== "string" || typeof doc !== "object")
          throw new TypeError("open needs a format and a document");
        opened.push({ format, doc: Object(doc) });
        return "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
      }
      case "blocks":
        return blocks();
      case "pages":
        return [{ block: 0 }];
      case "keystrokes.stop":
      case "dispatchMs.stop":
        return [1];
      default:
        return null;
    }
  };
  return {
    keyboard: { press: async () => {} },
    // the editor hooks are called with [path, args]; every other evaluate places the caret or waits for a frame
    evaluate: async (_fn: unknown, arg?: unknown) =>
      Array.isArray(arg) && Array.isArray(arg[0])
        ? hook(arg[0].map(String), Array.isArray(arg[1]) ? arg[1] : [])
        : null,
  };
}

const realStart = driver.startBenchDemo;
let fakeOpened: Opened[] | null = null;
let startCalls: { browser?: BenchBrowser; headed?: boolean }[] = [];
mock.module("../client/driver.ts", () => ({
  ...driver,
  startBenchDemo: (options?: {
    dataDir?: string;
    browser?: BenchBrowser;
    headed?: boolean;
  }) => {
    if (fakeOpened === null) return realStart(options);
    startCalls.push({
      ...(options?.browser === undefined ? {} : { browser: options.browser }),
      ...(options?.headed === undefined ? {} : { headed: options.headed }),
    });
    return {
      url: "http://127.0.0.1:1",
      dataDir: "",
      openPage: async ({ userId }: { userId: string }) => ({
        page: fakePage(fakeOpened ?? []),
        cdp: null,
        userId,
        close: async () => {},
      }),
      stop: async () => {},
    };
  },
}));

test("every typing scenario loads the blocks its name promises", async () => {
  const glob = new Bun.Glob("client/typing/typing-*.bench.ts");
  const files = [...glob.scanSync({ cwd: benchRoot })].toSorted();
  const mode = process.env.MANENT_BENCH_MODE;
  process.env.MANENT_BENCH_MODE = "quick";
  const loaded: unknown[] = [];
  try {
    for (const file of files) {
      const opened: Opened[] = [];
      fakeOpened = opened;
      const { default: scenario }: { default: Scenario } = await import(
        join(benchRoot, file)
      );
      const measured = await scenario.run();
      const input = measured.find((m) => m.metric === "input_blocks");
      const [doc] = opened;
      loaded.push([
        scenario.id,
        doc?.format,
        input?.samples,
        doc === undefined ? null : blocksOf(doc.doc).length,
        doc?.doc.content?.length,
      ]);
    }
  } finally {
    fakeOpened = null;
    if (mode === undefined) delete process.env.MANENT_BENCH_MODE;
    else process.env.MANENT_BENCH_MODE = mode;
  }
  // [id, format opened, input_blocks, blocks opened, sections opened]: documentOfPages's counts at seed 1
  expect(loaded).toEqual([
    ["typing-1000", "screenplay", [16_051], 16_051, 161],
    ["typing-120", "screenplay", [1916], 1916, 20],
    ["typing-2000", "screenplay", [32_199], 32_199, 322],
    ["typing-30", "screenplay", [456], 456, 5],
    ["typing-300", "screenplay", [4773], 4773, 48],
    ["typing-book-1000", "manuscript", [4957], 4957, 50],
    ["typing-book-2000", "manuscript", [9837], 9837, 99],
    ["typing-boundary-2000", "screenplay", [32_199], 32_199, 322],
    ["typing-flat-1000", "screenplay", [16_051], 16_051, 1],
  ]);
}, 600_000);

test("proof mode slows the page's own keystroke", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      join(benchRoot, "run.ts"),
      "--child",
      join(benchRoot, "client/typing/typing-30.bench.ts"),
    ],
    {
      env: {
        ...process.env,
        MANENT_BENCH_MODE: "quick",
        MANENT_BENCH_PROVE_MS: "200",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  const measured: unknown = JSON.parse(stdout.trimEnd().split("\n").at(-1)!);
  const paint = (Array.isArray(measured) ? measured : []).find(
    (m: unknown) => Reflect.get(Object(m), "metric") === "keystroke_paint",
  );
  const samples: unknown = Reflect.get(Object(paint), "samples");
  const all = Array.isArray(samples) ? samples.map(Number) : [];
  expect([all.length, all.filter((ms) => !(ms >= 200))]).toEqual([3, []]);
}, 120_000);

test("browser and spellcheck scenarios export expected metadata, pass driver options, and hold no budgets", async () => {
  const glob = new Bun.Glob("client/browsers/*.bench.ts");
  const files = [...glob.scanSync({ cwd: benchRoot })].toSorted();
  const mode = process.env.MANENT_BENCH_MODE;
  process.env.MANENT_BENCH_MODE = "quick";
  const found: unknown[] = [];
  startCalls = [];
  try {
    for (const file of files) {
      const opened: Opened[] = [];
      fakeOpened = opened;
      const { default: scenario }: { default: Scenario } = await import(
        join(benchRoot, file)
      );
      const measured = await scenario.run();
      found.push([
        scenario.id,
        scenario.workload,
        scenario.processes,
        measured.some((m) => m.metric === "keystroke_paint"),
      ]);
    }
  } finally {
    fakeOpened = null;
    if (mode === undefined) delete process.env.MANENT_BENCH_MODE;
    else process.env.MANENT_BENCH_MODE = mode;
  }
  expect(found).toEqual([
    ["typing-1000-spellcheck", null, 5, true],
    ["typing-120-firefox", "W1", 5, true],
    ["typing-120-spellcheck", "W1", 5, true],
    ["typing-120-webkit", "W1", 5, true],
  ]);
  expect(startCalls).toEqual([
    { browser: "chromium", headed: true },
    { browser: "firefox" },
    { browser: "chromium", headed: true },
    { browser: "webkit" },
  ]);
  const ids = new Set([
    "typing-120-firefox",
    "typing-120-webkit",
    "typing-120-spellcheck",
    "typing-1000-spellcheck",
  ]);
  const { budgets } = await readBudgets(benchRoot, "D-modest");
  expect(budgets.filter((b) => ids.has(b.scenario))).toEqual([]);
}, 120_000);

test("missing display, missing browser, and null CDP are reported cleanly", async () => {
  expect(() => driver.checkHeadedDisplay(true, "linux", {})).toThrow(
    NotMeasured,
  );
  expect(() => driver.checkHeadedDisplay(true, "linux", {})).toThrow(
    "no display for a headed browser",
  );
  expect(() =>
    driver.checkHeadedDisplay(true, "linux", { DISPLAY: ":99" }),
  ).not.toThrow();
  expect(() =>
    driver.checkHeadedDisplay(true, "linux", { WAYLAND_DISPLAY: "wayland-0" }),
  ).not.toThrow();
  expect(() => driver.checkHeadedDisplay(true, "darwin", {})).not.toThrow();
  expect(() => driver.checkHeadedDisplay(false, "linux", {})).not.toThrow();

  const missingFf = driver.translateLaunchError(
    "firefox",
    false,
    new Error("browserType.launch: Executable doesn't exist at /cache/firefox"),
  );
  expect(missingFf).toBeInstanceOf(NotMeasured);
  expect(missingFf?.message).toBe(
    "firefox is not installed: run bun x playwright install firefox",
  );

  const missingDisplay = driver.translateLaunchError(
    "chromium",
    true,
    new Error("Missing X server or $DISPLAY"),
  );
  expect(missingDisplay).toBeInstanceOf(NotMeasured);
  expect(missingDisplay?.message).toBe("no display for a headed browser");

  expect(
    driver.translateLaunchError("chromium", false, new Error("other error")),
  ).toBeNull();

  const noCdp: BenchPage = {
    page: {} as BenchPage["page"],
    cdp: null,
    userId: "you",
    close: async () => {},
  };
  await expect(driver.heapBytes(noCdp)).rejects.toThrow(
    "heapBytes requires a Chromium CDP session",
  );
  await expect(driver.domNodes(noCdp)).rejects.toThrow(
    "domNodes requires a Chromium CDP session",
  );
});
