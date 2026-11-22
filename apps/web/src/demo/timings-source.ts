// The rows of the demo bar's Timings: this window's performance marks, read with the benchmark's statistics.
import { timingsOf } from "@manent/perf";
import type { MarkRecord, Summary } from "@manent/perf";
import { DEMO_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

/** The most recent samples of each mark a row is read from. */
export const TIMINGS_WINDOW = 200;
/** How often the open popover reads the marks again. */
export const TIMINGS_REFRESH_MS = 1_000;

export interface TimingsRow {
  label: string;
  stats: string;
}

const [KEYSTROKE, PAGINATION, ROUND_TRIP, SIZE] = DEMO_WORDS.timingRows;

/** The last TIMINGS_WINDOW records of each mark name, in the order they came. */
function lastOfEach(records: readonly MarkRecord[]): MarkRecord[] {
  const counts = new Map<string, number>();
  const kept: MarkRecord[] = [];
  for (const record of records.toReversed()) {
    const count = counts.get(record.name) ?? 0;
    if (count >= TIMINGS_WINDOW) continue;
    counts.set(record.name, count + 1);
    kept.push(record);
  }
  return kept.toReversed();
}

const statsOf = (summary: Summary | null): string =>
  summary === null
    ? DEMO_WORDS.nothingMeasured
    : DEMO_WORDS.stats(summary.p50, summary.p95, summary.samples);

function rowsOf(
  records: readonly MarkRecord[],
  doc: { liveBytes: number; plainBytes: number } | null,
): TimingsRow[] {
  const timings = timingsOf(lastOfEach(records), doc);
  const { size } = timings;
  return [
    { label: KEYSTROKE, stats: statsOf(timings.keystroke) },
    { label: PAGINATION, stats: statsOf(timings.pagination) },
    { label: ROUND_TRIP, stats: statsOf(timings.roundTrip) },
    {
      label: SIZE,
      stats:
        size === null
          ? DEMO_WORDS.nothingMeasured
          : DEMO_WORDS.bytes(size.liveBytes / 1000),
    },
  ];
}

const isSameRows = (a: readonly TimingsRow[], b: readonly TimingsRow[]) =>
  a.length === b.length &&
  a.every((row, i) => row.label === b[i]?.label && row.stats === b[i]?.stats);

/**
 * The four rows, read again when at least TIMINGS_REFRESH_MS has passed by `now` since they were last read; between
 * reads, and while they read the same, the same array, so a component may read it on every render. It tells nobody:
 * whoever draws it draws it again every TIMINGS_REFRESH_MS.
 */
export function createTimingsSource(options: {
  read: () => readonly MarkRecord[];
  doc: () => { liveBytes: number; plainBytes: number } | null;
  now: () => number;
}): Subscribable<TimingsRow[]> {
  const read = () => rowsOf(options.read(), options.doc());
  let rows = read();
  let readAt = options.now();
  return {
    get() {
      if (options.now() - readAt < TIMINGS_REFRESH_MS) return rows;
      readAt = options.now();
      const next = read();
      if (!isSameRows(next, rows)) rows = next;
      return rows;
    },
    subscribe: () => () => {},
  };
}
