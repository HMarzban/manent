// The rows of the demo bar's Timings: this window's performance marks, read as the benchmark reads its samples.
import type { MarkRecord } from "@manent/perf";
import { DEMO_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

/** The most recent samples of each mark a row is read from. */
export const TIMINGS_WINDOW = 200;
/** How often the open popover reads the marks again. */
export const TIMINGS_REFRESH_MS = 1_000;
/** How often it encodes the document again for Document size: an encoding of a long script costs frames. */
export const DOC_SIZE_REFRESH_MS = 10_000;

/** What Document size is read from: the length of the document's encoded state. */
export interface DocSize {
  liveBytes: number;
}

export interface TimingsRow {
  label: string;
  stats: string;
}

const [KEYSTROKE, PAGINATION, ROUND_TRIP, SIZE] = DEMO_WORDS.timingRows;

/** The smallest sample with at least p % of the samples at or below it: the benchmark's nearest rank. */
const nearestRank = (sorted: readonly number[], p: number): number =>
  sorted[Math.max(1, Math.ceil((p * sorted.length) / 100)) - 1]!;

/**
 * p50, p95 and the count of the mark's last TIMINGS_WINDOW samples. Read here rather than with `timingsOf`: its
 * statistics would join the page's first load, and their intervals would cost the window it measures every second.
 */
function statsOf(records: readonly MarkRecord[], name: string): string {
  const sorted = records
    .filter((record) => record.name === name)
    .slice(-TIMINGS_WINDOW)
    .map((record) => record.durationMs)
    .toSorted((a, b) => a - b);
  return sorted.length === 0
    ? DEMO_WORDS.nothingMeasured
    : DEMO_WORDS.stats(
        nearestRank(sorted, 50),
        nearestRank(sorted, 95),
        sorted.length,
      );
}

function rowsOf(
  records: readonly MarkRecord[],
  doc: DocSize | null,
): TimingsRow[] {
  return [
    { label: KEYSTROKE, stats: statsOf(records, "editor.keystroke") },
    { label: PAGINATION, stats: statsOf(records, "pagination.engine") },
    { label: ROUND_TRIP, stats: statsOf(records, "sync.ack") },
    {
      label: SIZE,
      stats:
        doc === null
          ? DEMO_WORDS.nothingMeasured
          : DEMO_WORDS.bytes(doc.liveBytes / 1000),
    },
  ];
}

const isSameRows = (a: readonly TimingsRow[], b: readonly TimingsRow[]) =>
  a.length === b.length &&
  a.every((row, i) => row.label === b[i]?.label && row.stats === b[i]?.stats);

/**
 * The four rows, read again when at least TIMINGS_REFRESH_MS has passed by `now` since they were last read, and the
 * document's size when DOC_SIZE_REFRESH_MS has; between reads, and while they read the same, the same array, so a
 * component may read it on every render. It tells nobody: whoever draws it draws it again every TIMINGS_REFRESH_MS.
 */
export function createTimingsSource(options: {
  read: () => readonly MarkRecord[];
  doc: () => DocSize | null;
  now: () => number;
}): Subscribable<TimingsRow[]> {
  let readAt = options.now();
  let doc = options.doc();
  let docReadAt = readAt;
  let rows = rowsOf(options.read(), doc);
  return {
    get() {
      const now = options.now();
      if (now - readAt < TIMINGS_REFRESH_MS) return rows;
      readAt = now;
      if (now - docReadAt >= DOC_SIZE_REFRESH_MS) {
        docReadAt = now;
        doc = options.doc();
      }
      const next = rowsOf(options.read(), doc);
      if (!isSameRows(next, rows)) rows = next;
      return rows;
    },
    subscribe: () => () => {},
  };
}
