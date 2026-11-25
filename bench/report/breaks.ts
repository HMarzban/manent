// Where the app breaks: each mechanism, its cause, the solution adopted, and the rows that show it.

import { NOT_MEASURED, table } from "./format.ts";
import type { Run } from "./format.ts";

/** A result row the report names: a scenario (a trailing `*` names every id with that prefix), or one of its metrics; or a part of the report. */
export type RowRef =
  | { type: "scenario"; scenario: string; metric: string | null }
  | { type: "part"; name: string };

export const ref = (
  scenario: string,
  metric: string | null = null,
): RowRef => ({
  type: "scenario",
  scenario,
  metric,
});

export interface Break {
  mechanism: string;
  cause: string;
  solution: string;
  rows: readonly RowRef[];
}

export const BREAKS: readonly Break[] = Object.freeze([
  {
    mechanism: "The editable page grows with the script",
    cause: "Every block is an element the browser keeps and lays out",
    solution:
      "The script is split into sections of about 100 blocks, and the browser skips the layout of sections off screen",
    rows: [
      ref("typing-*"),
      ref("typing-flat-1000"),
      ref("scroll-*"),
      ref("open-*"),
    ],
  },
  {
    mechanism: "Remote changes cost the whole document",
    cause: "Each remote change replaces the editor's whole document",
    solution: "Remote changes are merged into one update per frame",
    rows: [ref("crowd-120"), ref("typing-120", "remote_extra")],
  },
  {
    mechanism: "Writer identities pile up with sessions",
    cause:
      "Each editing session adds a writer identity to the document, and the list never shrinks",
    solution:
      "The document is rebuilt once it passes a size or identity budget",
    rows: [ref("crdt.aged"), ref("crdt.rebuild-size")],
  },
  {
    mechanism: "History inside the live document",
    cause: "Every kept version would make the live document larger",
    solution: "Versions are kept outside the live document",
    rows: [
      ref("history.list.first_page"),
      ref("history.compare.120"),
      ref("history.restore.120"),
    ],
  },
  {
    mechanism: "A join storm encodes the room for each client",
    cause: "Each joining client asks for the whole state",
    solution:
      "The state is encoded once for all the clients that join together",
    rows: [ref("server.join-storm")],
  },
  {
    mechanism: "Long jobs on the serving thread",
    cause: "A long job on the thread that serves sockets delays every room",
    solution:
      "Checkpoints are written by a worker; rebuilds and replays still run on the serving thread",
    rows: [
      ref("server.persistence", "checkpoint_stall_ms"),
      ref("server.rebuild-stall"),
    ],
  },
  {
    mechanism: "Slow readers",
    cause:
      "A client that does not read its socket makes the server buffer without limit",
    solution: "The server closes a connection whose send buffer passes a limit",
    rows: [ref("server.fanout")],
  },
  {
    mechanism: "A daily document reused for weeks",
    cause: "Deleting yesterday's text keeps its history inside the document",
    solution: "A new document each day",
    rows: [ref("crdt.daily-reuse")],
  },
]);

/** The ids of the scenarios some run measured, in order, reporting `metric` when one is named. */
function measuredIds(
  runs: readonly Run[],
  scenario: string,
  metric: string | null,
): string[] {
  const prefix = scenario.endsWith("*") ? scenario.slice(0, -1) : null;
  const ids = new Set<string>();
  for (const run of runs) {
    if (run.result.environment.prove) continue;
    for (const s of run.result.scenarios) {
      const named =
        prefix === null ? s.id === scenario : s.id.startsWith(prefix);
      if (!named || s.outcome !== "measured") continue;
      if (metric === null || s.metrics.some((m) => m.metric === metric))
        ids.add(s.id);
    }
  }
  return [...ids].toSorted((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
}

/** The rows of `refs` that some run measured, joined; null when none was. A part of the report is always named. */
export function bearingRows(
  runs: readonly Run[],
  refs: readonly RowRef[],
): string | null {
  const names = refs.flatMap((r) => {
    if (r.type === "part") return [r.name];
    const ids = measuredIds(runs, r.scenario, r.metric);
    return r.metric === null ? ids : ids.map((id) => `${id} ${r.metric}`);
  });
  return names.length === 0 ? null : [...new Set(names)].join(", ");
}

export function breaksSection(runs: readonly Run[]): string {
  return table(
    ["Mechanism", "Cause", "Solution adopted", "Rows"],
    BREAKS.map((b) => [
      b.mechanism,
      b.cause,
      b.solution,
      bearingRows(runs, b.rows) ?? NOT_MEASURED,
    ]),
  );
}
