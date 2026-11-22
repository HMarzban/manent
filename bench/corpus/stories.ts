// Sets of short story or segment documents, the pieces a newsroom's rundown orders.
import { UNITS_PER_LINE } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { createRng } from "@manent/demo";
import { corpusDocument, fewestBlocks } from "./documents.ts";
import type { CorpusDocument } from "./documents.ts";

export const STORY_SET_ROWS = [20, 80, 300] as const;
/** A story's length, drawn in tenths of a page. */
const STORY_TENTHS = { least: 2, most: 15 } as const;
/** The largest seed a story's generator is given. */
const STORY_SEED_MOST = 2 ** 31 - 1;

/** Pages filled, the last as the fraction of its lines in use. */
function lengthInPages(pagination: Pagination): number {
  const last = pagination.pages.at(-1)!;
  return (
    pagination.pages.length -
    1 +
    last.usedUnits / (UNITS_PER_LINE * pagination.profile.linesPerPage)
  );
}

/** Story or segment documents (format "variety") of 0.2–1.5 pages each; the rundown that orders them waits for its stage. */
export function storySet(options: {
  rows: (typeof STORY_SET_ROWS)[number];
  seed: number;
}): CorpusDocument[] {
  const rng = createRng(options.seed);
  return Array.from({ length: options.rows }, () => {
    const length = rng.int(STORY_TENTHS.least, STORY_TENTHS.most) / 10;
    const { blocks, pagination } = fewestBlocks(
      "variety",
      rng.int(1, STORY_SEED_MOST),
      (tried) => lengthInPages(tried) >= length,
    );
    // a fraction of a page counts as the page it starts
    return corpusDocument({
      format: "variety",
      blocks,
      pages: pagination.pages.length,
      sections: "even",
    });
  });
}
