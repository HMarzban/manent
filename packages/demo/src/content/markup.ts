// The markup the fixed text is written in: one element per line, read into blocks and the checks they carry.
import { isBlockType } from "@manent/schema";
import type { ActBreakKind, BlockType } from "@manent/schema";

export interface SeedBlock {
  element: BlockType;
  text: string;
  marks: readonly {
    mark: "italic" | "bold" | "underline";
    from: number;
    to: number;
  }[];
  /** Set on an act break only; null on every other element. */
  kind: ActBreakKind | null;
}

/** The blocks of a passage, and what the server must hold once they are replayed. */
export interface SeedPassage {
  blocks: readonly SeedBlock[];
  /** From "— p. 17 —" lines: the page that must start with that block. */
  pageStarts: readonly { label: string; blockIndex: number }[];
  /** From "[24] " prefixes: what the authority must have numbered that heading. */
  numbers: readonly { blockIndex: number; num: string }[];
  /** Blocks ending " *": revised in the active revision. */
  marked: readonly number[];
  /** "[25] OMITTED *": a heading shown omitted, its text the original heading's. */
  omitted: readonly number[];
}

/** A line of markup that cannot be read. `line` counts from 1. */
export class SeedTextError extends Error {
  readonly code: "bad_line" | "bad_element" | "bad_mark";
  readonly line: number;

  constructor(code: SeedTextError["code"], line: number) {
    super(`line ${line}: ${code}`);
    this.name = "SeedTextError";
    this.code = code;
    this.line = line;
  }
}

type Mark = SeedBlock["marks"][number];

// a bracket after the label ("— p. 12 (end) —") or after the rule ("— p. 17 — (header: Blue Rev.)") is ignored
const PAGE_RULE = /^— p\. ([^\s()]+)(?: \([^)]*\))? —(?: \(.*\))?$/;
const SCENE_NUMBER = /^\[(\d+[A-Z]*)\] /;
const REVISION_MARK = " *";
const OMITTED = "OMITTED";
const ACT_BREAK_TEXTS: readonly (readonly [RegExp, ActBreakKind])[] = [
  [/^ACT \S+$/, "new_act"],
  [/^TEASER$/, "teaser"],
  [/^TAG$/, "tag"],
  [/^END OF ACT \S.*$/, "end_of_act"],
];
const MARKERS: Readonly<Record<string, "italic" | "bold">> = {
  "*": "italic",
  "**": "bold",
};

const isSpace = (char: string | undefined): boolean =>
  char === undefined || /\s/.test(char);

// A run of asterisks touching text on neither side is text; one touching text opens or closes a mark.
function readMarks(
  source: string,
  line: number,
): { text: string; marks: Mark[] } {
  const marks: Mark[] = [];
  let text = "";
  let at = 0;
  let open: { mark: "italic" | "bold"; from: number } | null = null;
  for (const run of source.matchAll(/\*+/g)) {
    const end = run.index + run[0].length;
    text += source.slice(at, run.index);
    at = end;
    const canClose = !isSpace(source[run.index - 1]);
    const canOpen = !isSpace(source[end]);
    if (!canOpen && !canClose) {
      text += run[0];
      continue;
    }
    const mark = MARKERS[run[0]];
    if (mark !== undefined && open === null && canOpen)
      open = { mark, from: text.length };
    else if (mark !== undefined && open?.mark === mark && canClose) {
      marks.push({ mark, from: open.from, to: text.length });
      open = null;
    } else throw new SeedTextError("bad_mark", line);
  }
  if (open !== null) throw new SeedTextError("bad_mark", line);
  return { text: text + source.slice(at), marks };
}

function actBreakKind(text: string, line: number): ActBreakKind {
  const found = ACT_BREAK_TEXTS.find(([pattern]) => pattern.test(text));
  if (found === undefined) throw new SeedTextError("bad_line", line);
  return found[1];
}

function readElement(
  source: string,
  line: number,
): { block: SeedBlock; num: string | null; marked: boolean } {
  const space = source.indexOf(" ");
  const element = space === -1 ? source : source.slice(0, space);
  if (!isBlockType(element)) throw new SeedTextError("bad_element", line);
  let rest = space === -1 ? "" : source.slice(space + 1);
  const marked = rest.endsWith(REVISION_MARK);
  if (marked) rest = rest.slice(0, -REVISION_MARK.length);
  const number = element === "scene_heading" ? SCENE_NUMBER.exec(rest) : null;
  if (number !== null) rest = rest.slice(number[0].length);
  const { text, marks } = readMarks(rest, line);
  if (text === "") throw new SeedTextError("bad_line", line);
  const kind = element === "act_break" ? actBreakKind(text, line) : null;
  return {
    block: { element, text, marks, kind },
    num: number?.[1] ?? null,
    marked,
  };
}

/** Reads a passage of markup; throws SeedTextError at the first line it cannot read. */
export function parseSeedText(source: string): SeedPassage {
  const blocks: SeedBlock[] = [];
  const pageStarts: { label: string; blockIndex: number }[] = [];
  const numbers: { blockIndex: number; num: string }[] = [];
  const marked: number[] = [];
  const omitted: number[] = [];
  // the line of a page rule still waiting for the element that starts its page
  let pageRule: number | null = null;
  for (const [index, raw] of source.split("\n").entries()) {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const page = PAGE_RULE.exec(trimmed);
    if (page !== null) {
      if (pageRule !== null) throw new SeedTextError("bad_line", pageRule);
      pageRule = line;
      pageStarts.push({ label: page[1]!, blockIndex: blocks.length });
      continue;
    }
    const read = readElement(trimmed, line);
    pageRule = null;
    if (read.num !== null)
      numbers.push({ blockIndex: blocks.length, num: read.num });
    if (read.marked) marked.push(blocks.length);
    if (read.block.element === "scene_heading" && read.block.text === OMITTED)
      omitted.push(blocks.length);
    blocks.push(read.block);
  }
  if (pageRule !== null) throw new SeedTextError("bad_line", pageRule);
  return { blocks, pageStarts, numbers, marked, omitted };
}

const isSameBlock = (a: SeedBlock, b: SeedBlock): boolean =>
  a.element === b.element &&
  a.text === b.text &&
  a.kind === b.kind &&
  a.marks.length === b.marks.length &&
  a.marks.every(
    (mark, i) =>
      mark.mark === b.marks[i]!.mark &&
      mark.from === b.marks[i]!.from &&
      mark.to === b.marks[i]!.to,
  );

const unwritable = (block: SeedBlock, cause?: unknown): RangeError =>
  new RangeError(
    `the markup cannot hold the ${block.element} ${JSON.stringify(block.text)}`,
    { cause },
  );

function lineOf(block: SeedBlock): string {
  let text = block.text;
  // from the last mark back, so the offsets of the earlier ones still hold
  for (const { mark, from, to } of block.marks.toReversed()) {
    if (mark === "underline")
      throw new RangeError("the markup has no underline");
    const marker = mark === "bold" ? "**" : "*";
    text = `${text.slice(0, from)}${marker}${text.slice(from, to)}${marker}${text.slice(to)}`;
  }
  const line = `${block.element} ${text}`;
  let read: readonly SeedBlock[];
  try {
    read = parseSeedText(line).blocks;
  } catch (error) {
    throw unwritable(block, error);
  }
  if (read.length !== 1 || !isSameBlock(read[0]!, block))
    throw unwritable(block);
  return line;
}

/** The markup that parseSeedText reads back as these blocks; a RangeError for a block it would read back differently (an underline, crossing or unordered marks, text a mark or rule would swallow). */
export function blocksToText(blocks: readonly SeedBlock[]): string {
  return blocks.map(lineOf).join("\n");
}
