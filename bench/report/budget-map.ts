// Every budget the report states, in the words it prints, and where each is held: the rows of the
// budgets file its scenarios are judged by, a test, the desktop smoke, or nothing yet.

import { BUDGET_STATS } from "../budgets.ts";
import type { Budget } from "../budgets.ts";
import BUDGETS_FILE from "../budgets.json";
import type { MetricSummary, ScenarioResult } from "../result.ts";
import { AREAS, JUDGED_ON } from "../tiers/tiers.ts";
import {
  COLUMNS,
  NOT_MEASURED,
  areaOf,
  columnsOf,
  metricOf,
  scenarioIn,
  hasCell,
  plural,
  statCell,
  table,
} from "./format.ts";
import type { Column, Run } from "./format.ts";
import { SMOKE_VERDICT_KINDS, desktopSection } from "./smoke.ts";
import type { SmokeResult, SmokeVerdict } from "./smoke.ts";
import { VERDICT_WORDS, budgetSummary, hardFails, heldBy } from "./text.ts";

export type Held =
  | { type: "scenarios"; budgets: readonly Budget[] }
  | { type: "test"; path: string }
  | { type: "smoke" }
  | { type: "not_measured"; reason: string }
  /** Something a later stage builds; its reason is its line in the not-built list. */
  | { type: "not_built"; what: string };

export interface BudgetRow {
  area: string;
  metric: string;
  budget: string;
  hardFail: string;
  remedy: string;
  held: Held;
}

/**
 * One row a line: area | metric | budget | hard fail | where it is held | remedy. Where it is held is
 * `scenarios <scenario> <metric>, …` (every row of the budgets file for each pair), `test <path>`,
 * `smoke`, `not built <what>` or `not measured <reason>`.
 */
const TABLE = `
Typing | Keystroke to paint p50 / p95 / p99, at 120 and 2,000 pages | ≤ 16 / 33 / 50 ms | > 33 / 50 / 100 ms | scenarios typing-120 keystroke_paint, typing-2000 keystroke_paint, typing-book-2000 keystroke_paint, typing-boundary-2000 keystroke_paint, locked-120 keystroke_paint | Do less on each keystroke: smaller sections, fewer decorations drawn again.
Typing | Variation across start, middle, end | ≤ 20 % | > 50 % | scenarios typing-120 position_spread, typing-2000 position_spread | Find the work that grows with the caret's position and keep it inside the caret's section.
Typing with remote editors | Extra p95 over solo | ≤ 8 ms | > 16 ms | scenarios typing-120 remote_extra, typing-2000 remote_extra, crowd-120 remote_extra_realistic | Merge more remote changes into each frame's one update.
Saving | Keystroke to "Saved" p95, web / desktop with full fsync | ≤ 100 / 150 ms | > 500 ms | scenarios saved-web-120 keystroke_saved, desktop.saved-fsync keystroke_saved | Write the device's changes in fewer, larger batches.
Pagination | Engine work per keystroke | ≤ 0.5 ms | > 2 ms | scenarios pagination-engine-120 keystroke_engine, pagination-engine-400 keystroke_engine, pagination-engine-2000 keystroke_engine | Repaginate fewer pages after a keystroke.
Pagination | Total main-thread cost per keystroke | ≤ 4 ms | > 8 ms | scenarios typing-120 dispatch, typing-2000 dispatch | Move work out of the keystroke's transaction.
Pagination | Full cold repagination, 120 / 400 / 2,000 pages | ≤ 10 / 30 / 150 ms | > 30 / 80 / 400 ms | scenarios pagination-engine-120 cold_repagination, pagination-engine-400 cold_repagination, pagination-engine-2000 cold_repagination | Paginate the first screen first and the rest in slices.
Pagination | Frame in which many breaks move | ≤ 50 ms | > 100 ms | scenarios repaginate-120 breaks_frame_ms, repaginate-2000 breaks_frame_ms | Spread a whole-script repagination over several frames.
Open | First editable, warm or offline: 120 / 300 / 2,000 pages | ≤ 1.0 / 2.0 / 6.0 s | > 2.0 / 4.0 / 12 s | scenarios open-120 first_editable_warm, open-120 first_editable_offline, open-300 first_editable_warm, open-300 first_editable_offline, open-2000 first_editable_warm, open-2000 first_editable_offline | Make the visible section editable first and load the rest after.
Paste 50 pages | To next paint | ≤ 300 ms | > 1 s | scenarios paste-50 paste_paint | Insert a large paste in slices.
Scroll | Frame time p95; frames over 50 ms | ≤ 16.7 ms; ≤ 1 % | > 33 ms; > 5 % | scenarios scroll-120 frame_ms, scroll-120 frames_over_50, scroll-2000 frame_ms, scroll-2000 frames_over_50 | Skip more of the work for sections off screen.
Convergence | Update visible elsewhere, p50 / p99 | ≤ 100 / 500 ms | > 250 ms / > 1 s | scenarios convergence-120 visible_ms | Shorten the path from the server to the page: send sooner and apply sooner.
Convergence | Prompter-feed staleness p99 | ≤ 1 s | > 2 s | scenarios prompter.staleness staleness_ms | Shorten the path from a send to the window: send the story's text as soon as the server records the send.
Offline merge | Time to converge; longest task | ≤ 3 s; ≤ 100 ms | > 10 s; > 500 ms | scenarios merge-offline-120 converge_ms, merge-offline-120 longest_task_ms, merge-offline-book-2000 converge_ms, merge-offline-book-2000 longest_task_ms, crdt.rebuild-time replay_ms | Merge a long offline session in slices, off the main thread.
Versions | List of 5,000 interactive; changes between two 120-page versions; restore | ≤ 300 ms; ≤ 500 ms; ≤ 1 s | > 1 s; > 2 s; > 3 s | scenarios history.list.first_page list_ms, history.compare.120 compare_ms, history.restore.120 restore_ms, rundown.w4 list_ms | Load the list a page at a time; compare in smaller slices; restore on the server in one step.
Versions | At 2,000 pages: changes between two versions (no slice over 16 ms); making a version on the serving thread; restore | ≤ 4 s (longest slice ≤ 8 ms); ≤ 100 ms; ≤ 3 s | > 10 s (longest slice > 16 ms); > 400 ms; > 8 s | scenarios history.compare.2000 compare_ms, history.compare.2000 longest_slice_ms, history.version.2000 version_ms, history.restore.2000 restore_ms | Compare in smaller slices; make versions in the checkpoint worker; restore on the server in one step.
Export | PDF, 120 pages | ≤ 3 s | > 10 s | scenarios export.pdf-120 pdf_ms | Write the PDF in slices or in a worker.
Client memory | Heap for a 120-page / 2,000-page script; growth over a 2-hour soak | ≤ 150 / 600 MB; ≤ 10 % | > 400 MB / 1.5 GB; > 30 % | scenarios open-120 heap_bytes, open-2000 heap_bytes, soak-client-120 heap_growth | Release what belongs to sections off screen; find what keeps growing.
Document size | Live bytes ÷ plain text; client IDs | ≤ 5x; ≤ 2,000 | > 10x; > 10,000 (both trigger a rebuild) | scenarios crdt.rebuild-size bytes_ratio_after, crdt.rebuild-size client_ids_after, crdt.aged bytes_ratio_400, crdt.aged client_ids_400 | Rebuild the document sooner.
Server | Fan-out p99 at 200 clients; event-loop lag p99 | ≤ 50 ms; ≤ 20 ms | > 200 ms; > 100 ms | scenarios server.fanout fanout_ms, server.fanout event_loop_lag_ms, rundown.w4 fanout_ms, rundown.w4 event_loop_lag_ms, rundown.w5 fanout_ms, rundown.w5 event_loop_lag_ms | Encode each update once for every recipient; move heavy work to the checkpoint worker.
Server | Memory per idle room; per loaded 120-page room | 0; ≤ 20 MB | any; > 60 MB | scenarios server.room-memory rooms_after_idle, server.room-memory loaded_room_bytes, rundown.w5 rooms_after_idle | Unload idle rooms sooner and keep less in each loaded room.
Server | Join storm, 200 clients, last synced | ≤ 3 s | > 10 s | scenarios server.join-storm last_synced_ms, rundown.w5 last_synced_ms | Encode a room's state once for every client that joins.
Storage | Growth per typist-hour (14,400 single-keystroke pushes; the log is kept until a rebuild); checkpoint stall on the serving thread | ≤ 1 MB; 0 ms | > 2 MB; > 20 ms | scenarios server.persistence growth_bytes_per_typist_hour, server.persistence checkpoint_stall_ms | Store smaller log rows; keep checkpoint writes in the worker.
Storage | Serving-thread stall of one rebuild of a 2,000-page script, and of a replay whose base is built from a long log (p99) | ≤ 20 ms | > 100 ms | scenarios server.rebuild-stall rebuild_stall_ms, server.rebuild-stall replay_stall_ms | Move the rebuild and the replay to the checkpoint worker.
Durability | Acknowledged updates lost across 200 kills | 0 | any | scenarios server.durability acked_lost | Find the lost update and make its write durable before its acknowledgement.
Size | First-load web JavaScript (gzip); desktop installer | ≤ 350 KB; ≤ 250 MB | > 600 KB; > 400 MB | test tools/desktop/check-size.ts | Load less code before the first screen; leave out of the installer what the app does not use.
Desktop | Cold start, launch to the first frame; idle memory of all the app's processes, 30 s after the first frame | ≤ 2.0 s; ≤ 400 MB | > 4.0 s; > 700 MB | smoke | Start less before the first frame; find which process holds the memory.
Demo | Seeding Small and Medium before the app opens; seeding Lanternfield Studios in the background, reference Mac | ≤ 30 s; ≤ 10 min | > 60 s; > 20 min | scenarios demo.seed foreground_ms, demo.seed studio_ms | Seed less before the app opens and more in the background.
Interface | Store writes outside the facts, and React commits not caused by a changed fact, per keystroke | 0 | any | test apps/web/test/editor-host.dom.test.tsx | Find the write and move it behind a changed fact.
Interface | Interaction to next paint outside the page | ≤ 100 ms | > 200 ms | scenarios interface-2000 inp_outside_ms | Split the work of the slow handler across frames.
Interface | Open a menu, popover or the palette | ≤ 50 ms | > 100 ms | scenarios interface ui.open.palette, interface ui.open.popover | Render the popup's content before it is opened.
Interface | Open or close a loaded panel; open a dialog | ≤ 100 ms | > 200 ms | scenarios interface ui.open.panel, interface ui.open.dialog | Keep loaded panels mounted and hidden.
Interface | Change screen (frame painted); open Preferences | ≤ 150 ms | > 300 ms | scenarios interface ui.open.screen, interface ui.open.preferences | Load each screen's code before it is opened.
Interface | A preference or setting takes effect (attribute; theme at 2,000 pages) | ≤ 50 ms; ≤ 100 ms | > 100 ms; > 200 ms | scenarios interface ui.setting.apply, interface-2000 theme_apply_ms | Change one attribute and let the stylesheet do the rest.
Interface | Switch person | ≤ 500 ms | > 1 s | scenarios interface ui.switch.person | Keep the next person's data ready before the switch.
Interface | Start-up: the static frame replaced by the real one | ≤ 150 ms | > 300 ms | scenarios interface app.frame | Load less before the first real frame.
Interface | Vertical movement of the caret's line when a panel opens; when a remote edit lands above | 0 px; ≤ 1 px | > 1 px | test e2e/editor/remote.e2e.ts | Hold the caret's line in place when the layout above it changes.
Interface | Entry chunk; any other interface chunk except data and editor (gzip) | ≤ 150 KB; ≤ 60 KB | > 250 KB; > 120 KB | not measured no check measures the size of the web app's code in this release | Split the chunk and load the parts when they are used.
Interface | Facts and outline published per keystroke; the palette's search | ≤ 0.5 ms; ≤ 50 ms | > 1 ms; > 150 ms | scenarios interface ui.facts.publish, interface ui.outline.publish, interface ui.search.palette | Publish only the facts that changed; search a prepared index.
Server | One keystroke through the write path, 120 / 2,000 pages | ≤ 2 ms | > 20 ms | scenarios server.push-cost push_ms_120, server.push-cost push_ms_2000 | Do less in the write path before the acknowledgement.
Server | Memory growth over the 8-hour soak; every bot holding the same text at its end | ≤ 10 %; 0 | > 30 %; > 0 | scenarios server.soak memory_growth_percent, server.soak diverged | Find what the server keeps for a connection after it closes; find the update one bot never received.
Production | Revision marks per keystroke, 120 pages with 12 revisions | ≤ 0.5 ms | > 2 ms | scenarios production.marks marks_ms | Derive marks for the visible pages only.
Durability | Acknowledged updates lost across simulated power cuts | 0 | any | scenarios server.power-loss acked_lost | Acknowledge an update only after the disk has confirmed it.
`;

const BUDGETS: readonly Budget[] = BUDGETS_FILE.budgets.map((row) => {
  const stat = BUDGET_STATS.find((s) => s === row.stat);
  if (stat === undefined)
    throw new RangeError(
      `a budget's stat must be one of ${BUDGET_STATS.join(", ")}, not ${row.stat}`,
    );
  return Object.freeze({ ...row, stat });
});

/** Every row of the budgets file for each `<scenario> <metric>` pair, in the file's order. */
function budgetsOf(pairs: string): readonly Budget[] {
  return pairs.split(", ").flatMap((pair) => {
    const [scenario, metric, ...rest] = pair.split(" ");
    const rows = BUDGETS.filter(
      (b) => b.scenario === scenario && b.metric === metric,
    );
    if (rows.length === 0 || rest.length > 0)
      throw new RangeError(`no budget row is for ${pair}`);
    return rows;
  });
}

const HELD_PREFIXES = [
  "scenarios ",
  "test ",
  "not built ",
  "not measured ",
] as const;

function heldOf(cell: string): Held {
  if (cell === "smoke") return { type: "smoke" };
  const prefix = HELD_PREFIXES.find((p) => cell.startsWith(p));
  const rest = cell.slice(prefix?.length ?? 0);
  switch (prefix) {
    case "scenarios ":
      return { type: "scenarios", budgets: budgetsOf(rest) };
    case "test ":
      return { type: "test", path: rest };
    case "not built ":
      return { type: "not_built", what: rest };
    case "not measured ":
      return { type: "not_measured", reason: rest };
    case undefined:
      throw new RangeError(
        `a budget is held by scenarios, a test, the smoke or nothing, not ${cell}`,
      );
  }
}

function rowOf(line: string): BudgetRow {
  const [area, metric, budget, hardFail, held, remedy, ...rest] =
    line.split(" | ");
  if (remedy === undefined || rest.length > 0)
    throw new RangeError(`a budget row has six cells, not ${line}`);
  return Object.freeze({
    area: area ?? "",
    metric: metric ?? "",
    budget: budget ?? "",
    hardFail: hardFail ?? "",
    remedy,
    held: heldOf(held ?? ""),
  });
}

export const BUDGET_MAP: readonly BudgetRow[] = Object.freeze(
  TABLE.trim().split("\n").map(rowOf),
);

const KINDS = [
  "pass",
  "held",
  "not_measured",
  "undecided",
  "over_budget",
  "hard_fail",
] as const;

/** A row's verdict: its kind, worst last in KINDS, and the words the report prints. */
export interface RowVerdict {
  kind: (typeof KINDS)[number];
  word: string;
}

const NOT: RowVerdict = Object.freeze({
  kind: "not_measured",
  word: NOT_MEASURED,
});

const worst = (verdicts: readonly RowVerdict[]): RowVerdict =>
  verdicts.reduce<RowVerdict | null>(
    (w, v) =>
      w === null || KINDS.indexOf(v.kind) > KINDS.indexOf(w.kind) ? v : w,
    null,
  ) ?? NOT;

function metricVerdict(m: MetricSummary | null): RowVerdict {
  if (m === null) return NOT;
  switch (m.verdict) {
    case "pass":
    case "over_budget":
    case "hard_fail":
      return { kind: m.verdict, word: VERDICT_WORDS[m.verdict] };
    case "inconclusive":
      return {
        kind: "undecided",
        word: VERDICT_WORDS[m.verdictReason ?? "undecided"],
      };
    case "no_budget":
      return NOT;
  }
}

function smokeVerdict(verdict: SmokeVerdict | null): RowVerdict {
  if (verdict === null) return NOT;
  const kind = SMOKE_VERDICT_KINDS[verdict];
  return { kind, word: VERDICT_WORDS[kind] };
}

/** The column whose run judges scenario `id`: its area's tier at 1x; null when no run holds the scenario. */
export function judgingColumn(runs: readonly Run[], id: string): Column | null {
  const area = areaOf(runs, id);
  if (area === null) return null;
  return (
    COLUMNS.find((c) => c.tier === JUDGED_ON[area] && c.throttle === 1) ?? null
  );
}

/** Scenario `id` as the run that judges it holds it; null when none does. */
export function judgedScenario(
  runs: readonly Run[],
  id: string,
): ScenarioResult | null {
  const column = judgingColumn(runs, id);
  return column === null ? null : scenarioIn(runs, column, id);
}

export function rowVerdict(
  runs: readonly Run[],
  smoke: readonly SmokeResult[],
  row: BudgetRow,
): RowVerdict {
  const { held } = row;
  switch (held.type) {
    case "scenarios":
      return worst(
        held.budgets.map((b) =>
          metricVerdict(metricOf(judgedScenario(runs, b.scenario), b.metric)),
        ),
      );
    case "test":
      return { kind: "held", word: heldBy(held.path) };
    case "smoke":
      return worst(
        smoke.flatMap((s) => [
          smokeVerdict(s.coldStart),
          smokeVerdict(s.idleMemory),
        ]),
      );
    case "not_measured":
    case "not_built":
      return NOT;
  }
}

/** The distinct items of a list, in order, joined as lines of one cell. */
const lines = (items: readonly string[]): string =>
  [...new Set(items)].join("<br>");

function measuredBy(runs: readonly Run[], row: BudgetRow): string {
  const { held } = row;
  switch (held.type) {
    case "scenarios":
      return lines(
        held.budgets.map((b) => {
          const column = judgingColumn(runs, b.scenario);
          return column === null
            ? b.scenario
            : `${b.scenario} on ${column.label}`;
        }),
      );
    case "test":
      return held.path;
    case "smoke":
      return "tools/desktop/smoke.ts";
    case "not_measured":
    case "not_built":
      return "";
  }
}

function tierCell(
  runs: readonly Run[],
  column: Column,
  budgets: readonly Budget[],
): string {
  const entries = budgets
    .filter((b) => hasCell(runs, column, b.scenario))
    .map((b) => ({ b, cell: statCell(runs, column, b) }));
  if (entries.every((e) => e.cell === NOT_MEASURED))
    return entries.length === 0 ? "" : NOT_MEASURED;
  return lines(
    entries.map(
      ({ b, cell }) => `${b.scenario} ${b.metric} ${b.stat}: ${cell}`,
    ),
  );
}

function processesCell(
  runs: readonly Run[],
  budgets: readonly Budget[],
): string {
  return lines(
    budgets.flatMap((b) => {
      const scenario = judgedScenario(runs, b.scenario);
      const m = metricOf(scenario, b.metric);
      if (scenario === null || m === null) return [];
      return [
        `${b.scenario} ${b.metric}: ${plural(scenario.processes, "process", "processes")}, ${plural(m.samples, "sample", "samples")}`,
      ];
    }),
  );
}

export function budgetsSection(
  runs: readonly Run[],
  smoke: readonly SmokeResult[],
): string {
  const columns = columnsOf(runs, AREAS);
  const judged = BUDGET_MAP.map((row) => ({
    row,
    verdict: rowVerdict(runs, smoke, row),
  }));
  const count = (kind: RowVerdict["kind"]): number =>
    judged.filter((j) => j.verdict.kind === kind).length;
  const counted = {
    pass: count("pass"),
    over: count("over_budget"),
    hard: count("hard_fail"),
    undecided: count("undecided"),
    notMeasured: count("not_measured"),
  };
  const n =
    counted.pass +
    counted.over +
    counted.hard +
    counted.undecided +
    counted.notMeasured;
  const failing = judged
    .filter((j) => j.verdict.kind === "hard_fail")
    .map((j) => `${j.row.area} — ${j.row.metric}`);
  const header = [
    "Area",
    "Metric",
    "Budget",
    "Hard fail",
    "Measured by",
    ...columns.map((c) => c.label),
    "Processes and samples",
    "Verdict",
    "Remedy",
  ];
  const rows = judged.map(({ row, verdict }) => {
    const budgets = row.held.type === "scenarios" ? row.held.budgets : [];
    const missed =
      verdict.kind === "over_budget" || verdict.kind === "hard_fail";
    return [
      row.area,
      row.metric,
      row.budget,
      row.hardFail,
      measuredBy(runs, row),
      ...columns.map((c) => tierCell(runs, c, budgets)),
      processesCell(runs, budgets),
      verdict.word,
      missed ? row.remedy : "",
    ];
  });
  return [
    budgetSummary({ n, ...counted }),
    ...(failing.length > 0 ? [hardFails(failing)] : []),
    table(header, rows),
    ...(smoke.length > 0 ? [desktopSection(smoke)] : []),
  ].join("\n\n");
}
