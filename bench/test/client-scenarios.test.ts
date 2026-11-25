import { expect, test } from "bun:test";
import { join } from "node:path";
import { readBudgets } from "../budgets.ts";
import { documentOfPages } from "../corpus/documents.ts";

const benchRoot = join(import.meta.dir, "..");

const IDS = [
  "open-120",
  "open-300",
  "open-2000",
  "scroll-120",
  "scroll-2000",
  "repaginate-120",
  "repaginate-2000",
  "select-all-2000",
  "saved-web-120",
  "interface",
  "interface-2000",
  "export.pdf-120",
] as const;
type Id = (typeof IDS)[number];
const isId = (scenario: string): scenario is Id =>
  IDS.some((id) => id === scenario);

/** Each scenario's file, the pages its script holds, and the metrics it reports, in order; every one also reports input_blocks. */
const SCENARIOS: Readonly<
  Record<Id, { file: string; pages: number | null; metrics: readonly string[] }>
> = {
  "open-120": {
    file: "client/open/open-120.bench.ts",
    pages: 120,
    metrics: [
      "first_editable_cold",
      "first_editable_warm",
      "first_editable_offline",
      "heap_bytes",
      "dom_nodes",
    ],
  },
  "open-300": {
    file: "client/open/open-300.bench.ts",
    pages: 300,
    metrics: [
      "first_editable_cold",
      "first_editable_warm",
      "first_editable_offline",
      "heap_bytes",
      "dom_nodes",
    ],
  },
  "open-2000": {
    file: "client/open/open-2000.bench.ts",
    pages: 2000,
    metrics: [
      "first_editable_cold",
      "first_editable_warm",
      "first_editable_offline",
      "heap_bytes",
      "dom_nodes",
    ],
  },
  "scroll-120": {
    file: "client/scroll/scroll-120.bench.ts",
    pages: 120,
    metrics: ["frame_ms", "frames_over_50"],
  },
  "scroll-2000": {
    file: "client/scroll/scroll-2000.bench.ts",
    pages: 2000,
    metrics: ["frame_ms", "frames_over_50"],
  },
  "repaginate-120": {
    file: "client/repaginate/repaginate-120.bench.ts",
    pages: 120,
    metrics: ["breaks_frame_ms", "incremental_ms"],
  },
  "repaginate-2000": {
    file: "client/repaginate/repaginate-2000.bench.ts",
    pages: 2000,
    metrics: ["breaks_frame_ms", "incremental_ms"],
  },
  "select-all-2000": {
    file: "client/select-all/select-all-2000.bench.ts",
    pages: 2000,
    metrics: ["select_frame_ms", "collapse_frame_ms"],
  },
  "saved-web-120": {
    file: "client/saved/saved-web-120.bench.ts",
    pages: 120,
    metrics: ["keystroke_saved"],
  },
  interface: {
    file: "client/interface/interface.bench.ts",
    pages: 120,
    metrics: [
      "app.frame",
      "ui.facts.publish",
      "ui.outline.publish",
      "ui.open.palette",
      "ui.open.panel",
      "ui.open.dialog",
      "ui.open.popover",
      "ui.open.screen",
      "ui.open.preferences",
      "ui.setting.apply",
      "ui.search.palette",
      "ui.switch.person",
    ],
  },
  "interface-2000": {
    file: "client/interface/interface-2000.bench.ts",
    pages: 2000,
    metrics: ["theme_apply_ms", "inp_outside_ms"],
  },
  "export.pdf-120": {
    file: "client/export/pdf-120.bench.ts",
    pages: null,
    metrics: ["pdf_ms", "pdf_bytes"],
  },
};
/** Scenarios run at once: each starts its own demo and Chromium. */
const AT_ONCE = 3;

/** What a scenario told the harness: each metric and its samples, or why it did not measure. */
type Told =
  | { metrics: { metric: string; samples: number[] }[] }
  | { notMeasured: string };

/** Runs `file` once in quick mode, in a process of its own as the harness runs it, and reads what it printed last. */
async function runQuick(file: string): Promise<Told> {
  const child = Bun.spawn(
    [
      process.execPath,
      join(benchRoot, "run.ts"),
      "--child",
      join(benchRoot, file),
    ],
    {
      env: { ...process.env, MANENT_BENCH_MODE: "quick" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`${file} exited ${exitCode}:\n${stderr}`);
  const told: unknown = JSON.parse(stdout.trimEnd().split("\n").at(-1)!);
  if (!Array.isArray(told))
    return { notMeasured: String(Reflect.get(Object(told), "notMeasured")) };
  return {
    metrics: told.map((m: unknown) => ({
      metric: String(Reflect.get(Object(m), "metric")),
      samples: [Reflect.get(Object(m), "samples")].flat().map(Number),
    })),
  };
}

let ran: Promise<Map<Id, Told>> | null = null;
/** Every scenario run once, AT_ONCE at a time, the first time a test asks. */
function runAll(): Promise<Map<Id, Told>> {
  ran ??= (async () => {
    const told = new Map<Id, Told>();
    const queue = [...IDS];
    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift())
        told.set(id, await runQuick(SCENARIOS[id].file));
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    return told;
  })();
  return ran;
}

/** What each scenario that cannot measure in this build says; every other one measures. */
const NOT_MEASURED: Partial<Record<Id, string>> = {
  "saved-web-120":
    "the status bar did not read Saved within 10000 ms of a keystroke",
  interface:
    "no ui.facts.publish, ui.outline.publish, ui.open.panel, ui.open.dialog, ui.open.popover mark was recorded",
};

test("each client scenario measures what its budget names, and nothing is unbudgeted by accident", async () => {
  const told = await runAll();
  expect(
    IDS.map((id) => {
      const t = told.get(id)!;
      return [
        id,
        "notMeasured" in t ? t.notMeasured : t.metrics.map((m) => m.metric),
      ];
    }),
  ).toEqual(
    IDS.map((id) => [
      id,
      NOT_MEASURED[id] ?? [...SCENARIOS[id].metrics, "input_blocks"],
    ]),
  );
  const { budgets } = await readBudgets(benchRoot, "D-modest");
  expect(
    budgets
      .filter(
        (row) =>
          isId(row.scenario) &&
          !SCENARIOS[row.scenario].metrics.includes(row.metric),
      )
      .map((row) => `${row.scenario} ${row.metric}`),
  ).toEqual([]);
}, 600_000);

test("each client scenario loads the blocks its name promises", async () => {
  const told = await runAll();
  const blocksAt = new Map<number, number>();
  const loaded: unknown[] = [];
  const promised: unknown[] = [];
  for (const id of IDS) {
    const { pages } = SCENARIOS[id];
    const t = told.get(id);
    if (pages === null || t === undefined || "notMeasured" in t) continue;
    const blocks =
      blocksAt.get(pages) ??
      documentOfPages({
        format: "screenplay",
        pages,
        seed: 1,
        sections: "even",
      }).blocks;
    blocksAt.set(pages, blocks);
    loaded.push([
      id,
      t.metrics.find((m) => m.metric === "input_blocks")?.samples,
    ]);
    promised.push([id, [blocks]]);
  }
  expect(loaded).toEqual(promised);
}, 600_000);
