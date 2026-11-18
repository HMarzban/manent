// The receipt of a reconnect: what it synced, what overlaps and what could not be placed.

import { formatCount } from "./format.ts";

/** The parts of a reconnect joined by " · ", a part of 0 left out. There is no count of anything lost: unplaced text is kept. */
export function receiptText(counts: {
  synced: number;
  overlaps: number;
  unplaced: number;
}): string {
  const { synced, overlaps, unplaced } = counts;
  const parts: string[] = [];
  if (synced > 0)
    parts.push(
      synced === 1
        ? "1 change synced"
        : `${formatCount(synced)} changes synced`,
    );
  if (overlaps > 0)
    parts.push(
      overlaps === 1
        ? "1 passage overlaps — review"
        : `${formatCount(overlaps)} passages overlap — review`,
    );
  if (unplaced > 0)
    parts.push(
      `${formatCount(unplaced)} could not be placed — kept in Recovered text`,
    );
  return parts.join(" · ");
}
