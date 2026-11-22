// The template grammar: a beat's scenes written from its guide's lines, and a chapter from its guide's sentences.
import type { BlockType, FormatId } from "@manent/schema";
import type { SeedBlock } from "../content/markup.ts";
import type { Rng } from "../seed/rng.ts";
import { SeedBuildError } from "./guide.ts";
import type {
  Beat,
  DialogueEntry,
  LineIntent,
  ProseGuide,
  StyleGuide,
} from "./guide.ts";

// the line slots of the engine's page profile on Letter: a manuscript's 54 slots hold 27 double-spaced lines,
// and Ink, which has no page profile, is estimated as the screen page
export const LINES_PER_PAGE: Readonly<Record<FormatId, number>> = Object.freeze(
  {
    screenplay: 54,
    multicam: 54,
    animation: 54,
    variety: 54,
    game: 54,
    ink: 54,
    manuscript: 27,
    stage_play: 54,
  },
);
// characters to a printed line, for estimating the lines a block takes
const DIALOGUE_WIDTH = 35;
const ACTION_WIDTH = 60;

/** No generated sentence or action comes back within this many pages; a dialogue line never does. */
export const GENERATED_REPEAT_PAGES = 10;

const UNITS = ["action", "exchange", "instruction", "statement"] as const;
type Unit = (typeof UNITS)[number];

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
] as const;

/** A line ending in a tag: the entry's text without its full stop, a comma, the tag, and the full stop. */
export function withTag(text: string, tag: string): string {
  return `${text.slice(0, -1)}, ${tag}.`;
}

const block = (element: BlockType, text: string): SeedBlock => ({
  element,
  text,
  marks: [],
  kind: null,
});

const wordCount = (text: string): number =>
  text.split(/\s+/).filter((word) => word !== "").length;

/** The printed lines `b` is estimated to take: a heading, cue or action has a blank line before it, a speech runs on under its cue. */
export function estimatedLines(b: SeedBlock): number {
  return b.element === "dialogue"
    ? Math.ceil(b.text.length / DIALOGUE_WIDTH)
    : 1 + Math.ceil(b.text.length / ACTION_WIDTH);
}

/** The estimated lines of `format`'s pages within which a drawn sentence or action may not come back. */
const repeatWindow = (format: FormatId): number =>
  GENERATED_REPEAT_PAGES * LINES_PER_PAGE[format];

/**
 * What one document's generator calls have drawn, and where: a step makes one per document and passes it to every
 * call that writes into that document. Lines are estimated, counted over every block passed.
 */
export interface UsedLines {
  /** Whether `text` may not be drawn: a dialogue entry once spoken, or a sentence or action placed fewer than `window` lines back. */
  has(text: string, window: number): boolean;
  /** Records a sentence or action fragment drawn at the current line. */
  add(text: string): void;
  /** Records a dialogue entry, which is never drawn again in the document. */
  addDialogue(text: string): void;
  /** Moves the current line past `block`. */
  pass(block: SeedBlock): void;
}

/** A new document's record: nothing drawn yet, at its first line. */
export function createUsedLines(): UsedLines {
  const placedAt = new Map<string, number>();
  const spoken = new Set<string>();
  let line = 0;
  return {
    has: (text, window) =>
      spoken.has(text) || line - (placedAt.get(text) ?? -Infinity) < window,
    add(text) {
      placedAt.set(text, line);
    },
    addDialogue(text) {
      spoken.add(text);
    },
    pass(b) {
      line += estimatedLines(b);
    },
  };
}

const WORD = new RegExp("[\\p{L}\\p{N}'’.-]+", "gu");
const WORD_EDGES = new RegExp("^[.'’-]+|[.'’-]+$", "g");
const POSSESSIVE = new RegExp("['’]s$");

// a word without the punctuation at its edges or a final 's, so "Orla's" is "Orla"
const wordsOf = (text: string): string[] =>
  (text.match(WORD) ?? []).map((word) =>
    word.replace(WORD_EDGES, "").replace(POSSESSIVE, ""),
  );

const castWords = (cast: StyleGuide["cast"]): string[] =>
  cast.flatMap((member) =>
    wordsOf(`${member.cue} ${member.name}`).map((word) => word.toLowerCase()),
  );

/** One beat's draw: what it may use, and how many of its lines carry a tag. */
interface Draw {
  guide: StyleGuide;
  beat: Beat;
  rng: Rng;
  used: UsedLines;
  lines: number;
  tagged: number;
}

interface Line {
  entry: DialogueEntry;
  cue: string;
}

/**
 * An action fragment of the guide not placed within the last GENERATED_REPEAT_PAGES pages, drawn with `rng`, that
 * names none of its cast but the members cued in `cues`: none of its capitalised words is a cue or name word of
 * anyone else alone. Null when none is free.
 */
export function freeAction(
  guide: StyleGuide,
  cues: readonly string[],
  rng: Rng,
  used: Pick<UsedLines, "has">,
): string | null {
  const window = repeatWindow(guide.format);
  const present = new Set(
    castWords(guide.cast.filter((member) => cues.includes(member.cue))),
  );
  const absent = new Set(
    castWords(guide.cast).filter((word) => !present.has(word)),
  );
  const free = guide.action.filter(
    (text) =>
      !used.has(text, window) &&
      !wordsOf(text).some(
        (word) => /^\p{Lu}/u.test(word) && absent.has(word.toLowerCase()),
      ),
  );
  return free.length === 0 ? null : rng.pick(free);
}

// an entry of this intent never spoken in the document that someone in the beat other than `not` may speak
function freeLine(
  draw: Draw,
  intent: LineIntent,
  not: string | null,
): Line | null {
  const speakers = (entry: DialogueEntry): readonly string[] =>
    draw.beat.cast.filter(
      (cue) => cue !== not && (entry.speaker === null || entry.speaker === cue),
    );
  const free = draw.guide.dialogue.filter(
    (entry) =>
      entry.intent === intent &&
      !draw.used.has(entry.text, repeatWindow(draw.guide.format)) &&
      speakers(entry).length > 0,
  );
  if (free.length === 0) return null;
  const entry = draw.rng.pick(free);
  return { entry, cue: draw.rng.pick(speakers(entry)) };
}

function act(draw: Draw, text: string): SeedBlock {
  draw.used.add(text);
  return block("action", text);
}

// at most one line in three carries a tag, and only a line that ends in a full stop
function speak(draw: Draw, { entry, cue }: Line): SeedBlock[] {
  draw.used.addDialogue(entry.text);
  draw.lines += 1;
  const tagged =
    entry.text.endsWith(".") &&
    draw.guide.tags.length > 0 &&
    (draw.tagged + 1) * 3 <= draw.lines &&
    draw.rng.int(0, 2) === 0;
  if (tagged) draw.tagged += 1;
  const text = tagged
    ? withTag(entry.text, draw.rng.pick(draw.guide.tags))
    : entry.text;
  return [block("character", cue), block("dialogue", text)];
}

const UNIT_WRITERS: Readonly<Record<Unit, (draw: Draw) => SeedBlock[] | null>> =
  {
    action: (draw) => {
      const text = freeAction(draw.guide, draw.beat.cast, draw.rng, draw.used);
      return text === null ? null : [act(draw, text)];
    },
    exchange: (draw) => {
      const ask = freeLine(draw, "ask", null);
      const answer = ask === null ? null : freeLine(draw, "answer", ask.cue);
      if (ask === null || answer === null) return null;
      return [...speak(draw, ask), ...speak(draw, answer)];
    },
    instruction: (draw) => {
      const line = freeLine(draw, "instruct", null);
      const text = freeAction(draw.guide, draw.beat.cast, draw.rng, draw.used);
      if (line === null || text === null) return null;
      return [...speak(draw, line), act(draw, text)];
    },
    statement: (draw) => {
      const line = freeLine(draw, "state", null);
      return line === null ? null : speak(draw, line);
    },
  };

// the units are tried from a random one onwards, so a kind that has run out gives way to the others
function writeUnit(draw: Draw): SeedBlock[] {
  const start = draw.rng.int(0, UNITS.length - 1);
  for (let i = 0; i < UNITS.length; i += 1) {
    const written = UNIT_WRITERS[UNITS[(start + i) % UNITS.length]!](draw);
    if (written !== null) return written;
  }
  throw new SeedBuildError(
    "generator_exhausted",
    `${draw.guide.project}: ${draw.beat.id}`,
  );
}

/**
 * Writes the beat's scenes, each a heading and enough units for its share of the beat's pages (an estimate), and
 * passes every block written through `used`: a dialogue line is never spoken again in the document, an action
 * not within GENERATED_REPEAT_PAGES pages. Throws SeedBuildError "generator_exhausted" when nothing free fits.
 */
export function generateScenes(
  guide: StyleGuide,
  beat: Beat,
  rng: Rng,
  used: UsedLines,
): SeedBlock[] {
  const draw: Draw = { guide, beat, rng, used, lines: 0, tagged: 0 };
  const scenes = beat.scenes[1] - beat.scenes[0] + 1;
  const share =
    ((beat.pages[1] - beat.pages[0] + 1) * LINES_PER_PAGE[guide.format]) /
    scenes;
  const blocks: SeedBlock[] = [];
  for (let scene = 0; scene < scenes; scene += 1) {
    const place = beat.places[scene % beat.places.length]!;
    const heading = block("scene_heading", `${place} - ${beat.timeOfDay}`);
    blocks.push(heading);
    used.pass(heading);
    let lines = estimatedLines(heading);
    while (lines < share)
      for (const written of writeUnit(draw)) {
        blocks.push(written);
        used.pass(written);
        lines += estimatedLines(written);
      }
  }
  return blocks;
}

function numberInWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99)
    throw new RangeError(
      `a chapter number must be an integer from 1 to 99, not ${n}`,
    );
  if (n < 20) return ONES[n]!;
  const tens = TENS[Math.floor(n / 10)]!;
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]!}`;
}

/**
 * Writes one chapter of about `words` words: its heading, paragraphs of sentences free in `used`, a break halfway,
 * the chapter's ledger entry as a quote, and a one-sentence closing paragraph. Sentences that share a tag with the
 * chapter come first; when none is free, any free sentence of the guide. A sentence is free when it was not
 * placed within the last GENERATED_REPEAT_PAGES manuscript pages. Throws a RangeError for a chapter the guide
 * lacks, and SeedBuildError "generator_exhausted" when no sentence is free.
 */
export function generateChapter(
  guide: ProseGuide,
  chapter: number,
  words: number,
  rng: Rng,
  used: UsedLines,
): SeedBlock[] {
  const outline = guide.chapters.find((c) => c.number === chapter);
  if (outline === undefined)
    throw new RangeError(`${guide.project} has no chapter ${chapter}`);
  const tags = new Set(outline.tags);
  const window = repeatWindow("manuscript");
  const take = (count: number): string => {
    const free = guide.sentences.filter((s) => !used.has(s.text, window));
    const tagged = free.filter((s) => s.tags.some((tag) => tags.has(tag)));
    const pool = (tagged.length > 0 ? tagged : free).map((s) => s.text);
    if (pool.length === 0)
      throw new SeedBuildError(
        "generator_exhausted",
        `${guide.project}: chapter ${chapter}`,
      );
    const taken: string[] = [];
    while (taken.length < count && pool.length > 0) {
      const text = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
      used.add(text);
      taken.push(text);
    }
    return taken.join(" ");
  };
  const blocks: SeedBlock[] = [];
  const place = (b: SeedBlock): void => {
    blocks.push(b);
    used.pass(b);
  };
  place(
    block("chapter", `Chapter ${numberInWords(chapter)}: ${outline.title}`),
  );
  let written = 0;
  const fill = (target: number): void => {
    while (written < target) {
      const paragraph = take(rng.int(1, 5));
      written += wordCount(paragraph);
      place(block("body", paragraph));
    }
  };
  fill(words / 2);
  place(block("break", "*"));
  fill(words);
  place(block("quote", outline.ledger));
  place(block("body", take(1)));
  return blocks;
}
