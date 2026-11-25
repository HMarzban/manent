// Rundown corpora: news rundowns of 20, 80 and 300 rows, and the 20-segment daily show.
import { documentOfPages } from "./documents.ts";
import type { CorpusDocument } from "./documents.ts";
import { storySet } from "./stories.ts";

export const RUNDOWN_ROWS = [20, 80, 300] as const;

const HEADER_EVERY = 10;
const SEGMENT_COUNT = 20;
const SEGMENT_MAX_PAGES = 5;

export interface CorpusRow {
  kind: "story" | "header";
  title: string;
  /** Index into `CorpusRundown.stories`; null for a header. */
  story: number | null;
}

export interface CorpusRundown {
  rows: CorpusRow[];
  stories: CorpusDocument[];
}

/**
 * News rundown of `rows` rows: row 1 and every tenth row after it are headers; the remaining rows
 * link in order to `storySet({ rows, seed })`'s documents.
 */
export function storyRundown(options: {
  rows: (typeof RUNDOWN_ROWS)[number];
  seed: number;
}): CorpusRundown {
  const pool = storySet({ rows: options.rows, seed: options.seed });
  const rows: CorpusRow[] = [];
  const stories: CorpusDocument[] = [];
  let headerNumber = 0;
  for (let i = 0; i < options.rows; i++) {
    if (i % HEADER_EVERY === 0) {
      headerNumber += 1;
      rows.push({
        kind: "header",
        title: `Block ${headerNumber}`,
        story: null,
      });
    } else {
      const storyIndex = stories.length;
      const doc = pool[storyIndex];
      if (doc === undefined)
        throw new RangeError(`storySet produced too few stories for row ${i}`);
      stories.push(doc);
      rows.push({
        kind: "story",
        title: `Story ${storyIndex + 1}`,
        story: storyIndex,
      });
    }
  }
  return { rows, stories };
}

/** Daily show rundown: 20 story rows of 1–5 variety pages each, with no header rows. */
export function segmentRundown(options: { seed: number }): CorpusRundown {
  const rows: CorpusRow[] = [];
  const stories: CorpusDocument[] = [];
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    stories.push(
      documentOfPages({
        format: "variety",
        pages: 1 + (i % SEGMENT_MAX_PAGES),
        seed: options.seed + i,
        sections: "even",
      }),
    );
    rows.push({
      kind: "story",
      title: `Segment ${i + 1}`,
      story: i,
    });
  }
  return { rows, stories };
}
