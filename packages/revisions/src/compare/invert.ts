// A comparison undone: the older version rebuilt from the newer one and what changed between them.
import { canonicalDoc, sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { canonicalBlocksOf, idOf } from "./align.ts";
import type { BlockEntry } from "./align.ts";
import type { Comparison } from "./comparison.ts";

/** Each block of `doc` by id; the first wins when an id repeats. */
function byId(doc: DocJSON): Map<string, BlockJSON> {
  const found = new Map<string, BlockJSON>();
  for (const block of canonicalBlocksOf(doc)) {
    const id = idOf(block);
    if (id !== null && !found.has(id)) found.set(id, block);
  }
  return found;
}

/**
 * `newer` with every entry of `c` undone, canonical: an unchanged block as
 * newer holds it, a changed or removed one as its entry's older side, an
 * added one left out, in older's order.
 */
export function invertComparison(newer: DocJSON, c: Comparison): DocJSON {
  const held = byId(newer);
  const olderOf = (entry: BlockEntry): BlockJSON | null =>
    entry.kind === "unchanged"
      ? (held.get(entry.id) ?? entry.older)
      : entry.older;
  const blocks = c.entries
    .flatMap((entry) => {
      const block = olderOf(entry);
      return block === null || entry.olderIndex === null
        ? []
        : [{ at: entry.olderIndex, block }];
    })
    .toSorted((x, y) => x.at - y.at)
    .map(({ block }) => block);
  return canonicalDoc(sectionize(blocks));
}
