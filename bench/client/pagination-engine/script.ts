// Screenplay scripts of a chosen length, cut from the seeded corpus.
import { toLayoutBlocks } from "@manent/pagination";
import type { LayoutBlock } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import { documentOfPages } from "../../corpus/documents.ts";

/**
 * The layout blocks of the corpus's seeded screenplay of `pages` pages on Letter (seed 1, sections of
 * 100 blocks). Throws RangeError for a count that is not a positive integer, or that no number of
 * blocks gives.
 */
export function scriptOfPages(pages: number): LayoutBlock[] {
  return toLayoutBlocks(
    blocksOf(
      documentOfPages({
        format: "screenplay",
        pages,
        seed: 1,
        sections: "even",
      }).doc,
    ),
  );
}
