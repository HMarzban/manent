// Jumpox — Spark & Looki, the book and its drafts.
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import {
  JUMPOX_CHAPTER_1,
  JUMPOX_CHAPTER_1_FIRST_OPENING,
  JUMPOX_PLATE_FIRST,
  JUMPOX_PLATE_NOW,
} from "../../content/small/index.ts";
import type { PageMeter, SeedLayout } from "../../generate/fit.ts";
import { LINES_PER_PAGE } from "../../generate/grammar.ts";
import {
  JUMPOX_GUIDE,
  SeedBuildError,
  checkGenerated,
  createUsedLines,
  generateChapter,
} from "../../generate/index.ts";
import type { Rng } from "../rng.ts";
import type { SeedStep } from "../seed.ts";
import {
  checkPassages,
  createProject,
  createStory,
  projectEntry,
  replaySessions,
  sessionTimes,
  setFormat,
} from "../story.ts";
import type { StoryDoc } from "../story.ts";

const PROJECT = "small/jumpox";
const BOOK = `${PROJECT}/manuscript`;
const LAYOUT: SeedLayout = {
  format: "manuscript",
  settings: {},
  anchors: null,
};
const BOOK_PAGES = 291;
const CHAPTERS = 24;
const CHAPTER_WORDS = 3000;
/** The chapters written before the opening chapters went to Nell. */
const OPENING_CHAPTERS = 3;
/** The chapters the second pass revises, one session each but the first, which takes two. */
const SECOND_PASS: readonly (readonly number[])[] = [
  [2, 3],
  [1],
  [4],
  [5],
  [6],
];

/** The book as each of its drafts holds it, a chapter to an entry. */
interface Book {
  first: readonly SeedBlock[][];
  /** After each session of the second pass, the last being Working. */
  passes: readonly (readonly SeedBlock[][])[];
  /** Chapter one as Working prints it, which the server checks. */
  opening: SeedPassage;
}

const only = (source: string): SeedBlock => parseSeedText(source).blocks[0]!;

const words = (blocks: readonly SeedBlock[]): number =>
  blocks.reduce(
    (sum, b) => sum + b.text.split(" ").filter((w) => w !== "").length,
    0,
  );

/** Chapter one as the first draft had it: its first paragraph and its brass plate as they were. */
function firstChapterOne(now: readonly SeedBlock[]): SeedBlock[] {
  const plate = only(JUMPOX_PLATE_NOW).text;
  const opening = now.findIndex((b) => b.element === "body");
  return now.map((block, i) => {
    if (i === opening) return only(JUMPOX_CHAPTER_1_FIRST_OPENING);
    return block.text === plate ? only(JUMPOX_PLATE_FIRST) : block;
  });
}

/** The last sentence of a paragraph of several; undefined for any other block. */
const lastOf = (block: SeedBlock): string | undefined =>
  block.element === "body"
    ? JUMPOX_GUIDE.sentences.find((s) => block.text.endsWith(` ${s.text}`))
        ?.text
    : undefined;

/**
 * The chapter with the last sentence of its first paragraph of several moved to the paragraph's start: a pass
 * that changes no length, so no sentence comes nearer its last use.
 */
function revised(chapter: readonly SeedBlock[]): SeedBlock[] {
  const at = chapter.findIndex((block) => lastOf(block) !== undefined);
  if (at < 0) return [...chapter];
  const block = chapter[at]!;
  const last = lastOf(block)!;
  const text = `${last} ${block.text.slice(0, -last.length - 1)}`;
  return chapter.with(at, { ...block, text });
}

/** The chapter with only the first `kept` paragraphs after its break, then its ledger entry and closing line. */
function shortened(chapter: readonly SeedBlock[], kept: number): SeedBlock[] {
  const gap = chapter.findIndex((b) => b.element === "break");
  const quote = chapter.findIndex((b) => b.element === "quote");
  return [...chapter.slice(0, gap + 1 + kept), ...chapter.slice(quote)];
}

/**
 * The last chapter cut so that it fills `pages` pages, measured alone (each chapter starts a page), keeping as many
 * paragraphs as it can while no sentence of the book after `before` comes back within ten pages.
 */
async function lastChapterOf(
  chapter: readonly SeedBlock[],
  options: { pages: number; before: readonly SeedBlock[]; meter: PageMeter },
): Promise<SeedBlock[]> {
  const { pages, before, meter } = options;
  const pagesWith = async (kept: number) =>
    (await meter.pages(shortened(chapter, kept), LAYOUT)).length;
  const repeats = (kept: number) =>
    checkGenerated(
      [...before, ...shortened(chapter, kept)],
      JUMPOX_GUIDE,
      LINES_PER_PAGE.manuscript,
    ).some((issue) => issue.code === "repeated_sentence");
  let kept =
    chapter.findIndex((b) => b.element === "quote") -
    chapter.findIndex((b) => b.element === "break") -
    1;
  while (kept >= 0 && (await pagesWith(kept)) > pages) kept -= 1;
  for (; kept >= 0 && (await pagesWith(kept)) === pages; kept -= 1)
    if (!repeats(kept)) return shortened(chapter, kept);
  throw new SeedBuildError(
    "unfit",
    `${JUMPOX_GUIDE.project}: ${BOOK_PAGES} pages`,
  );
}

async function buildBook(meter: PageMeter, rng: Rng): Promise<Book> {
  const used = createUsedLines();
  const opening = parseSeedText(JUMPOX_CHAPTER_1);
  for (const block of opening.blocks) used.pass(block);
  const first = [firstChapterOne(opening.blocks)];
  for (let n = 2; n < CHAPTERS; n += 1)
    first.push(generateChapter(JUMPOX_GUIDE, n, CHAPTER_WORDS, rng, used));
  // the last chapter is written a page longer than the book still needs, at the rate the others print, then cut
  const before = (await meter.pages(first.flat(), LAYOUT)).length;
  const generated = first.slice(1).flat();
  const perPage =
    words(generated) / (before - (await meter.pages(first[0]!, LAYOUT)).length);
  const lastWords = Math.round((BOOK_PAGES - before + 1) * perPage);
  first.push(generateChapter(JUMPOX_GUIDE, CHAPTERS, lastWords, rng, used));
  const passes: SeedBlock[][][] = [];
  let book = first;
  for (const chapters of SECOND_PASS) {
    book = book.map((chapter, i) => {
      if (!chapters.includes(i + 1)) return chapter;
      return i === 0 ? [...opening.blocks] : revised(chapter);
    });
    passes.push(book);
  }
  const rest = book.slice(0, -1).flat();
  const last = await lastChapterOf(book.at(-1)!, {
    pages: BOOK_PAGES - (await meter.pages(rest, LAYOUT)).length,
    before: rest,
    meter,
  });
  const cut = (draft: readonly SeedBlock[][]) => [...draft.slice(0, -1), last];
  const working = cut(book);
  if ((await meter.pages(working.flat(), LAYOUT)).length !== BOOK_PAGES)
    throw new SeedBuildError(
      "unfit",
      `${JUMPOX_GUIDE.project}: ${BOOK_PAGES} pages`,
    );
  return { first: cut(first), passes: passes.map(cut), opening };
}

export const JUMPOX: SeedStep = {
  id: "jumpox",
  workspace: "small",
  background: false,
  async run(context) {
    const entries = [projectEntry(PROJECT)];
    const { driver, rng, ids } = context;
    if (driver === null) return entries;
    const story = createStory(context, "jumpox");
    const book = await buildBook(story.meter, rng);
    const doc: StoryDoc = { blocks: [], ids: [] };
    const writing = { userId: "sam", key: BOOK, doc, ids };
    await story.at("D−120");
    await createProject(driver, {
      userId: "sam",
      projectKey: PROJECT,
      at: context.time.at("D−120"),
    });
    const headings = book.first.map((chapter) => chapter[0]!);
    await story.sessionWith("sam", BOOK, async (s) => {
      await setFormat(context, s, BOOK);
      doc.ids.push(...(await story.write(s, headings, null, ids)));
      doc.blocks.push(...headings);
    });
    const opening = book.first.flatMap((chapter, i) =>
      i < OPENING_CHAPTERS ? chapter : [chapter[0]!],
    );
    await replaySessions(story, writing, opening, sessionTimes(118, 61, 22));
    await story.at("D−60");
    await story.name("sam", BOOK, "Opening chapters (for Nell)");
    await replaySessions(
      story,
      writing,
      book.first.flat(),
      sessionTimes(56, 11, 31),
    );
    await story.at("D−10 17:30");
    await story.name("sam", BOOK, "First draft");
    for (const [i, at] of sessionTimes(3, 0, book.passes.length).entries())
      await replaySessions(story, writing, book.passes[i]!.flat(), [at]);
    await checkPassages(
      driver,
      { key: BOOK, doc, where: JUMPOX_GUIDE.project },
      [book.opening],
    );
    return entries;
  },
};
