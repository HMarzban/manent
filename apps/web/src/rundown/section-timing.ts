// Pure broadcast timing helpers for rundown header section subtotals and prompter send tallies.
import type { RundownClock } from "@manent/pagination";
import type { RundownRowJSON } from "@manent/schema";
import { formatDuration } from "@manent/ui";

/** Formats a signed over/under duration in milliseconds ("-1:12" when under, "0:48" when over). */
export function formatSignedOver(overMs: number): string {
  const magnitude = formatDuration(Math.abs(overMs));
  return overMs < 0 ? `-${magnitude}` : magnitude;
}

export interface PrompterTally {
  readonly total: number;
  readonly sent: number;
  readonly changed: number;
}

/**
 * Sums the computed row durations under each header row (until the next header or end of the rundown).
 * Headers whose section has no timed rows are omitted from the returned map.
 */
export function sectionDurationsByHeader(
  rows: readonly RundownRowJSON[],
  clock: RundownClock,
): ReadonlyMap<string, number> {
  const timingById = new Map(clock.rows.map((entry) => [entry.id, entry]));
  const totals = new Map<string, number>();
  let currentHeaderId: string | null = null;
  let runningMs = 0;
  let hasTimedRow = false;

  const flush = (): void => {
    if (currentHeaderId !== null && hasTimedRow) {
      totals.set(currentHeaderId, runningMs);
    }
  };

  for (const row of rows) {
    if (row.kind === "header") {
      flush();
      currentHeaderId = row.id;
      runningMs = 0;
      hasTimedRow = false;
      continue;
    }
    if (currentHeaderId === null) continue;
    const durMs = timingById.get(row.id)?.durMs ?? null;
    if (durMs !== null) {
      runningMs += durMs;
      hasTimedRow = true;
    }
  }
  flush();
  return totals;
}

/** Counts script rows on the rundown, how many are live on the prompter, and how many changed since last send. */
export function prompterTally(rows: readonly RundownRowJSON[]): PrompterTally {
  let total = 0;
  let sent = 0;
  let changed = 0;
  for (const row of rows) {
    if (row.kind !== "script" || row.docId === null) continue;
    total += 1;
    if (row.prompter?.state === "on") sent += 1;
    else if (row.prompter !== undefined) changed += 1;
  }
  return { total, sent, changed };
}
