// The Long Night's drafts: the White production draft, fitted to its pages, and the drafts that led to it.
import type { SeedBlock } from "../../content/markup.ts";
import { LONG_NIGHT_GUIDE as GUIDE } from "../../generate/banks/medium/the-long-night.ts";
import { deriveDrafts } from "../../generate/drafts.ts";
import { fitToPages, intentsOf, unitsIn } from "../../generate/fit.ts";
import type { FitRange } from "../../generate/fit.ts";
import { createUsedLines, generateScenes } from "../../generate/grammar.ts";
import type { UsedLines } from "../../generate/grammar.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import type { Beat } from "../../generate/guide.ts";
import {
  KEY,
  WHITE,
  isHeading,
  replaced,
  sceneOf,
} from "./long-night-telling.ts";
import type { Telling } from "./long-night-telling.ts";

const DRAFTS = [
  { name: "First draft", pages: 106 },
  { name: "Second draft", pages: 114 },
  { name: "Table read draft", pages: 113 },
  { name: "Shooting draft", pages: 112 },
] as const;
/** The pages the fixed opening fills before the first generated scene. */
const OPENING_PAGES = 5;
/** Actions the beats never draw, kept for the fits and the earlier drafts to add. */
const RESERVE = 70;
const CAST_WORDS = new Set(
  GUIDE.cast.flatMap((c) => `${c.cue} ${c.name}`.toLowerCase().split(/[\s.]+/)),
);

/** An action that names nobody: no capital after its first word, which is no cast name. */
const isNameless = (text: string): boolean =>
  !/\s\p{Lu}/u.test(text) &&
  !CAST_WORDS.has(
    text
      .split(" ")[0]!
      .toLowerCase()
      .replace(/['’]s$/, ""),
  );

/** The beat cut into runs of whole scenes over whole pages, each its own draw. */
function chunksOf(beat: Beat): Beat[] {
  const scenes = beat.scenes[1] - beat.scenes[0] + 1;
  const pages = beat.pages[1] - beat.pages[0] + 1;
  const count = Math.min(scenes, pages);
  const cut = (n: number, k: number) => Math.round((k * n) / count);
  return Array.from({ length: count }, (_, k) => ({
    ...beat,
    scenes: [
      beat.scenes[0] + cut(scenes, k),
      beat.scenes[0] + cut(scenes, k + 1) - 1,
    ],
    pages: [
      beat.pages[0] + cut(pages, k),
      beat.pages[0] + cut(pages, k + 1) - 1,
    ],
    // each scene keeps the place it has in the whole beat
    places: beat.places.map(
      (_place, i) => beat.places[(cut(scenes, k) + i) % beat.places.length]!,
    ),
  }));
}

/**
 * Every beat's scenes, drawn into one record of the document's lines that never draws the reserve; every text
 * drawn is also kept in the telling's used set, which the fits draw clear of.
 */
function generated(t: Telling): SeedBlock[] {
  const reserve = new Set(GUIDE.action.filter(isNameless).slice(-RESERVE));
  const lines = createUsedLines();
  const placed = (text: string): void => {
    lines.add(text);
    t.used.add(text);
  };
  const used: UsedLines = {
    ...lines,
    has: (text, window) => reserve.has(text) || lines.has(text, window),
    add: placed,
    // the bank holds too few speeches for 106 pages of new ones: a speech comes back ten pages on, as an action does
    addDialogue: placed,
  };
  const beats = GUIDE.beats.filter((b) => b.id.startsWith(`${KEY}#`));
  // a page two beats share is drawn for once, by the first; the opening fills the first five
  let last = OPENING_PAGES;
  const owned = beats.map((beat): Beat => {
    const first = Math.min(Math.max(beat.pages[0], last + 1), beat.pages[1]);
    last = beat.pages[1];
    return { ...beat, pages: [first, beat.pages[1]] };
  });
  return owned
    .flatMap(chunksOf)
    .flatMap((chunk) => generateScenes(GUIDE, chunk, t.context.rng, used));
}

/** Each scene's blocks, from its heading to the next. */
function scenesOf(blocks: readonly SeedBlock[]): SeedBlock[][] {
  const scenes: SeedBlock[][] = [];
  for (const block of blocks)
    if (isHeading(block) || scenes.length === 0) scenes.push([block]);
    else scenes.at(-1)!.push(block);
  return scenes;
}

const startOf = (page: string, blockIndex: number) => ({ page, blockIndex });

/** Where the White draft's generated text is fitted: pages 17, 21, 22 and 64 start where Blue and Pink need them. */
function rangesOf(blocks: readonly SeedBlock[], t: Telling): FitRange[] {
  const h = (n: number) => blocks.indexOf(t.headings[n - 1]!);
  const p16 = blocks.indexOf(t.texts.p16.blocks[0]!);
  const p17 = blocks.indexOf(t.texts.p17White.blocks[0]!);
  return [
    { generated: [h(7), p16], mustStart: startOf("17", p17) },
    { generated: [h(27), h(29)], mustStart: startOf("21", h(29)) },
    { generated: [h(29) + 1, h(30)], mustStart: startOf("22", h(30)) },
    { generated: [h(30), h(64)], mustStart: startOf("64", h(64)) },
    { generated: [h(64), blocks.length], mustStart: null },
  ];
}

/** The draft with "stairwel" in an action on page 33, the typo Priya fixes in Blue. */
async function withTypo(t: Telling, blocks: SeedBlock[]): Promise<SeedBlock[]> {
  const pages = await t.driver.meter.pages(blocks, WHITE);
  const page = pages.findIndex((p) => p.label === "33");
  const from = pages[page]!.blockIndex;
  const to = pages[page + 1]!.blockIndex - 1;
  const actions = blocks.flatMap((b, i) =>
    i > from && i < to && b.element === "action" && !t.fixed.has(b) ? [i] : [],
  );
  const has = (i: number) => blocks[i]!.text.includes("stairwell");
  const at = actions.find(has) ?? actions[0];
  const spare = GUIDE.action.find(
    (text) => text.includes("stairwell") && !t.used.has(text),
  );
  const text = at !== undefined && has(at) ? blocks[at]!.text : spare;
  if (at === undefined || text === undefined)
    throw new SeedBuildError("unfit", `${GUIDE.project}: page 33`);
  t.used.add(text);
  const typo = { ...blocks[at]!, text: text.replace("stairwell", "stairwel") };
  t.fixed.add(typo);
  return replaced(blocks, [at, at + 1], [typo]);
}

/** The White production draft: fixed text and generated scenes fitted to 112 pages, with a typo on page 33. */
export async function whiteDraft(t: Telling): Promise<SeedBlock[]> {
  const { opening, p3White, p16, p17White, blue29 } = t.texts;
  const p3 = [opening.marked[0]! - 1, opening.marked.at(-1)! + 1] as const;
  const white = replaced(opening.blocks, p3, p3White.blocks);
  // generated scenes from 7; 24 to 26 are fixed, and 29 keeps the heading Blue revises
  const scenes = scenesOf(generated(t));
  const run = (from: number, to: number) =>
    scenes.slice(from - 7, to - 6).flat();
  const heading29 = blue29.blocks[0]!;
  const fixed = [...white, ...p16.blocks, ...p17White.blocks, heading29];
  const blocks = [
    ...white,
    ...run(7, 23),
    ...p16.blocks,
    ...p17White.blocks,
    ...run(27, 28),
    heading29,
    ...scenes[29 - 7]!.slice(1),
    ...run(30, 96),
  ];
  for (const block of fixed) t.fixed.add(block);
  t.headings = blocks.filter(isHeading);
  const fit = (from: readonly SeedBlock[]) =>
    fitToPages(from, rangesOf(from, t), {
      meter: t.driver.meter,
      guide: GUIDE,
      rng: t.context.rng,
      used: t.used,
      totals: [{ layout: WHITE, pages: 112 }],
    });
  // the typo may move a break after it, so the draft is fitted again
  return fit(await withTypo(t, await fit(blocks)));
}

/** The drafts before White, and the lines of scene 61 Sam cuts from the Second draft for pace. */
export interface Drafts {
  first: SeedBlock[];
  second: SeedBlock[];
  tableRead: SeedBlock[];
  pace: ReadonlySet<SeedBlock>;
}

export async function earlierDrafts(
  t: Telling,
  white: readonly SeedBlock[],
): Promise<Drafts> {
  const song = sceneOf(white, t.headings[60]!);
  const held = white.flatMap((b, i) =>
    t.fixed.has(b) || (i >= song[0] && i < song[1]) ? [i] : [],
  );
  const drafts = await deriveDrafts(white, DRAFTS, {
    fixed: new Set(held),
    guide: GUIDE,
    rng: t.context.rng,
    meter: t.driver.meter,
    layout: WHITE,
  });
  const [first, second, tableRead] = [drafts[0]!, drafts[1]!, drafts[2]!];
  for (const block of [...first, ...second, ...tableRead])
    t.used.add(block.text);
  const [from, to] = sceneOf(second, t.headings[60]!);
  const units = unitsIn(second, from + 1, to, {
    intentOf: intentsOf(GUIDE),
    movable: () => true,
  });
  const cut =
    units.findLast((u) => second[u.from]!.element === "character") ??
    units.at(-1)!;
  const pace = new Set(second.slice(cut.from, cut.to));
  return { first, second, tableRead, pace };
}
