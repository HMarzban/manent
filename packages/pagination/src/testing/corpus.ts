// A seeded stream of believable script blocks in each format, and the document that holds them.
import type { BlockJSON, DocJSON, Dual, SectionJSON } from "@manent/schema";

export const CORPUS_FORMATS = [
  "screenplay",
  "multicam",
  "variety",
  "game",
  "manuscript",
  "stage_play",
] as const;
export type CorpusFormat = (typeof CORPUS_FORMATS)[number];

export interface CorpusBlock {
  readonly type: string;
  readonly text: string;
  readonly kind: string | null;
  readonly dual: Dual | null;
}

export const NAMES: readonly string[] = Object.freeze([
  "MARA",
  "TOBIAS",
  "INES",
  "COLE",
  "RUTH",
  "DEV",
  "ANSEL",
  "PIPPA",
  "OKSANA",
  "JUNO",
  "WALT",
  "SUNNY",
]);

export const PLACES: readonly string[] = Object.freeze([
  "HARBOR OFFICE",
  "FERRY DECK",
  "KITCHEN",
  "BOAT SHED",
  "NIGHT MARKET",
  "ROOFTOP GARDEN",
  "TRAIN PLATFORM",
  "LIGHTHOUSE STAIRS",
]);

/** Lower-case ASCII only: sentences are capitalised by code point. */
const WORDS: readonly string[] = Object.freeze(
  (
    "the and of to in it is on at by for with from up out over under after before " +
    "when then now here there all some many few more most other each every any no not " +
    "only just still even back down away again never always often soon late early " +
    "rain wind light dark water river road door window table chair floor wall roof " +
    "boat rope net fish salt bread coffee tea cup glass plate knife spoon letter " +
    "ticket coat hat bag box key lamp candle clock bell map train station market " +
    "garden street corner bridge hill field tree stone sand shore wave cloud storm " +
    "morning evening night summer winter week hour minute moment year day " +
    "walk run sit stand look see hear say tell ask know think want need take give " +
    "make find keep leave open close carry hold turn wait watch listen laugh smile " +
    "nod shrug sigh whisper call answer follow forget remember wonder believe " +
    "old new long short small large quiet loud cold warm wet dry slow quick tired " +
    "careful sudden strange simple heavy empty full bright narrow gentle certain " +
    "friend mother father brother sister neighbour stranger captain doctor teacher " +
    "child family people voice face hand eyes shoulder heart name story question " +
    "reason promise mistake chance trouble silence weather harbour kitchen"
  ).split(" "),
);

const UNITS = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
] as const;
const TENS = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
] as const;

/** Blocks a section of a corpus document holds. */
const SECTION_BLOCKS = 100;

interface Random {
  /** In [0, 1). */
  next(): number;
  /** An integer from `min` to `max`, both included. */
  int(min: number, max: number): number;
  pick(items: readonly string[]): string;
}

/** xorshift32: the same seed draws the same numbers everywhere. */
function createRandom(seed: number): Random {
  // the xor spreads a small seed's bits; zero, a state xorshift never leaves, becomes 1
  let state = seed ^ 0x9e3779b9 || 1;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 2 ** 32;
  };
  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)]!,
  };
}

/** Upper-cases the first letter of lower-case ASCII text. */
function capitalised(text: string): string {
  return String.fromCharCode(text.charCodeAt(0) - 32) + text.slice(1);
}

function ending(random: Random): string {
  const r = random.next();
  if (r < 0.85) return ".";
  if (r < 0.95) return "?";
  return "!";
}

function sentence(random: Random): string {
  const words = Array.from({ length: random.int(4, 16) }, () =>
    random.pick(WORDS),
  );
  return capitalised(words.join(" ")) + ending(random);
}

function sentences(random: Random, min: number, max: number): string {
  return Array.from({ length: random.int(min, max) }, () =>
    sentence(random),
  ).join("  ");
}

/** A positive integer in capital words: 21 is TWENTY-ONE. */
function spelled(n: number): string {
  if (n < 20) return UNITS[n]!;
  if (n < 100)
    return [TENS[Math.floor(n / 10)], UNITS[n % 10]].filter(Boolean).join("-");
  const [unit, word] = n < 1000 ? [100, "HUNDRED"] : [1000, "THOUSAND"];
  const rest = n % unit;
  return `${spelled(Math.floor(n / unit))} ${word}${rest === 0 ? "" : ` ${spelled(rest)}`}`;
}

function corpusBlock(
  type: string,
  text: string,
  kind: string | null = null,
): CorpusBlock {
  return { type, text, kind, dual: null };
}

interface SceneStyle {
  readonly heading: "scene_heading" | "slug";
  readonly action: "action" | "bracket";
  /** Headings read "Scene 1", "Scene 2", … instead of naming a place. */
  readonly numbered: boolean;
  readonly transitions: boolean;
  /** A speech may be followed by an emote, a camera or an engine block. */
  readonly asides: boolean;
  /** An act opens before every `every`-th scene; `ended` acts close after their last. */
  readonly acts: { readonly every: number; readonly ended: boolean } | null;
}

const SCREENPLAY: SceneStyle = Object.freeze({
  heading: "scene_heading",
  action: "action",
  numbered: false,
  transitions: true,
  asides: false,
  acts: null,
});

const ASIDES = ["emote", "camera", "engine"] as const;

function heading(style: SceneStyle, scene: number, random: Random): string {
  if (style.numbered) return `Scene ${scene + 1}`;
  return `${random.pick(["INT.", "EXT."])} ${random.pick(PLACES)} - ${random.pick(["DAY", "NIGHT"])}`;
}

function* beat(style: SceneStyle, random: Random): Generator<CorpusBlock> {
  if (random.next() < 0.45) {
    yield corpusBlock(style.action, sentences(random, 1, 4));
    return;
  }
  yield corpusBlock("character", random.pick(NAMES));
  if (random.next() < 0.2)
    yield corpusBlock(
      "parenthetical",
      `(${random.pick(WORDS)} ${random.pick(WORDS)})`,
    );
  const long = random.next() < 0.1;
  yield corpusBlock(
    "dialogue",
    long ? sentences(random, 4, 9) : sentences(random, 1, 3),
  );
  if (!style.asides) return;
  // 5 % each: slots 0 to 2 of 20
  const aside = ASIDES[random.int(0, 19)];
  if (aside !== undefined) yield corpusBlock(aside, sentence(random));
}

function* scenes(
  style: SceneStyle,
  random: Random,
): Generator<CorpusBlock, never> {
  for (let scene = 0; ; scene += 1) {
    const { acts } = style;
    const act = acts === null ? 0 : Math.floor(scene / acts.every) + 1;
    if (acts !== null && scene % acts.every === 0)
      yield corpusBlock("act_break", `ACT ${spelled(act)}`, "new_act");
    yield corpusBlock(style.heading, heading(style, scene, random));
    const beats = random.int(4, 12);
    for (let i = 0; i < beats; i += 1) yield* beat(style, random);
    if (style.transitions && random.next() < 0.15)
      yield corpusBlock("transition", "CUT TO:");
    if (acts?.ended === true && scene % acts.every === acts.every - 1)
      yield corpusBlock(
        "act_break",
        `END OF ACT ${spelled(act)}`,
        "end_of_act",
      );
  }
}

function manuscriptBlock(random: Random): CorpusBlock {
  const r = random.next();
  if (r < 0.94) return corpusBlock("body", sentences(random, 2, 8));
  if (r < 0.97) return corpusBlock("break", "#");
  return corpusBlock("quote", sentences(random, 1, 3));
}

function* chapters(random: Random): Generator<CorpusBlock, never> {
  for (let chapter = 1; ; chapter += 1) {
    yield corpusBlock("chapter", `Chapter ${chapter}`);
    const count = random.int(30, 50);
    for (let i = 0; i < count; i += 1) yield manuscriptBlock(random);
  }
}

const STREAMS: Readonly<
  Record<CorpusFormat, (random: Random) => Generator<CorpusBlock, never>>
> = Object.freeze({
  screenplay: (random) => scenes(SCREENPLAY, random),
  multicam: (random) =>
    scenes({ ...SCREENPLAY, acts: { every: 8, ended: true } }, random),
  variety: (random) =>
    scenes({ ...SCREENPLAY, heading: "slug", action: "bracket" }, random),
  game: (random) => scenes({ ...SCREENPLAY, asides: true }, random),
  manuscript: chapters,
  stage_play: (random) =>
    scenes(
      {
        ...SCREENPLAY,
        numbered: true,
        transitions: false,
        acts: { every: 6, ended: false },
      },
      random,
    ),
});

/** The first `count` blocks of the format's stream for `seed`; the first n never depend on `count`. */
export function generateBlocks(
  format: CorpusFormat,
  count: number,
  seed: number,
): CorpusBlock[] {
  const stream = STREAMS[format](createRandom(seed));
  const blocks: CorpusBlock[] = [];
  while (blocks.length < count) blocks.push(stream.next().value);
  return blocks;
}

/** "blk_" and the index in base 36, padded to 12 digits. */
export function corpusId(index: number): string {
  return `blk_${index.toString(36).padStart(12, "0")}`;
}

function blockJson(corpus: CorpusBlock, index: number): BlockJSON {
  const attrs: Record<string, unknown> = {
    id: corpusId(index),
    type: corpus.type,
    kind: corpus.kind,
    dual: corpus.dual,
  };
  return corpus.text === ""
    ? { type: "block", attrs }
    : { type: "block", attrs, content: [{ type: "text", text: corpus.text }] };
}

/** Block i has the id corpusId(i); sections of 100 blocks, in order. */
export function corpusDoc(blocks: readonly CorpusBlock[]): DocJSON {
  const content: SectionJSON[] = [];
  for (let start = 0; start < blocks.length; start += SECTION_BLOCKS)
    content.push({
      type: "section",
      content: blocks
        .slice(start, start + SECTION_BLOCKS)
        .map((corpus, i) => blockJson(corpus, start + i)),
    });
  return { type: "doc", content };
}
