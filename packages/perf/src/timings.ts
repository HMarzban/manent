// What the demo's Timings shows: the product's own marks, summarised with the
// benchmark's statistics.

import type { MarkRecord } from "./marks.ts";
import { summarise } from "./stats.ts";
import type { Summary } from "./stats.ts";

/** Each figure is null while no record of it exists. */
export interface Timings {
  keystroke: Summary | null;
  pagination: Summary | null;
  roundTrip: Summary | null;
  /** `ratio` is the live document's bytes over its plain text's. */
  size: { liveBytes: number; ratio: number } | null;
}

function summaryOf(marks: readonly MarkRecord[], name: string): Summary | null {
  const durations = marks
    .filter((m) => m.name === name)
    .map((m) => m.durationMs);
  return durations.length === 0 ? null : summarise(durations);
}

/** Keystroke from `editor.keystroke`, pagination from `pagination.engine`, round trip from `sync.ack`. */
export function timingsOf(
  marks: readonly MarkRecord[],
  doc: { liveBytes: number; plainBytes: number } | null,
): Timings {
  return {
    keystroke: summaryOf(marks, "editor.keystroke"),
    pagination: summaryOf(marks, "pagination.engine"),
    roundTrip: summaryOf(marks, "sync.ack"),
    size:
      doc === null
        ? null
        : { liveBytes: doc.liveBytes, ratio: doc.liveBytes / doc.plainBytes },
  };
}
