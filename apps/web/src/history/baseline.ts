// The baseline Changes since offers first, and how a version becomes one.
import type { SinceResponse, VersionPosition } from "@manent/sync-protocol";
import { formatDate, formatDay } from "@manent/ui";
import type { HistoryState } from "../state/history.store.ts";
import { isTitledByTime } from "./history-rows.ts";
import type { HistoryRow } from "./history-rows.ts";

type Baseline = NonNullable<HistoryState["baseline"]>;

/** The title of the baseline that is the place where the person last opened the script. */
const SINCE_OPENED = "you last opened";

/** A row as a baseline: a version titled by its day and time ("Mon 14:10") carries no date, since its title holds one. */
export function baselineOfRow(row: HistoryRow): Baseline {
  const at = row.item.createdAt;
  return {
    versionId: row.item.id,
    position: null,
    title: row.title,
    date: isTitledByTime(row) ? null : `${formatDay(at)} ${formatDate(at)}`,
  };
}

/** Where the baseline is in the script's history; null for none. */
export function baselineAt(
  baseline: HistoryState["baseline"],
): { versionId: string } | { position: VersionPosition } | null {
  if (baseline === null) return null;
  if (baseline.versionId !== null) return { versionId: baseline.versionId };
  return baseline.position === null ? null : { position: baseline.position };
}

/** Where the person last opened the script, as a baseline. */
export function sinceOpenedBaseline(lastOpened: VersionPosition): Baseline {
  return {
    versionId: null,
    position: lastOpened,
    title: SINCE_OPENED,
    date: null,
  };
}

/**
 * Since you last opened, when others have edited since; else the newest named draft of `rows` (newest first); else
 * null.
 */
export function defaultBaseline(
  rows: readonly HistoryRow[],
  sinceOpened: SinceResponse | null,
  lastOpened: VersionPosition | null,
): HistoryState["baseline"] {
  if (sinceOpened !== null && sinceOpened.changes > 0 && lastOpened !== null)
    return sinceOpenedBaseline(lastOpened);
  const draft = rows.find((row) => row.item.kind === "named");
  return draft === undefined ? null : baselineOfRow(draft);
}
