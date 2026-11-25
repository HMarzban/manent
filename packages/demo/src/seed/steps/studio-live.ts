// Lanternfield Studios' live shows: each segment's and newscast's news, and the anchor who reads it.
import type { SeedBlock } from "../../content/markup.ts";
import { LIVE_GUIDE } from "../../generate/banks/heavy/index.ts";
import { speechOf } from "../../generate/guide.ts";
import type { WriterLine } from "../../writers/region.ts";
import type { SeedDoc } from "../catalogue.ts";
import { HEAVY_DOCS } from "../catalogue-heavy.ts";
import type { Rng } from "../rng.ts";

const LIVE_SHOWS = ["H30", "H31"] as const;
type LiveShow = (typeof LIVE_SHOWS)[number];

const LIVE_LINES = 8;

// the day of each of Lannick Today's newscasts, counted back from D: the 13:00 before the 18:30
export const NEWSCAST_DAYS: readonly number[] = [
  7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, -1, -1, -2, -3, -4, -5, -7,
  -7,
];

export const isLiveShow = (code: string): code is LiveShow =>
  LIVE_SHOWS.some((show) => show === code);

/** Who reads the news of the live show `code`'s document at `index` of its project. */
const anchorOf = (code: LiveShow, index: number): string =>
  code === "H30" ? "BERTIE" : index % 2 === 0 ? "YARA" : "FELIX";

const block = (element: SeedBlock["element"], text: string): SeedBlock => ({
  element,
  text,
  marks: [],
  kind: null,
});

/**
 * The document at `index` of the live show `code`: its title, then the news of its day (any day's when it has
 * none) as its anchor reads it.
 */
export function liveScript(
  doc: SeedDoc,
  code: LiveShow,
  index: number,
  rng: Rng,
): SeedBlock[] {
  const day = code === "H30" ? 9 - index : NEWSCAST_DAYS[index]!;
  const label = day === 0 ? "D" : `D${day > 0 ? "−" : "+"}${Math.abs(day)}`;
  const { sentences } = LIVE_GUIDE;
  const ofDay = sentences.filter((s) => s.tags[0]?.split(" ")[0] === label);
  const pool = (ofDay.length > 0 ? ofDay : sentences).map((s) => s.text);
  const lines = Array.from({ length: Math.min(LIVE_LINES, pool.length) }, () =>
    block("dialogue", pool.splice(rng.int(0, pool.length - 1), 1)[0]!),
  );
  const cue = anchorOf(code, index);
  return [block("slug", doc.title), block("character", cue), ...lines];
}

/** What a writer types in a document of the live show `code`: its news, each sentence under the document's anchor. */
export function liveLines(doc: SeedDoc, code: LiveShow): WriterLine[] {
  const docs = HEAVY_DOCS.filter((d) => d.projectKey === doc.projectKey);
  const cue = anchorOf(
    code,
    docs.findIndex((d) => d.key === doc.key),
  );
  return LIVE_GUIDE.sentences.map((s) => speechOf(doc.format, cue, s.text));
}
