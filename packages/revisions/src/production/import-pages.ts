// The page starts an imported file locked, and which of those pages an edit touches.
import { toLockTable } from "@manent/pagination";
import type { LockAnchor, LockAnchorRecord } from "@manent/pagination";
import { FALLBACK_IDS, QUOTE_UNITS } from "./model.ts";

/** An anchor's page as the indexes, in the order before a change, of its first and last block. */
interface PageSpan {
  readonly anchor: LockAnchor;
  readonly first: number;
  readonly last: number;
}

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;

function quoteAt(text: string, offset: number): string {
  let end = Math.min(text.length, offset + QUOTE_UNITS);
  if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) end--;
  return text.slice(offset, end);
}

/**
 * Lock records for imported page starts: level 1, order 1…n, source "import", quote and fallback ids as captureAnchors makes them.
 * Throws RangeError for a start on a block the blocks do not hold.
 */
export function importAnchors(
  blocks: readonly { id: string; text: string }[],
  starts: readonly { label: string; blockId: string; offset: number }[],
): LockAnchorRecord[] {
  const at = new Map(blocks.map((block, i) => [block.id, i]));
  const indexOf = (blockId: string): number => {
    const i = at.get(blockId);
    if (i === undefined)
      throw new RangeError(
        `a page start must name a block of the script, not ${blockId}`,
      );
    return i;
  };
  return starts.map((start, k) => {
    const first = indexOf(start.blockId);
    const next = starts[k + 1];
    const end =
      next === undefined
        ? blocks.length
        : indexOf(next.blockId) + (next.offset > 0 ? 1 : 0);
    return {
      level: 1,
      order: k + 1,
      label: start.label,
      blockId: start.blockId,
      offset: start.offset,
      quote: quoteAt(blocks[first]!.text, start.offset),
      fallbackIds: blocks
        .slice(first + 1, Math.min(end, first + 1 + FALLBACK_IDS))
        .map((block) => block.id),
      source: "import",
    };
  });
}

/**
 * The labels of import anchors whose page a change touched, judged over `before`, the block order before the change: a page holds
 * the blocks from its anchor's block up to, and with an offset above 0 including, the next anchor's block; an insert counts on the
 * page of the block it follows (an `after` naming a block inserted earlier in the same change, on that block's page).
 */
export function touchedImportPages(
  before: readonly string[],
  records: readonly LockAnchorRecord[],
  change: {
    inserted: readonly { id: string; after: string | null }[];
    changed: readonly string[];
    removed: readonly string[];
  },
): string[] {
  const at = new Map(before.map((id, i) => [id, i]));
  const anchors = toLockTable(records).anchors.filter((anchor) =>
    at.has(anchor.blockId),
  );
  const pages = anchors.map((anchor, k): PageSpan => {
    const next = anchors[k + 1];
    return {
      anchor,
      first: at.get(anchor.blockId)!,
      last:
        next === undefined
          ? before.length - 1
          : at.get(next.blockId)! - (next.offset > 0 ? 0 : 1),
    };
  });
  const holding = (i: number | undefined): PageSpan[] =>
    i === undefined
      ? []
      : pages.filter((page) => page.first <= i && i <= page.last);
  const touched = new Set<PageSpan>();
  for (const id of [...change.changed, ...change.removed])
    for (const page of holding(at.get(id))) touched.add(page);
  // An insert follows a block's end, on the last page that holds it; one at the start is on the first page.
  const pageOf = new Map<string, PageSpan>();
  for (const { id, after } of change.inserted) {
    const page =
      after === null
        ? holding(0)[0]
        : (pageOf.get(after) ?? holding(at.get(after)).at(-1));
    if (page === undefined) continue;
    pageOf.set(id, page);
    touched.add(page);
  }
  return pages
    .filter((page) => touched.has(page) && page.anchor.source === "import")
    .map((page) => page.anchor.label);
}
