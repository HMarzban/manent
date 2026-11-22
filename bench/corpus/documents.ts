// Documents of the seeded corpus cut to a length in pages, in every format, counted in blocks.
import { paginate, profileFor, toLayoutBlocks } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import type { CorpusBlock, CorpusFormat } from "@manent/pagination/testing";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";

/** The lengths, in pages, that every format is generated at. */
export const CORPUS_PAGES = [30, 120, 300, 1000, 2000] as const;

export interface CorpusDocument {
  doc: DocJSON;
  format: CorpusFormat;
  pages: number;
  blocks: number;
  /** The blocks' text, in UTF-16 units. */
  characters: number;
  sections: number;
}

/**
 * The fewest blocks, at least one, of generateBlocks(format, n, seed) whose pagination on the
 * format's profile (Letter) `reaches`, and that pagination. The corpus grows by appending, so a test that holds once blocks are enough
 * to pass it keeps holding as more are added, and the count can be bisected.
 */
export function fewestBlocks(
  format: CorpusFormat,
  seed: number,
  reaches: (pagination: Pagination) => boolean,
): { blocks: CorpusBlock[]; pagination: Pagination } {
  const profile = profileFor(format);
  if (profile === null)
    throw new RangeError(`the ${format} format has no pages`);
  let blocks = generateBlocks(format, 1, seed);
  let layout = toLayoutBlocks(blocksOf(corpusDoc(blocks)));
  let pagination = paginate(layout, profile);
  while (!reaches(pagination)) {
    blocks = generateBlocks(format, blocks.length * 2, seed);
    layout = toLayoutBlocks(blocksOf(corpusDoc(blocks)));
    pagination = paginate(layout, profile);
  }
  // the fewest blocks that reach are more than `low` and at most `high`
  let high = blocks.length;
  let low = Math.floor(high / 2);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const tried = paginate(layout.slice(0, mid), profile);
    if (reaches(tried)) {
      high = mid;
      pagination = tried;
    } else low = mid;
  }
  return { blocks: blocks.slice(0, high), pagination };
}

/** `blocks` as a document: sections of 100 blocks ("even"), or all of them in one section ("one"). */
export function corpusDocument(options: {
  format: CorpusFormat;
  blocks: readonly CorpusBlock[];
  pages: number;
  sections: "even" | "one";
}): CorpusDocument {
  const { format, blocks, pages } = options;
  const even = corpusDoc(blocks);
  const doc: DocJSON =
    options.sections === "even"
      ? even
      : {
          type: "doc",
          content: [
            {
              type: "section",
              content: (even.content ?? []).flatMap(
                (section) => section.content ?? [],
              ),
            },
          ],
        };
  return {
    doc,
    format,
    pages,
    blocks: blocks.length,
    characters: blocks.reduce((sum, block) => sum + block.text.length, 0),
    sections: (doc.content ?? []).length,
  };
}

/**
 * The fewest blocks of generateBlocks(format, n, seed) that paginate to exactly `pages` on the format's profile (Letter).
 * RangeError for a count that is not a positive integer, or that no number of blocks gives.
 */
export function documentOfPages(options: {
  format: CorpusFormat;
  pages: number;
  seed: number;
  sections: "even" | "one";
}): CorpusDocument {
  const { format, pages, seed, sections } = options;
  if (!Number.isInteger(pages) || pages < 1)
    throw new RangeError(
      `a document needs a positive whole number of pages, not ${pages}`,
    );
  const { blocks, pagination } = fewestBlocks(
    format,
    seed,
    (tried) => tried.pages.length >= pages,
  );
  const found = pagination.pages.length;
  if (found !== pages)
    throw new RangeError(
      `no ${format} document of the corpus has ${pages} pages: ${blocks.length} blocks give ${found}`,
    );
  return corpusDocument({ format, blocks, pages, sections });
}
