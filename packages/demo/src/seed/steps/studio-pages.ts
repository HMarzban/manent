// The studio's documents written against the server's pages: the long book fitted to its 2,000, and a locked
// page written over until its A-page starts.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { SeedBlock } from "../../content/markup.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import type { SeedDoc } from "../catalogue.ts";
import type { SeedDriver, SeedSession } from "../driver.ts";
import type { SeedContext } from "../seed.ts";
import type * as Content from "./studio-content.ts";

/** One document as the step holds it: all it will hold, and how much of that is written. */
export interface Script {
  doc: SeedDoc;
  blocks: SeedBlock[];
  ids: string[];
  written: number;
}

/** What each document holds and how its history goes, loaded only when the step runs: the web app never carries the banks. */
export type Studio = typeof Content;

/** A document's history as it is replayed: the step's context and driver, the content module and the document. */
export interface Playback {
  context: SeedContext;
  driver: SeedDriver;
  studio: Studio;
  script: Script;
}

const BOOK_PAGES = 2_000;
const CHAPTER_WORDS = 5_625;
// the long book's last chapter is written a fifth longer than the pages left need, then cut back
const LAST_CHAPTER_SPARE = 1.2;
// the labels the long book's last chapters may start on, and the most pages one may fill
const CHAPTER_LABELS = [1_800, 2_050] as const;
const CHAPTER_PAGES = 120;
// two pages of the shortest actions: what a locked page takes at most before the page after it starts
const OVERFLOW_ACTIONS = 60;

const toJSON = (b: SeedBlock, id: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: b.element },
  ...(b.text === "" ? {} : { content: [{ type: "text", text: b.text }] }),
});

/** Writes the script's next `count` blocks after what is written. */
export async function append(
  session: SeedSession,
  script: Script,
  count: number,
): Promise<void> {
  const from = script.written;
  script.written = Math.min(script.blocks.length, from + count);
  const blocks = script.blocks
    .slice(from, script.written)
    .map((b, n) => toJSON(b, script.ids[from + n]!));
  const after = script.ids[from - 1] ?? null;
  if (blocks.length > 0)
    await session.change((doc) =>
      scriptBody(doc).write((w) => void w.insertBlocks(after, blocks)),
    );
}

const unfit = (studio: Studio) =>
  new SeedBuildError("unfit", `${studio.BOOK.project}: ${BOOK_PAGES} pages`);

const chaptersIn = (blocks: readonly SeedBlock[]): number[] =>
  blocks.flatMap((b, n) => (b.element === "chapter" ? [n] : []));

/** How many of the page starts hold: each the server's pages agree with is one disagreement fewer. */
async function agreeing(
  driver: SeedDriver,
  { doc, blocks, ids }: Script,
  pageStarts: { label: string; blockIndex: number }[],
) {
  const passage = { blocks, pageStarts, numbers: [], marked: [], omitted: [] };
  const off = await driver.check(doc.docId, passage, ids[0]!);
  return pageStarts.length - off.length;
}

/**
 * The pages before the long book's last chapter, and the pages through it, read from the server's pages: the
 * label the chapter starts on, entered once more for each label after the first so the agreement count names
 * it; then the labels from it on that start a page at one of the chapter's blocks.
 */
async function bookPages(studio: Studio, driver: SeedDriver, script: Script) {
  const at = chaptersIn(script.blocks).at(-1)!;
  const [lo, hi] = CHAPTER_LABELS;
  const start = (label: number) => ({ label: `${label}`, blockIndex: at });
  const opening = Array.from({ length: hi - lo + 1 }, (_, n) =>
    Array.from({ length: n + 1 }, () => start(lo + n)),
  ).flat();
  const found = await agreeing(driver, script, opening);
  if (found === 0) throw unfit(studio);
  const before = lo + found - 2;
  const own = Array.from({ length: CHAPTER_PAGES }, (_, n) =>
    script.blocks
      .slice(at)
      .map((_block, i) => ({ ...start(before + 1 + n), blockIndex: at + i })),
  ).flat();
  return { before, pages: before + (await agreeing(driver, script, own)) };
}

const wordsIn = (blocks: readonly SeedBlock[]): number =>
  blocks.reduce((sum, b) => sum + b.text.split(" ").length, 0);

/** Takes one paragraph or more from the end of the last chapter's second half, until about `words` are gone. */
async function cut(
  studio: Studio,
  s: SeedSession,
  script: Script,
  words: number,
) {
  const { blocks } = script;
  const quote = blocks.findLastIndex((b) => b.element === "quote");
  const first = blocks.findLastIndex((b) => b.element === "break") + 2;
  let at = quote;
  let gone = 0;
  while (at > first && (at === quote || gone < words)) {
    at -= 1;
    gone += wordsIn([blocks[at]!]);
  }
  if (at === quote) throw unfit(studio);
  blocks.splice(at, quote - at);
  const ids = script.ids.splice(at, quote - at);
  script.written = blocks.length;
  await s.change((doc) =>
    scriptBody(doc).write((w) => ids.forEach((id) => w.deleteBlock(id))),
  );
}

/** The words to a page of the last chapter, as the server lays it out. */
const perPage = (script: Script, read: { before: number; pages: number }) =>
  wordsIn(script.blocks.slice(chaptersIn(script.blocks).at(-1))) /
  (read.pages - read.before);

/**
 * Signe's one session: a push a chapter, the last written long for the pages left and then cut, by what its
 * own pages hold less one page each time, until the book ends on BOOK_PAGES.
 */
export async function writeBook(
  { context, driver, studio, script }: Playback,
  s: SeedSession,
): Promise<void> {
  const { rng } = context;
  const { chapters } = studio.BOOK;
  const used = new Set<string>();
  const chapter = async (number: number, words: number) => {
    const blocks = studio.bookChapter(number, words, rng, used);
    script.blocks.push(...blocks);
    script.ids.push(...blocks.map(() => context.ids()));
    await append(s, script, blocks.length);
  };
  for (const { number } of chapters.slice(0, -1))
    await chapter(number, CHAPTER_WORDS);
  const read = await bookPages(studio, driver, script);
  const left = (BOOK_PAGES - read.pages) * perPage(script, read);
  await chapter(chapters.at(-1)!.number, left * LAST_CHAPTER_SPARE);
  // each cut takes a paragraph at least, and the last chapter has only so many
  for (;;) {
    const now = await bookPages(studio, driver, script);
    if (now.pages === BOOK_PAGES) return;
    if (now.pages < BOOK_PAGES) throw unfit(studio);
    await cut(
      studio,
      s,
      script,
      (now.pages - BOOK_PAGES - 1) * perPage(script, now),
    );
  }
}

/** Whether the page `label` starts at one of the blocks from `from` up to, not including, `to`. */
const startsIn = async (
  driver: SeedDriver,
  script: Script,
  label: string,
  [from, to]: readonly [number, number],
): Promise<boolean> =>
  (await agreeing(
    driver,
    script,
    Array.from({ length: to - from }, (_, n) => ({
      label,
      blockIndex: from + n,
    })),
  )) > 0;

/** The block the page `label` starts at, found by halving the written blocks; null when no page has it. */
async function startOf(driver: SeedDriver, script: Script, label: string) {
  let [lo, hi] = [0, script.written];
  if (!(await startsIn(driver, script, label, [lo, hi]))) return null;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (await startsIn(driver, script, label, [lo, mid])) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * One session's writing onto the locked page `on`, an action at a time after the page's first block (after
 * its speech when that is a cue), until the page `want` starts. SeedBuildError "rules_broken" when `on` is no
 * page, or `want` has not started after OVERFLOW_ACTIONS actions.
 */
export async function overflow(
  { context, driver, studio, script }: Playback,
  s: SeedSession,
  { on, want }: { on: string; want: string },
  where: string,
): Promise<void> {
  const start = await startOf(driver, script, on);
  if (start === null)
    throw new SeedBuildError("rules_broken", `${where}: ${on}`);
  // a cue keeps its speech: the actions go after the speech
  const at = start + (script.blocks[start]!.element === "character" ? 1 : 0);
  for (let n = 0; n <= OVERFLOW_ACTIONS; n += 1) {
    if (await startsIn(driver, script, want, [0, script.written])) return;
    const held = new Set(script.blocks.map((b) => b.text));
    const action = studio.revisedAction(script.doc, held, context.rng);
    if (action === null) break;
    const [after, id] = [script.ids[at]!, context.ids()];
    script.blocks.splice(at + 1, 0, action);
    script.ids.splice(at + 1, 0, id);
    script.written += 1;
    await s.change((d) =>
      scriptBody(d).write(
        (w) => void w.insertBlocks(after, [toJSON(action, id)]),
      ),
    );
  }
  throw new SeedBuildError("rules_broken", `${where}: ${want}`);
}
