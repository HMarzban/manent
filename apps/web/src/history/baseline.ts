// The baseline Changes since offers first, and how a version becomes one.
import type { SinceResponse, VersionPosition } from "@manent/sync-protocol";
import { formatDate, formatDay } from "@manent/ui";
import type { HistoryState } from "../state/history.store.ts";
import type { HistoryRow } from "./source.ts";

type Baseline = NonNullable<HistoryState["baseline"]>;

/** The title of the baseline that is the place where the person last opened the script. */
const SINCE_OPENED = "you last opened";

/** A row as a baseline: a version titled by its day and time ("Mon 14:10") carries no date, since its title holds one. */
function baselineOfRow(row: HistoryRow): Baseline {
  const day = formatDay(row.item.createdAt);
  return {
    versionId: row.item.id,
    position: null,
    title: row.title,
    date:
      row.title === `${day} ${row.time}`
        ? null
        : `${day} ${formatDate(row.item.createdAt)}`,
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
    return {
      versionId: null,
      position: lastOpened,
      title: SINCE_OPENED,
      date: null,
    };
  const draft = rows.find((row) => row.item.kind === "named");
  return draft === undefined ? null : baselineOfRow(draft);
}
