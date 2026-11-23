// The stretch of a script a simulated writer types in, and where in it the next line may go: after a block
// it does not cut off from the block that follows.
import { readBlocks } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockType } from "@manent/schema";

/** What one burst types, each block after the one before: an action on its own, or a cue and its speech. */
export type WriterLine = readonly { element: BlockType; text: string }[];

/** A scene heading and the last block before the next one, or any first and last block. */
export interface Region {
  firstBlockId: string;
  lastBlockId: string;
}

/** How many blocks from where a line would go are looked at for a place it can stand. */
const LINE_SEARCH = 8;
/** Elements the block after them goes on from, and elements that go on from the block before them. */
const LEADS_ON: ReadonlySet<string> = new Set(["character", "parenthetical"]);
const GOES_ON: ReadonlySet<string> = new Set(["dialogue", "parenthetical"]);

/** The ids from the region's first block to its last, in document order; [] when either is gone. */
export function regionOf(
  order: readonly string[],
  region: Region | null,
): readonly string[] {
  if (region === null) return order;
  const first = order.indexOf(region.firstBlockId);
  const last = order.indexOf(region.lastBlockId);
  return first === -1 || last < first ? [] : order.slice(first, last + 1);
}

/**
 * The first block of `region` from the one at `from`, within LINE_SEARCH of it and never the region's last
 * (unless it is the only one), that neither leads on to the block after it nor is followed by one going on
 * from it, so that a line after it cuts no speech in two; null when there is none there.
 */
export function lineEndFrom(
  doc: CrdtDoc,
  region: readonly string[],
  from: number,
): string | null {
  const last = Math.max(region.length - 2, 0);
  const ids = region.slice(from, from + LINE_SEARCH + 1);
  const read = readBlocks(doc, new Set(ids));
  const elements = ids.map((id) => read.get(id)?.attrs?.type ?? "action");
  const at = elements.findIndex(
    (element, i) =>
      from + i <= last &&
      !LEADS_ON.has(element) &&
      !GOES_ON.has(elements[i + 1] ?? ""),
  );
  return at === -1 ? null : ids[at]!;
}
