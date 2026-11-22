// How each line of a Fountain script reads, from its own text and the lines beside it.
import type { ActBreakKind } from "@manent/schema";

/** The longest line a Fountain file may hold, in UTF-16 units; a longer one is malformed. */
export const FOUNTAIN_LINE_LIMIT = 100_000;

/** A line break of any platform. */
export const LINE_BREAK = /\r\n|\r|\n/;
/** What a tab counts as when a line is read: four spaces. */
export const TAB_AS_SPACES = "    ";
/** A lower-case letter of any script. */
export const LOWER_CASE_LETTER = /\p{Ll}/u;

/** A title page's `Key: value` line, the key in the first group and the value in the second. */
export const TITLE_KEY_LINE = /^([A-Za-z][A-Za-z0-9 ]*):(.*)$/;

/** Where an element's text lies inside its line: from, then to, in UTF-16 units. */
export type Span = readonly [number, number];

/** What one line is, and where its text lies; a cue's `dual` is its trailing caret. */
export type FountainLine =
  | { readonly type: "blank" | "page_break" | "speech_gap" }
  | {
      readonly type:
        | "action"
        | "centered"
        | "lyric"
        | "synopsis"
        | "transition"
        | "parenthetical"
        | "dialogue";
      readonly span: Span;
    }
  | {
      readonly type: "scene_heading";
      readonly span: Span;
      readonly number: string | null;
    }
  | { readonly type: "section"; readonly span: Span; readonly depth: number }
  | {
      readonly type: "act_break";
      readonly span: Span;
      readonly kind: ActBreakKind;
    }
  | { readonly type: "character"; readonly span: Span; readonly dual: boolean };

const HEADING = /^(?:int\.?\/ext|int|ext|est|i\/e)[. ]/i;
const FORCED_HEADING = /^\.[\p{L}\p{N}]/u;
const SCENE_NUMBER = /\s*#([\p{L}\p{N}.-]+)#$/u;
const PAGE_BREAK = /^={3,}$/;
const LETTER = /\p{L}/u;
const EXTENSION = /\s*\([^()]*\)$/;
/** The words of a centred line that make it an act break. */
const ACT_BREAK_WORDS: readonly (readonly [RegExp, ActBreakKind])[] = [
  [/^END OF ACT\b/, "end_of_act"],
  [/^ACT\b/, "new_act"],
  [/^TEASER$/, "teaser"],
  [/^TAG$/, "tag"],
];

/** Whether a line starts as a scene heading does: a heading's prefix, or one dot before a letter or digit. The blank line a prefix needs before it is the reader's to check. */
export function isFountainHeading(line: string): boolean {
  return HEADING.test(line) || FORCED_HEADING.test(line);
}

/** Whether a cue's text reads as one: a letter, and no lower-case letter outside a trailing extension. */
function isCue(text: string): boolean {
  const name = text.replace(EXTENSION, "");
  return LETTER.test(name) && !LOWER_CASE_LETTER.test(name);
}

/** The kind of act break a centred line's text names, or null. */
function actBreakOf(text: string): ActBreakKind | null {
  return ACT_BREAK_WORDS.find(([words]) => words.test(text))?.[1] ?? null;
}

const isBlank = (line: string): boolean => line.trim() === "";

/** `[from, to)` of `line` without the whitespace at either end. */
function trimmed(line: string, from: number, to: number): Span {
  let start = from;
  let end = to;
  while (start < end && /\s/.test(line[start]!)) start++;
  while (end > start && /\s/.test(line[end - 1]!)) end--;
  return [start, end];
}

function heading(line: string, span: Span): FountainLine {
  const number = SCENE_NUMBER.exec(line.slice(span[0], span[1]));
  if (number === null) return { type: "scene_heading", span, number: null };
  return {
    type: "scene_heading",
    span: trimmed(line, span[0], span[0] + number.index),
    number: number[1]!,
  };
}

function character(line: string, from: number, to: number): FountainLine {
  const [start, end] = trimmed(line, from, to);
  const dual = line[end - 1] === "^";
  return {
    type: "character",
    span: dual ? trimmed(line, start, end - 1) : [start, end],
    dual,
  };
}

function centered(
  line: string,
  from: number,
  to: number,
  before: boolean,
): FountainLine {
  const span = trimmed(line, from + 1, to - 1);
  const kind = before ? actBreakOf(line.slice(span[0], span[1])) : null;
  return kind === null
    ? { type: "centered", span }
    : { type: "act_break", span, kind };
}

/** A line outside a speech; `before` and `after` say whether the lines beside it are blank. */
function lineOf(line: string, before: boolean, after: boolean): FountainLine {
  const [from, to] = trimmed(line, 0, line.length);
  const text = line.slice(from, to);
  const rest = trimmed(line, from + 1, to);
  if (text === "") return { type: "blank" };
  if (PAGE_BREAK.test(text)) return { type: "page_break" };
  switch (text[0]) {
    case "#": {
      const depth = /^#+/.exec(text)![0].length;
      return { type: "section", span: trimmed(line, from + depth, to), depth };
    }
    case "=":
      return { type: "synopsis", span: rest };
    case "!":
      return { type: "action", span: rest };
    case "@":
      return character(line, from + 1, to);
    case "~":
      return { type: "lyric", span: rest };
    case ">":
      return text.length > 1 && text.endsWith("<")
        ? centered(line, from, to, before)
        : { type: "transition", span: rest };
  }
  if (FORCED_HEADING.test(text)) return heading(line, rest);
  if (before && HEADING.test(text)) return heading(line, [from, to]);
  if (before && after && !LOWER_CASE_LETTER.test(text) && text.endsWith("TO:"))
    return { type: "transition", span: [from, to] };
  if (before && !after && isCue(text.replace(/\s*\^$/, "")))
    return character(line, from, to);
  return { type: "action", span: [from, to] };
}

function speechLine(line: string): FountainLine {
  if (line === "  ") return { type: "speech_gap" };
  const span = trimmed(line, 0, line.length);
  if (span[0] === span[1]) return { type: "blank" };
  return line[span[0]] === "(" && line[span[1] - 1] === ")"
    ? { type: "parenthetical", span }
    : { type: "dialogue", span };
}

/** Each line read in one pass: a cue opens a speech, which a blank line ends and a line of two spaces keeps going. */
export function classifyLines(lines: readonly string[]): FountainLine[] {
  const classed: FountainLine[] = [];
  let speech = false;
  for (const [i, line] of lines.entries()) {
    const next = lines[i + 1];
    const one: FountainLine = speech
      ? speechLine(line)
      : lineOf(
          line,
          i === 0 || classed[i - 1]?.type === "blank",
          next === undefined || isBlank(next),
        );
    speech = one.type === "character" || (speech && one.type !== "blank");
    classed.push(one);
  }
  return classed;
}
