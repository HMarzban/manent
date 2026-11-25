import { expect, test } from "bun:test";
import { join } from "node:path";
import { readBudgets } from "../budgets.ts";
import { assertMarkersKept } from "../client/merge/scenario.ts";
import { regionsIn, seededRandom } from "../client/people.ts";
import { documentOfPages } from "../corpus/documents.ts";
import type { Scenario } from "../harness.ts";

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

const COLLAB_IDS = [
  "crowd-120",
  "convergence-120",
  "merge-offline-120",
  "merge-offline-book-2000",
  "locked-120",
  "history-ui-120",
  "soak-client-120",
] as const;
type CollabId = (typeof COLLAB_IDS)[number];
const isCollabId = (scenario: string): scenario is CollabId =>
  COLLAB_IDS.some((id) => id === scenario);

const COLLAB_SCENARIOS: Readonly<
  Record<
    CollabId,
    {
      file: string;
      workload: Scenario["workload"];
      processes: number;
      metrics: readonly string[];
    }
  >
> = {
  "crowd-120": {
    file: "client/crowd/crowd-120.bench.ts",
    workload: "W1",
    processes: 5,
    metrics: [
      "keystroke_paint_alone",
      "keystroke_paint_realistic",
      "keystroke_paint_extreme",
      "keystroke_paint_rewrite",
      "remote_extra_realistic",
      "remote_extra_extreme",
    ],
  },
  "convergence-120": {
    file: "client/convergence/convergence-120.bench.ts",
    workload: "W1",
    processes: 5,
    metrics: ["visible_ms", "bytes_sent", "bytes_received"],
  },
  "merge-offline-120": {
    file: "client/merge/merge-offline-120.bench.ts",
    workload: "W1",
    processes: 5,
    metrics: [
      "converge_ms",
      "longest_task_ms",
      "bytes_exchanged",
      "doc_bytes_after",
    ],
  },
  "merge-offline-book-2000": {
    file: "client/merge/merge-offline-book-2000.bench.ts",
    workload: "W7",
    processes: 5,
    metrics: [
      "converge_ms",
      "longest_task_ms",
      "bytes_exchanged",
      "doc_bytes_after",
    ],
  },
  "locked-120": {
    file: "client/locked/locked-120.bench.ts",
    workload: "W1",
    processes: 5,
    metrics: ["first_editable_warm", "keystroke_paint", "client_ids"],
  },
  "history-ui-120": {
    file: "client/history-ui/history-ui-120.bench.ts",
    workload: "W1",
    processes: 5,
    metrics: ["list_ms", "compare_ms", "restore_ms"],
  },
  "soak-client-120": {
    file: "client/soak/soak-client-120.bench.ts",
    workload: "W1",
    processes: 1,
    metrics: ["heap_growth", "heap_slope", "node_growth"],
  },
};

test("the collaboration scenarios match their workloads, processes and budgets", async () => {
  const discovered: unknown[] = [];
  for (const id of COLLAB_IDS) {
    const { default: scenario }: { default: Scenario } = await import(
      join(benchRoot, COLLAB_SCENARIOS[id].file)
    );
    discovered.push([scenario.id, scenario.workload, scenario.processes]);
  }
  expect(discovered).toEqual(
    COLLAB_IDS.map((id) => [
      id,
      COLLAB_SCENARIOS[id].workload,
      COLLAB_SCENARIOS[id].processes,
    ]),
  );
  const { budgets } = await readBudgets(benchRoot, "D-modest");
  expect(
    budgets
      .filter(
        (row) =>
          isCollabId(row.scenario) &&
          !COLLAB_SCENARIOS[row.scenario].metrics.includes(row.metric),
      )
      .map((row) => `${row.scenario} ${row.metric}`),
  ).toEqual([]);
});

test("an offline merge that loses a typed marker fails the scenario", () => {
  expect(() =>
    assertMarkersKept(
      ["⟦dana:1⟧", "⟦sam:17⟧"],
      "INT. ROOM - DAY\n⟦dana:1⟧ Action line.",
      ["Recovered ⟦sam:17⟧ line"],
    ),
  ).not.toThrow();
  expect(() =>
    assertMarkersKept(
      ["⟦dana:1⟧", "⟦sam:17⟧"],
      "INT. ROOM - DAY\n⟦dana:1⟧ Action line.",
      ["Recovered other text"],
    ),
  ).toThrow(
    "a typed marker is in neither the script nor Recovered text: ⟦sam:17⟧",
  );
});

test("people helpers partition regions cleanly and seed random deterministically", () => {
  const blocks = Array.from({ length: 100 }, (_, i) => ({ id: `b-${i}` }));
  expect(regionsIn(blocks, 0.1, 0.7, 3)).toEqual([
    { firstBlockId: "b-10", lastBlockId: "b-29" },
    { firstBlockId: "b-30", lastBlockId: "b-49" },
    { firstBlockId: "b-50", lastBlockId: "b-69" },
  ]);
  const a = seededRandom(4747);
  const b = seededRandom(4747);
  expect([a.next(), a.clientId(), [...a.bytes(4)]]).toEqual([
    b.next(),
    b.clientId(),
    [...b.bytes(4)],
  ]);
});
