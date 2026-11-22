// What a line of Ink source, or a game script's branching line, is: its kind and nesting from its leading marks, and
// the ranges inside it that are coloured. Line-local: only an open block comment is carried to the next line.

/** How a script's lines are read: every line as Ink, or a game script's General lines as branching lines. */
export type SourceMode = "ink" | "branching";

export const SOURCE_KINDS = [
  "knot",
  "stitch",
  "choice",
  "gather",
  "logic",
  "variable",
] as const;
/** What a whole line is, from its leading marks. */
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_ROLES = ["divert", "condition", "tag", "comment"] as const;
/** What a range inside a line is. */
export type SourceRole = (typeof SOURCE_ROLES)[number];

/** `from` and `to` are offsets in the line's text. */
export interface SourceRange {
  readonly from: number;
  readonly to: number;
  readonly role: SourceRole;
}

export interface SourceLine {
  readonly kind: SourceKind | null;
  /** The count of a choice's or a gather's marks; 0 for any other line. */
  readonly depth: number;
  readonly ranges: readonly SourceRange[];
  /** The line ends inside a block comment. */
  readonly commentOpen: boolean;
}

const PLAIN: SourceLine = Object.freeze({
  kind: null,
  depth: 0,
  ranges: Object.freeze([]),
  commentOpen: false,
});

const DECLARATION = new RegExp("^(VAR|CONST)\\b");
const DIVERT = /^->\s*[\w.]*/;

// The count of `marks` at the line's start, spaces between them allowed, and where they end.
function marksAt(
  text: string,
  start: number,
  marks: string,
): { count: number; end: number } {
  let count = 0;
  let at = start;
  for (; at < text.length; at++) {
    const c = text[at]!;
    if (marks.includes(c) && text.slice(at, at + 2) !== "->") count++;
    else if (c !== " " && c !== "\t") break;
  }
  return { count, end: at };
}

function kindOf(
  text: string,
  start: number,
  mode: SourceMode,
): { kind: SourceKind | null; depth: number } {
  const rest = text.slice(start);
  const choice = marksAt(text, start, "*+");
  if (choice.count > 0) return { kind: "choice", depth: choice.count };
  const gather = marksAt(text, start, "-");
  if (gather.count > 0) return { kind: "gather", depth: gather.count };
  if (mode === "branching") return { kind: null, depth: 0 };
  if (rest.startsWith("==")) return { kind: "knot", depth: 0 };
  if (rest.startsWith("=")) return { kind: "stitch", depth: 0 };
  if (rest.startsWith("~")) return { kind: "logic", depth: 0 };
  if (DECLARATION.test(rest)) return { kind: "variable", depth: 0 };
  return { kind: null, depth: 0 };
}

// The ranges of `text` from `from`, outside a comment there; whether a block comment is left open.
function rangesOf(
  text: string,
  from: number,
  mode: SourceMode,
  ranges: SourceRange[],
): boolean {
  const ink = mode === "ink";
  for (let at = from; at < text.length; at++) {
    const pair = text.slice(at, at + 2);
    if (ink && pair === "//") {
      ranges.push({ from: at, to: text.length, role: "comment" });
      return false;
    }
    if (ink && pair === "/*") {
      const close = text.indexOf("*/", at + 2);
      if (close < 0) {
        ranges.push({ from: at, to: text.length, role: "comment" });
        return true;
      }
      ranges.push({ from: at, to: close + 2, role: "comment" });
      at = close + 1;
    } else if (ink && pair === "->") {
      const end = at + DIVERT.exec(text.slice(at))![0].length;
      ranges.push({ from: at, to: end, role: "divert" });
      at = end - 1;
    } else if (text[at] === "{") {
      const close = text.indexOf("}", at + 1);
      const end = close < 0 ? text.length : close + 1;
      ranges.push({ from: at, to: end, role: "condition" });
      at = end - 1;
    } else if (text[at] === "#") {
      const next = text.indexOf("#", at + 1);
      const end = next < 0 ? text.length : next;
      ranges.push({ from: at, to: end, role: "tag" });
      at = end - 1;
    }
  }
  return false;
}

/** The line `text` as `mode` reads it; `commentOpen` says the line before ended inside a block comment (Ink only). */
export function classifyLine(
  text: string,
  mode: SourceMode,
  commentOpen: boolean,
): SourceLine {
  const ranges: SourceRange[] = [];
  let from = 0;
  if (mode === "ink" && commentOpen) {
    const close = text.indexOf("*/");
    if (close < 0)
      return {
        ...PLAIN,
        ranges: [{ from: 0, to: text.length, role: "comment" }],
        commentOpen: true,
      };
    ranges.push({ from: 0, to: close + 2, role: "comment" });
    from = close + 2;
  }
  const lead = text.length - text.trimStart().length;
  const { kind, depth } =
    from === 0 ? kindOf(text, lead, mode) : { kind: null, depth: 0 };
  const open = rangesOf(text, from, mode, ranges);
  if (kind === null && ranges.length === 0 && !open) return PLAIN;
  return { kind, depth, ranges, commentOpen: open };
}
