// What each of Lanternfield Studios' documents holds and how its history goes; the studio's step loads it when it runs.
import type { BlockType } from "@manent/schema";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import * as banks from "../../generate/banks/heavy/index.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import type { PageMeter } from "../../generate/fit.ts";
import {
  GENERATED_REPEAT_PAGES,
  LINES_PER_PAGE,
  createUsedLines,
  freeAction,
  generateChapter,
  generateScenes,
} from "../../generate/grammar.ts";
import type { UsedLines } from "../../generate/grammar.ts";
import { SeedBuildError, guideLines, isGuideOf } from "../../generate/guide.ts";
import type { ProseGuide, StyleGuide } from "../../generate/guide.ts";
import type { WriterLine } from "../../writers/region.ts";
import type { SeedDoc } from "../catalogue.ts";
import type { Rng } from "../rng.ts";
import type { SeedTime } from "../time.ts";
import {
  NEWSCAST_DAYS,
  isLiveShow,
  liveLines,
  liveScript,
} from "./studio-live.ts";
import { castAround, textsNear } from "./studio-pages.ts";

// the share of its pages a document is written at: the largest its bank fills without repeating a line
const SHARES = [1, 0.75, 0.5, 0.35, 0.25, 0.15, 0.1] as const;
const NED_BOOK_WORDS = 3_400;
// what a variety script calls the elements a screen scene is written in
const VARIETY: Partial<Record<BlockType, BlockType>> = {
  scene_heading: "slug",
  action: "general",
};

/** The project's code in the studio's list ("H05"), from a project or document key. */
export function codeOf(key: string): string {
  return key.split("/")[1]!.toUpperCase();
}

function block(element: BlockType, text: string): SeedBlock {
  return { element, text, marks: [], kind: null };
}

/** The long book's guide, whose chapters are written one at a time as the book is fitted to its pages. */
export const BOOK = banks.KEEPER_PROSE;

/**
 * A writer of the long book's chapters, one at a time with `rng`: each keeps its sentences clear of their last
 * use by the generator's rule and by `spare` pages more, which cutting it to length may take out.
 */
export function bookChapters(
  rng: Rng,
): (number: number, words: number, spare: number) => SeedBlock[] {
  const used = createUsedLines();
  return (number, words, spare) => {
    const lines = spare * LINES_PER_PAGE.manuscript;
    const clear: UsedLines = {
      ...used,
      has: (text, window) => used.has(text, window + lines),
    };
    return generateChapter(BOOK, number, words, rng, clear);
  };
}

/** How many of `blocks` each of `sessions` write sessions adds, in document order, as even as they divide. */
export function writeCounts(
  blocks: readonly SeedBlock[],
  sessions: number,
): number[] {
  return sessionsBetween([], blocks, sessions).map((run) => run.length);
}

/**
 * An action the document's guide holds for the place `at` of `blocks`, naming nobody but the cast of its scene;
 * none of the blocks within GENERATED_REPEAT_PAGES pages of it holds the same. Null when there is none.
 */
export function revisedAction(
  doc: SeedDoc,
  blocks: readonly SeedBlock[],
  at: number,
  rng: Rng,
): SeedBlock | null {
  const guide = guideOf(doc);
  if (guide === null) return null;
  const window = GENERATED_REPEAT_PAGES * LINES_PER_PAGE[guide.format];
  const near = textsNear(blocks, at, window);
  const cues = castAround(guide, blocks, at);
  const text = freeAction(guide, cues, rng, { has: (t) => near.has(t) });
  return text === null ? null : block("action", text);
}

// each project's own screen guide before the development slate's
const GUIDES: readonly StyleGuide[] = Object.freeze([
  banks.NED_ASHBY_GUIDE,
  banks.EMBER_FLEET_GUIDE,
  banks.KEEPER_GUIDE,
  banks.WARD_NINE_GUIDE,
  banks.LARCH_ROAD_GUIDE,
  banks.MOSS_AND_PEBBLE_GUIDE,
  banks.DOWN_THE_TOLLE_GUIDE,
  ...banks.SLATE_GUIDES,
]);

/** The screen guide whose beats the document is written from; null for one written otherwise. */
export function guideOf(doc: SeedDoc): StyleGuide | null {
  return GUIDES.find((g) => isGuideOf(g, doc.key)) ?? null;
}

/** What a writer types in the document: a live show's news (liveLines), else its screen guide's lines (guideLines). */
export function linesOf(doc: SeedDoc): readonly WriterLine[] | null {
  const code = codeOf(doc.key);
  return isLiveShow(code) ? liveLines(doc, code) : guideLines(GUIDES, doc);
}

/** What `attempt` writes at the largest share its bank fills; the smallest share's error when none does. */
function largest<T>(attempt: (share: number) => T): T {
  for (const share of SHARES.slice(0, -1))
    try {
      return attempt(share);
    } catch (error) {
      const exhausted =
        error instanceof SeedBuildError && error.code === "generator_exhausted";
      if (!exhausted) throw error;
    }
  return attempt(SHARES.at(-1)!);
}

/** The document's beats, each written at the same share of its pages, all drawn through one record of its lines. */
const scenesOf = (guide: StyleGuide, doc: SeedDoc, rng: Rng): SeedBlock[] =>
  largest((share) => {
    const used = createUsedLines();
    return guide.beats.flatMap((beat) => {
      if (!beat.id.startsWith(`${doc.key}#`)) return [];
      const [first, last] = beat.pages;
      const end = first + Math.max(1, Math.round((last - first + 1) * share));
      const pages = [first, end - 1] as const;
      return generateScenes(guide, { ...beat, pages }, rng, used);
    });
  });

function chaptersOf(guide: ProseGuide, words: number, rng: Rng): SeedBlock[] {
  const used = createUsedLines();
  return guide.chapters.flatMap((c) =>
    generateChapter(guide, c.number, words, rng, used),
  );
}

/** An Ink story from scenes: a knot for each scene, each speech on one line after its speaker's name. */
function toInk(blocks: readonly SeedBlock[]): SeedBlock[] {
  let knots = 0;
  return blocks.flatMap((b, i) => {
    if (b.element === "character") return [];
    const text =
      b.element === "scene_heading"
        ? `=== scene_${(knots += 1)} ===`
        : b.element === "dialogue"
          ? `${blocks[i - 1]!.text}: ${b.text}`
          : b.text;
    return [block("ink_line", text)];
  });
}

/**
 * Everything the document at `index` of its project holds once its history is written: none for one its
 * project's beats leave out, and none for the long book, which is written as it is fitted to its pages.
 */
const HEAVY_STAGE_PLAY = `
act_break ACT ONE
scene_heading Scene 1: The Signal Room
action *A high stone chamber above the outer harbour. Brass levers along the south wall, a tin kettle steaming on a ring, and fog pressing hard against the tall glass.*
character MARTHA
dialogue Three rings from the outer bell, Arthur. That means the mail boat is turning back.
character ARTHUR
parenthetical (checking the barometer)
dialogue She never turns back before ten. The glass has dropped half an inch since supper.
scene_heading Scene 2: The Steps
action *Dawn grey through the narrow doorway. MARTHA trims the spare wick while ARTHUR coils a wet hawser.*
character MARTHA
dialogue Leave the lamp burning till the relief boat clears the bar.
character ARTHUR
dialogue Always do. Someone has to keep the steps lit.
`;

export function blocksOf(doc: SeedDoc, index: number, rng: Rng): SeedBlock[] {
  const code = codeOf(doc.key);
  if (code === "H41") return [...parseSeedText(HEAVY_STAGE_PLAY).blocks];
  if (isLiveShow(code)) return liveScript(doc, code, index, rng);
  if (code === "H34")
    return largest((share) =>
      chaptersOf(banks.NED_PROSE, NED_BOOK_WORDS * share, rng),
    );
  const guide = guideOf(doc);
  const scenes = guide === null ? [] : scenesOf(guide, doc, rng);
  if (doc.format === "ink") return toInk(scenes);
  if (doc.format !== "variety") return scenes;
  const story = guide?.stories.find((s) => doc.key.endsWith(`/${s.slug}`));
  return [
    ...(story?.brackets ?? []).map((text) => block("bracket", text)),
    ...scenes.map((b) => ({ ...b, element: VARIETY[b.element] ?? b.element })),
  ];
}

/** Sessions spread over the days from `fromDay` to `toDay`: each writes the script's next blocks, or rewrites one. */
export interface Sessions {
  op: "write" | "revise";
  sessions: number;
  fromDay: number;
  toDay: number;
}

/**
 * One step of a document's history; a day is counted back from D, so D−40 is 40. An overflow is a session
 * that writes onto the locked page `on` until the page `want` starts.
 */
export type HistoryStep =
  | Sessions
  | { op: "name"; day: number; draft: string }
  | { op: "lock" | "issue"; day: number; by: string }
  | { op: "race"; day: number; clock: string; by: string; refused: string }
  | { op: "overflow"; day: number; on: string; want: string }
  | { op: "book"; day: number };

const spread =
  (op: Sessions["op"]) =>
  (sessions: number, fromDay: number, toDay: number): Sessions => ({
    op,
    sessions,
    fromDay,
    toDay,
  });
const write = spread("write");
const revise = spread("revise");
const actBy =
  (op: "lock" | "issue") =>
  (day: number, by: string): HistoryStep => ({ op, day, by });
const lock = actBy("lock");
const issue = actBy("issue");
const name = (day: number, draft: string): HistoryStep => ({
  op: "name",
  day,
  draft,
});
const overflow = (day: number, on: string, want: string): HistoryStep => ({
  op: "overflow",
  day,
  on,
  want,
});
// H01 is locked at page 37 of its 124, where its A-pages grow
const H01_LOCKED_PAGE = 37;
const H01_STATED_PAGES = 124;

/** H01's history in the `pages` it fills: its A-pages grow from page 37 of 124 scaled to them, page 1 at least. */
function h01(pages: number): readonly HistoryStep[] {
  const scaled = (H01_LOCKED_PAGE * pages) / H01_STATED_PAGES;
  const on = `${Math.max(1, Math.round(scaled))}`;
  return [
    write(120, 330, 41),
    lock(40, "priya"),
    revise(24, 39, 26),
    overflow(26, on, `${on}A`),
    issue(25, "priya"),
    revise(24, 24, 10),
    issue(9, "priya"),
    revise(16, 8, 1),
    overflow(1, `${on}A`, `${on}AA`),
  ];
}

// the fourth season: three shot, one at Pink, one at White with Blue in progress, three drafts, two outlines
function seasonFour(i: number): readonly HistoryStep[] {
  const s = 360 - 40 * i;
  const episodes: readonly (readonly HistoryStep[])[] = [
    [
      write(75, s, s - 90),
      lock(s - 91, "dana"),
      revise(12, s - 92, s - 110),
      issue(s - 111, "mateus-ferreira"),
      revise(8, s - 112, s - 125),
      name(s - 126, "As shot"),
    ],
    [
      write(75, 240, 150),
      lock(149, "dana"),
      revise(12, 148, 120),
      issue(119, "mateus-ferreira"),
      revise(10, 118, 1),
    ],
    [write(75, 200, 110), lock(109, "dana"), revise(20, 108, 1)],
    [
      write(25, 150, 110),
      name(109, "Writer's First"),
      write(25, 108, 60),
      name(59, "Studio draft"),
      write(25, 58, 3),
      name(2, "Network draft"),
    ],
    [
      write(35, 120, 70),
      name(69, "Writer's First"),
      write(30, 68, 10),
      name(9, "Studio draft"),
    ],
    [write(50, 90, 5), name(4, "Writer's First")],
    [],
  ];
  return episodes[Math.min(Math.max(i - 2, 0), episodes.length - 1)]!;
}

// the third season: four recorded, then 305's nightly drafts on the three days before D, then three in writing
function seasonThree(i: number): readonly HistoryStep[] {
  if (i < 4) return [write(60, 300 - 40 * i, 230 - 40 * i)];
  if (i > 4) return [write(60 - 5 * i, 100, 1)];
  return [
    write(45, 40, 4),
    write(4, 3, 3),
    name(3, "Table draft"),
    write(4, 2, 2),
    name(2, "Rehearsal draft"),
    write(4, 1, 1),
    name(1, "Network run-through draft"),
  ];
}

/** The epoch ms of `clock` on the day `day` days before D, or after it when `day` is negative. */
export const dayAt = (time: SeedTime, day: number, clock: string): number =>
  time.at(`D${day > 0 ? `-${day}` : day < 0 ? `+${-day}` : ""} ${clock}`);

/** The histories of the projects that have one of their own, by the document's place `i` in its project. */
const HISTORIES: Readonly<
  Record<string, (i: number) => readonly HistoryStep[]>
> = {
  H03: () => [
    write(100, 320, 61),
    name(60, "Writer's First"),
    write(41, 59, 13),
    name(12, "Studio draft"),
  ],
  H05: () => [
    write(200, 420, 71),
    lock(70, "priya"),
    revise(16, 69, 53),
    issue(52, "priya"),
    revise(14, 51, 39),
    issue(38, "ruth-abendroth"),
    revise(13, 37, 25),
    {
      op: "race",
      day: 24,
      clock: "22:41",
      by: "ruth-abendroth",
      refused: "priya",
    },
    revise(16, 23, 1),
  ],
  H24: seasonFour,
  H25: seasonThree,
  H26: (i) => [write(28, 400 - 14 * i, 360 - 14 * i)],
  H30: (i) => [write(6, Math.max(10 - i, 1), Math.max(9 - i, 0))],
  H31: (i) => {
    const s = Math.max(NEWSCAST_DAYS[i]! + 1, 1);
    return [write(6, s, s - 1)];
  },
  H32: (i) =>
    i < 58 ? [write(14, 330 - 5 * i, 325 - 5 * i)] : [write(12, 8, 1)],
  H33: () => [{ op: "book", day: 200 }],
  H34: () => [write(320, 600, 30)],
  H35: () => [write(200, 300, 2)],
  H41: () => [write(3, 28, 12), name(10, "Rehearsal draft")],
};

/**
 * The document's history: its project's own, or the slate's 3 to 12 sessions over a few weeks. H01's follows the
 * pages its `blocks` fill as `meter` lays them out.
 */
export async function historyOf(
  doc: SeedDoc,
  i: number,
  rng: Rng,
  { blocks, meter }: { blocks: readonly SeedBlock[]; meter: PageMeter },
): Promise<readonly HistoryStep[]> {
  const code = codeOf(doc.key);
  if (code === "H01") {
    const layout = { format: doc.format, settings: {}, anchors: null };
    return h01((await meter.pages(blocks, layout)).length);
  }
  const own = HISTORIES[code]?.(i);
  if (own !== undefined) return own;
  const from = rng.int(40, 320);
  return [write(rng.int(3, 12), from, from - rng.int(5, 30))];
}
