// How The Long Night's history is told: its passages, sittings replayed block by block, and fits under the lock.
import { scriptBody, scriptSettings } from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import type { LockAnchorRecord } from "@manent/sync-protocol";
import {
  LONG_NIGHT_BLUE_29,
  LONG_NIGHT_BLUE_LINES,
  LONG_NIGHT_P16_END,
  LONG_NIGHT_P17_BLUE,
  LONG_NIGHT_P17_WHITE,
  LONG_NIGHT_P3_WHITE,
  LONG_NIGHT_PAGES_1_5,
  LONG_NIGHT_PINK_29,
  LONG_NIGHT_PINK_64,
} from "../../content/medium/the-long-night.ts";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { LONG_NIGHT_GUIDE as GUIDE } from "../../generate/banks/medium/the-long-night.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import type { BlockChange } from "../../generate/drafts.ts";
import { fitAPages } from "../../generate/fit.ts";
import type { PageMeter, SeedLayout } from "../../generate/fit.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedDriver, SeedSession } from "../driver.ts";
import type { SeedContext } from "../seed.ts";
import type { Story } from "../story.ts";

export const KEY = "medium/the-long-night/script";
/** The script's layout before the lock: the screenplay's defaults. */
export const WHITE: SeedLayout = Object.freeze({
  format: "screenplay",
  settings: {},
  anchors: null,
});

const PASSAGES = {
  opening: LONG_NIGHT_PAGES_1_5,
  p3White: LONG_NIGHT_P3_WHITE,
  p16: LONG_NIGHT_P16_END,
  p17White: LONG_NIGHT_P17_WHITE,
  p17Blue: LONG_NIGHT_P17_BLUE,
  blueLines: LONG_NIGHT_BLUE_LINES,
  blue29: LONG_NIGHT_BLUE_29,
  pink29: LONG_NIGHT_PINK_29,
  pink64: LONG_NIGHT_PINK_64,
} as const;

/** The fixed text, passage by passage. */
export type Texts = Readonly<Record<keyof typeof PASSAGES, SeedPassage>>;

const read = (name: keyof typeof PASSAGES): SeedPassage =>
  parseSeedText(PASSAGES[name]);

/** Every passage, read once per seed, so each block is one object wherever the story meets it. */
export function readTexts(): Texts {
  return {
    opening: read("opening"),
    p3White: read("p3White"),
    p16: read("p16"),
    p17White: read("p17White"),
    p17Blue: read("p17Blue"),
    blueLines: read("blueLines"),
    blue29: read("blue29"),
    pink29: read("pink29"),
    pink64: read("pink64"),
  };
}

/** Telling the story: the driver, the generator's state and the script as the server holds it. */
export interface Telling {
  context: SeedContext;
  driver: SeedDriver;
  story: Story;
  texts: Texts;
  /** The script's blocks now, in order, as the story has written them. */
  state: SeedBlock[];
  used: Set<string>;
  /** Blocks no fit may take out: the fixed text, and what each revision wrote. */
  fixed: Set<SeedBlock>;
  /** The White draft's 96 scene headings, in order. */
  headings: SeedBlock[];
  /** The headings set omitted: production shows OMITTED, and their scenes take no room. */
  omitted: Set<SeedBlock>;
}

/** A person, and when they sit down to the script. */
export type Sitting = readonly [userId: string, at: string];

export const isHeading = (b: SeedBlock): boolean =>
  b.element === "scene_heading";

/** The blocks of `passage` in [from, to), with its checks moved to match. */
export function slice(
  passage: SeedPassage,
  from: number,
  to: number,
): SeedPassage {
  const inside = (i: number) => i >= from && i < to;
  const moved = <T extends { blockIndex: number }>(list: readonly T[]) =>
    list
      .filter((x) => inside(x.blockIndex))
      .map((x) => ({ ...x, blockIndex: x.blockIndex - from }));
  return {
    blocks: passage.blocks.slice(from, to),
    pageStarts: moved(passage.pageStarts),
    numbers: moved(passage.numbers),
    marked: passage.marked.filter(inside).map((i) => i - from),
    omitted: passage.omitted.filter(inside).map((i) => i - from),
  };
}

/** [heading, next heading) of the scene that `heading` opens. */
export function sceneOf(
  blocks: readonly SeedBlock[],
  heading: SeedBlock,
): [number, number] {
  const from = blocks.indexOf(heading);
  const to = blocks.findIndex((b, i) => i > from && isHeading(b));
  return [from, to === -1 ? blocks.length : to];
}

/** `script` with the blocks in [from, to) replaced by `blocks`. */
export const replaced = (
  script: readonly SeedBlock[],
  [from, to]: readonly [number, number],
  blocks: readonly SeedBlock[],
): SeedBlock[] => [...script.slice(0, from), ...blocks, ...script.slice(to)];

/** `older` as `passage` revises it: an unmarked block is the next block of `older` with its text; a marked one is new. */
export function revise(
  older: readonly SeedBlock[],
  passage: SeedPassage,
): SeedBlock[] {
  let from = 0;
  return passage.blocks.map((block, i) => {
    const at = passage.marked.includes(i)
      ? -1
      : older.findIndex(
          (b, j) =>
            j >= from && b.element === block.element && b.text === block.text,
        );
    if (at === -1) return block;
    from = at + 1;
    return older[at]!;
  });
}

export const keep = (t: Telling, blocks: readonly SeedBlock[]): void =>
  blocks.forEach((b) => t.fixed.add(b));

/** The ids of the session's blocks, which stand where the story's blocks stand. */
export function idsOf(s: SeedSession, state: readonly SeedBlock[]): string[] {
  const held = blocksOf(scriptBody(s.doc).materialize());
  const text = (i: number) => held[i]!.runs.map((run) => run.text).join("");
  const at = state.findIndex((b, i) => i >= held.length || text(i) !== b.text);
  if (at !== -1 || held.length !== state.length)
    throw new RangeError(
      `the script parts from the story at block ${at}, holding ${held.length} blocks for ${state.length}`,
    );
  return held.map((b) => b.attrs.id ?? "");
}

/** `changes`, positions in the script as sessionsBetween gives them, written in order in one sitting. */
export async function replay(
  t: Telling,
  s: SeedSession,
  changes: readonly BlockChange[],
): Promise<void> {
  const { state } = t;
  const id = idsOf(s, state);
  for (let i = 0; i < changes.length;) {
    const { at, op } = changes[i]!;
    if (op !== "insert") {
      const gone = id[at]!;
      await s.change((doc) =>
        scriptBody(doc).write((w) => void w.deleteBlock(gone)),
      );
      id.splice(at, 1);
      state.splice(at, 1);
    }
    if (op === "delete") {
      i += 1;
      continue;
    }
    // a rewrite, and the blocks added one after another behind it, go in as one write
    let end = i + 1;
    while (changes[end]?.op === "insert" && changes[end]!.at === at + end - i)
      end += 1;
    const run = changes
      .slice(i, end)
      .flatMap((c) => (c.op === "delete" ? [] : [c.block]));
    const after = id[at - 1] ?? null;
    id.splice(at, 0, ...(await t.story.write(s, run, after, t.context.ids)));
    state.splice(at, 0, ...run);
    i = end;
  }
}

export const writeTo = (
  t: Telling,
  s: SeedSession,
  target: readonly SeedBlock[],
): Promise<void> => replay(t, s, sessionsBetween(t.state, target, 1)[0]!);

export async function sit(
  t: Telling,
  [userId, at]: Sitting,
  edit: (s: SeedSession) => Promise<void>,
): Promise<void> {
  await t.story.at(at);
  await t.story.sessionWith(userId, KEY, edit);
}

/** The sittings, each writing its even share of what stands between the script and `target`, with `later` sittings still to come. */
export async function draftToward(
  t: Telling,
  people: readonly Sitting[],
  target: readonly SeedBlock[],
  later: number,
): Promise<void> {
  for (const [n, sitting] of people.entries()) {
    const shares = people.length - n + later;
    await sit(t, sitting, (s) =>
      replay(t, s, sessionsBetween(t.state, target, shares)[0]!),
    );
  }
}

type Placed = readonly (readonly [LockAnchorRecord, SeedBlock])[];

/** `blocks` as production lays them out, and where each stands in `blocks`: an omitted heading reads OMITTED, and the blocks after it take no room. */
function asShown(
  blocks: readonly SeedBlock[],
  omitted: ReadonlySet<SeedBlock>,
): { shown: SeedBlock[]; from: number[] } {
  const shown: SeedBlock[] = [];
  const from: number[] = [];
  let hiding = false;
  for (const [i, block] of blocks.entries()) {
    if (isHeading(block)) hiding = omitted.has(block);
    else if (hiding) continue;
    shown.push(omitted.has(block) ? { ...block, text: "OMITTED" } : block);
    from.push(i);
  }
  return { shown, from };
}

const joined = (b: SeedBlock): SeedBlock => ({
  ...b,
  text: `\u2060${b.text}`,
  marks: b.marks.map((m) => ({ ...m, from: m.from + 1, to: m.to + 1 })),
});

/**
 * The pages of `blocks` under the lock from locked page `page` to the next, laid out with the A-pages locked
 * after it, from its own block, each anchor quoting its block as it reads now: the meter puts an anchor on the
 * first block that holds its quote, from the last anchor's on, so a cue repeated before an anchor's block would
 * take it, and such a block is measured with a word joiner in front.
 */
async function lockedPages(
  t: Telling,
  blocks: readonly SeedBlock[],
  layout: SeedLayout,
  [placed, page]: readonly [Placed, string],
): Promise<{ label: string; blockIndex: number }[]> {
  const { shown, from } = asShown(blocks, t.omitted);
  const runs: { at: number; record: LockAnchorRecord }[][] = [];
  for (const [record, owner] of placed) {
    const at = from.indexOf(blocks.indexOf(owner));
    if (at === -1) continue;
    const { offset } = record;
    const quote = owner.text.slice(offset, offset + record.quote.length);
    const start = { at, record: { ...record, quote } };
    if (runs.length === 0 || /^\d+$/.test(record.label)) runs.push([start]);
    else runs.at(-1)!.push(start);
  }
  const pages: { label: string; blockIndex: number }[] = [];
  for (const [k, run] of runs.entries()) {
    if (run[0]!.record.label !== page) continue;
    const first = run[0]!.at;
    const laid = shown.slice(first, runs[k + 1]?.[0]!.at ?? shown.length);
    for (const [n, { at, record }] of run.entries())
      for (let j = (run[n - 1]?.at ?? first) + 1; j < at; j += 1)
        if (laid[j - first]!.text.startsWith(record.quote, record.offset))
          laid[j - first] = joined(laid[j - first]!);
    const anchors = run.map((start) => start.record);
    for (const one of await t.driver.meter.pages(laid, { ...layout, anchors }))
      pages.push({ ...one, blockIndex: from[one.blockIndex + first]! });
  }
  return pages;
}

/** The locked script: its layout, the blocks its anchors stand on, and a meter for each locked page's run. */
interface Locked {
  layout: SeedLayout;
  placed: Placed;
  meterOf(page: string): PageMeter;
}

async function locked(t: Telling, s: SeedSession): Promise<Locked | null> {
  const { production } = t.driver;
  if (production === null) return null;
  const { anchors } = await production.state("dana", seedDoc(KEY).docId);
  const id = idsOf(s, t.state);
  const placed = anchors
    .toSorted((a, b) => a.order - b.order || a.level - b.level)
    .flatMap((record) => {
      const at = [record.blockId, ...record.fallbackIds]
        .map((x) => id.indexOf(x))
        .find((i) => i !== -1);
      return at === undefined ? [] : [[record, t.state[at]!] as const];
    });
  const settings = scriptSettings(s.doc).entries();
  return {
    layout: { format: "screenplay", settings, anchors },
    placed,
    meterOf: (page) => ({
      pages: (blocks, layout) => lockedPages(t, blocks, layout, [placed, page]),
    }),
  };
}

/** Where locked page `labels[0]` starts, and where the first locked page after it outside `labels` does. */
function lockedSpan(
  t: Telling,
  placed: Placed,
  labels: readonly string[],
): [number, number] {
  const at = placed.findIndex(([record]) => record.label === labels[0]);
  if (at === -1)
    throw new SeedBuildError("unfit", `${GUIDE.project}: page ${labels[0]}`);
  const next = placed.find(
    ([record], i) => i > at && !labels.includes(record.label),
  )?.[1];
  const end = next === undefined ? t.state.length : t.state.indexOf(next);
  return [t.state.indexOf(placed[at]![1]), end];
}

/** The first block of page `label`, and the first of the page after it, as the script is laid out now. */
export async function pageSpan(
  t: Telling,
  s: SeedSession,
  label: string,
): Promise<[number, number]> {
  const lock = await locked(t, s);
  if (lock !== null) return lockedSpan(t, lock.placed, [label]);
  const pages = await t.driver.meter.pages(t.state, WHITE);
  const at = pages.findIndex((p) => p.label === label);
  if (at === -1)
    throw new SeedBuildError("unfit", `${GUIDE.project}: page ${label}`);
  return [pages[at]!.blockIndex, pages[at + 1]?.blockIndex ?? t.state.length];
}

/**
 * Pads or trims the run of locked page `labels[0]` so it fills exactly `labels`, its pages as the engine names
 * them under the server's lock table, locked A-pages among them; nothing without production.
 */
export async function fillPages(
  t: Telling,
  s: SeedSession,
  labels: readonly string[],
): Promise<void> {
  const lock = await locked(t, s);
  if (lock === null) return;
  const [first, end] = lockedSpan(t, lock.placed, labels);
  const run = { firstBlock: first, lastBlock: end - 1, labels };
  const fixed = new Set(t.state.flatMap((b, i) => (t.fixed.has(b) ? [i] : [])));
  const options = {
    meter: lock.meterOf(labels[0]!),
    layout: lock.layout,
    guide: GUIDE,
    rng: t.context.rng,
    used: t.used,
    fixed,
  };
  await writeTo(t, s, await fitAPages(t.state, run, options));
}

/** Each passage checked from its first block against the server's pages, numbers and marks; rules_broken on any. */
export async function check(
  t: Telling,
  s: SeedSession,
  passages: readonly (readonly [SeedPassage, SeedBlock])[],
): Promise<void> {
  const id = idsOf(s, t.state);
  const found: string[] = [];
  // without production nothing numbers or marks the script, so only its pages are held to the passage
  const unlocked = t.driver.production === null;
  for (const [passage, first] of passages) {
    const held = unlocked ? { ...passage, numbers: [], marked: [] } : passage;
    const at = id[t.state.indexOf(first)]!;
    found.push(...(await t.driver.check(seedDoc(KEY).docId, held, at)));
  }
  if (found.length > 0)
    throw new SeedBuildError(
      "rules_broken",
      `${GUIDE.project}: ${found.join("; ")}`,
    );
}
