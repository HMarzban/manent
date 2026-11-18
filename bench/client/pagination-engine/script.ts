// Screenplay scripts of a chosen length, cut from the seeded corpus.
import { paginate, profileFor } from "@manent/pagination";
import type { LayoutBlock } from "@manent/pagination";
import { generateBlocks, layoutBlocksOf } from "@manent/pagination/testing";

const corpus = (count: number): LayoutBlock[] =>
  layoutBlocksOf(generateBlocks("screenplay", count, 1));

/**
 * The fewest blocks, at least one, of the seeded screenplay corpus that paginate on Letter to exactly
 * `pages` pages. The corpus grows by appending, so the page count never falls as blocks are added and
 * the count can be bisected. Throws RangeError for a count that is not a positive integer, or that no
 * number of blocks gives.
 */
export function scriptOfPages(pages: number): LayoutBlock[] {
  if (!Number.isInteger(pages) || pages < 1)
    throw new RangeError(
      `a script needs a positive whole number of pages, not ${pages}`,
    );
  const profile = profileFor("screenplay")!;
  const pagesOf = (blocks: readonly LayoutBlock[]) =>
    paginate(blocks, profile).pages.length;
  let high = 1;
  while (pagesOf(corpus(high)) < pages) high *= 2;
  const blocks = corpus(high);
  // the fewest blocks that give `pages` pages are more than `low` and at most `high`
  let low = Math.floor(high / 2);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (pagesOf(blocks.slice(0, mid)) < pages) low = mid;
    else high = mid;
  }
  const script = blocks.slice(0, high);
  const found = pagesOf(script);
  if (found !== pages)
    throw new RangeError(
      `no script of the corpus has ${pages} pages: ${high} blocks give ${found}`,
    );
  return script;
}
