// Unbudgeted scenarios: alternative designs on the editing traces (Yjs beside prosemirror-collab,
// Loro and Automerge) and features without a stated budget.

import { TRACE_SOURCES } from "../corpus/traces.ts";
import type { BudgetStat } from "../result.ts";
import { JUDGED_ON } from "../tiers/tiers.ts";
import type { Area } from "../tiers/tiers.ts";
import {
  COLUMNS,
  columnsOf,
  metricOf,
  plural,
  scenarioIn,
  statCell,
  table,
} from "./format.ts";
import type { Column, Run } from "./format.ts";
import { OTHER_DESIGNS, OTHER_DESIGNS_LIBRARIES } from "./text.ts";

interface MetricRow {
  metric: string;
  stat: BudgetStat;
}

export interface UnbudgetedScenario {
  id: string;
  title: string;
  area: Area;
  rows: readonly MetricRow[];
}

const TRACE_KEYS = TRACE_SOURCES.map((t) => t.name.replaceAll("-", "_"));

const traceRows = (
  specs: readonly { prefix: string; stat: BudgetStat }[],
): readonly MetricRow[] =>
  TRACE_KEYS.flatMap((t) =>
    specs.map(({ prefix, stat }) => ({ metric: `${prefix}_${t}`, stat })),
  );

const TYPING_ROWS: readonly MetricRow[] = Object.freeze([
  { metric: "keystroke_paint", stat: "p50" },
  { metric: "keystroke_paint", stat: "p95" },
  { metric: "keystroke_paint", stat: "p99" },
  { metric: "keystroke_paint_remote", stat: "p95" },
  { metric: "remote_extra", stat: "p50" },
  { metric: "position_spread", stat: "p50" },
  { metric: "dispatch", stat: "p95" },
]);

export const OTHER_SCENARIOS: readonly UnbudgetedScenario[] = Object.freeze([
  {
    id: "crdt.traces",
    title: "Yjs on the editing traces (`crdt.traces`)",
    area: "crdt",
    rows: traceRows([
      { prefix: "replay_ms", stat: "p50" },
      { prefix: "bytes_ratio", stat: "p50" },
      { prefix: "transactions", stat: "max" },
    ]),
  },
  {
    id: "crdt.authority",
    title:
      "Central-authority baseline with `prosemirror-collab` (`crdt.authority`)",
    area: "crdt",
    rows: traceRows([
      { prefix: "replay_ms", stat: "p50" },
      { prefix: "log_bytes", stat: "max" },
      { prefix: "offline_dropped", stat: "max" },
    ]),
  },
  {
    id: "crdt.loro",
    title: "Loro on the editing traces (`crdt.loro`)",
    area: "crdt",
    rows: traceRows([
      { prefix: "replay_ms", stat: "p50" },
      { prefix: "bytes_ratio", stat: "p50" },
    ]),
  },
  {
    id: "crdt.automerge",
    title: "Automerge on the editing traces (`crdt.automerge`)",
    area: "crdt",
    rows: traceRows([
      { prefix: "replay_ms", stat: "p50" },
      { prefix: "bytes_ratio", stat: "p50" },
    ]),
  },
  {
    id: "storage-quota-120",
    title: "Browser storage quota exhaustion (`storage-quota-120`)",
    area: "client",
    rows: [
      { metric: "told_ms", stat: "p50" },
      { metric: "changes_lost", stat: "max" },
    ],
  },
  {
    id: "storage-unpersisted-120",
    title: "Unpersisted browser storage (`storage-unpersisted-120`)",
    area: "client",
    rows: [{ metric: "changes_lost", stat: "max" }],
  },
  {
    id: "typing-120-firefox",
    title: "Typing in Firefox, 120 pages (`typing-120-firefox`)",
    area: "client",
    rows: TYPING_ROWS,
  },
  {
    id: "typing-120-webkit",
    title: "Typing in WebKit, 120 pages (`typing-120-webkit`)",
    area: "client",
    rows: TYPING_ROWS,
  },
  {
    id: "typing-120-spellcheck",
    title: "Typing with spellcheck, 120 pages (`typing-120-spellcheck`)",
    area: "client",
    rows: TYPING_ROWS,
  },
  {
    id: "typing-1000-spellcheck",
    title: "Typing with spellcheck, 1,000 pages (`typing-1000-spellcheck`)",
    area: "client",
    rows: TYPING_ROWS,
  },
  {
    id: "server.search",
    title: "Full-text search (`server.search`)",
    area: "server",
    rows: [
      { metric: "search_ms", stat: "p50" },
      { metric: "search_ms", stat: "p95" },
      { metric: "search_ms", stat: "p99" },
    ],
  },
  {
    id: "ink-compile",
    title: "Ink compile after pause (`ink-compile`)",
    area: "client",
    rows: [
      { metric: "pause_to_problem_ms", stat: "p50" },
      { metric: "pause_to_problem_ms", stat: "p95" },
      { metric: "pause_to_problem_ms", stat: "p99" },
    ],
  },
  {
    id: "desktop.wake",
    title: "Desktop wake and reconnect (`desktop.wake`)",
    area: "desktop",
    rows: [
      { metric: "reconnect_ms", stat: "p50" },
      { metric: "reconnect_ms", stat: "p95" },
      { metric: "reconnect_ms", stat: "max" },
    ],
  },
  {
    id: "desktop.update",
    title: "Desktop update (`desktop.update`)",
    area: "desktop",
    rows: [{ metric: "update_ms", stat: "p50" }],
  },
  {
    id: "server.many-rooms",
    title: "Many loaded rooms (`server.many-rooms`)",
    area: "server",
    rows: [
      { metric: "rss_per_loaded_room_bytes", stat: "max" },
      { metric: "rss_per_connection_bytes", stat: "max" },
      { metric: "heap_per_loaded_room_bytes", stat: "max" },
      { metric: "rooms_after_idle", stat: "max" },
    ],
  },
  {
    id: "server.presence",
    title: "Presence fan-out (`server.presence`)",
    area: "server",
    rows: [
      { metric: "deliveries_per_second", stat: "p50" },
      { metric: "presence_bytes_per_second", stat: "p50" },
      { metric: "presence_lag_ms", stat: "p50" },
      { metric: "presence_lag_ms", stat: "p95" },
      { metric: "presence_lag_ms", stat: "p99" },
    ],
  },
]);

const HOST_DESKTOP: Column = Object.freeze({
  tier: "host",
  throttle: 1,
  label: "Desktop (host)",
});

function columnsForArea(runs: readonly Run[], area: Area): readonly Column[] {
  if (area === "desktop") return [HOST_DESKTOP];
  const found = columnsOf(runs, [area]);
  if (found.length > 0) return found;
  const fallback = COLUMNS.find(
    (c) => c.tier === JUDGED_ON[area] && c.throttle === 1,
  );
  return fallback === undefined ? [] : [fallback];
}

function samplesCell(
  runs: readonly Run[],
  columns: readonly Column[],
  scenarioId: string,
  metric: string,
): string {
  for (const column of columns) {
    const scenario = scenarioIn(runs, column, scenarioId);
    const m = metricOf(scenario, metric);
    if (scenario !== null && m !== null)
      return `${plural(scenario.processes, "process", "processes")}, ${plural(m.samples, "sample", "samples")}`;
  }
  return "";
}

function scenarioTable(runs: readonly Run[], spec: UnbudgetedScenario): string {
  const columns = columnsForArea(runs, spec.area);
  const header = [
    "Metric",
    "Stat",
    ...columns.map((c) => c.label),
    "Processes and samples",
  ];
  const rows = spec.rows.map(({ metric, stat }) => [
    metric,
    stat,
    ...columns.map((c) =>
      statCell(runs, c, { scenario: spec.id, metric, stat }),
    ),
    samplesCell(runs, columns, spec.id, metric),
  ]);
  return `### ${spec.title}\n\n${table(header, rows)}`;
}

export function otherDesignsSection(runs: readonly Run[]): string {
  return [
    OTHER_DESIGNS,
    OTHER_DESIGNS_LIBRARIES,
    ...OTHER_SCENARIOS.map((spec) => scenarioTable(runs, spec)),
  ].join("\n\n");
}
