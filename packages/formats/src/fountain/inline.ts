// Fountain's text inside its lines: notes and boneyard taken out, and emphasis turned into marks.
import type { TextJSON } from "@manent/schema";

/** A note's index in the script's notes, at the UTF-16 offset in its text where it stood. */
export interface NoteAt {
  readonly at: number;
  readonly note: number;
}

/** A line's text with its notes taken out. */
export interface NotedText {
  readonly text: string;
  readonly notes: readonly NoteAt[];
}

/** Boneyard text, at the line and column where it stood once everything hidden before it is out. */
export interface Boneyard {
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

/** The answer of `find` from a position, kept until a search passes it: the scan only moves forward, so no text is searched twice. */
function nextFinder(find: (from: number) => number): (from: number) => number {
  // -2 before the first search; -1 once nothing is left ahead
  let found = -2;
  return (from) => {
    if (found !== -1 && found < from) found = find(from);
    return found;
  };
}

/**
 * The lines of `body` with its notes (in double brackets, never across a blank line) and its boneyard (between
 * slash-star and star-slash) taken out: Fountain prints neither. A hidden part that spans lines breaks none, so
 * the line it ends in goes on from where it began; an opener that is never closed is text.
 */
export function removeHiddenText(body: string): {
  lines: NotedText[];
  notes: string[];
  boneyards: Boneyard[];
} {
  const hidden = new RegExp("/\\*|\\[\\[|\\n", "g");
  const blank = new RegExp("\\n(?! {2}\\n)[^\\S\\n]*\\n", "g");
  const boneyardEnd = nextFinder((from) => body.indexOf("*/", from));
  const noteEnd = nextFinder((from) => body.indexOf("]]", from));
  const blankLine = nextFinder((from) => {
    blank.lastIndex = from;
    return blank.exec(body)?.index ?? -1;
  });
  const lines: NotedText[] = [];
  const notes: string[] = [];
  const boneyards: Boneyard[] = [];
  let text = "";
  let lineNotes: NoteAt[] = [];
  let at = 0;
  for (
    let found = hidden.exec(body);
    found !== null;
    found = hidden.exec(body)
  ) {
    const start = found.index;
    text += body.slice(at, start);
    at = start + found[0].length;
    if (found[0] === "\n") {
      lines.push({ text, notes: lineNotes });
      text = "";
      lineNotes = [];
      continue;
    }
    const end = found[0] === "/*" ? boneyardEnd(at) : noteEnd(at);
    const blankAt = found[0] === "[[" ? blankLine(start) : -1;
    if (end === -1 || (blankAt !== -1 && blankAt < end)) {
      text += found[0][0];
      at = start + 1;
    } else if (found[0] === "/*") {
      boneyards.push({
        line: lines.length,
        column: text.length,
        text: body.slice(at, end),
      });
      at = end + 2;
    } else {
      lineNotes.push({ at: text.length, note: notes.length });
      notes.push(body.slice(at, end).trim());
      at = end + 2;
    }
    hidden.lastIndex = at;
  }
  lines.push({ text: text + body.slice(at), notes: lineNotes });
  return { lines, notes, boneyards };
}

/** The characters a backslash escapes. */
export const FOUNTAIN_ESCAPED = "*_\\";
/** The marks Fountain writes, in the order a run lists them. */
export const FOUNTAIN_MARKS = ["bold", "italic", "underline"] as const;
export type FountainMark = (typeof FOUNTAIN_MARKS)[number];
/** The marks an opening run of one, two or three stars gives. */
const STAR_MARKS: Readonly<Record<number, readonly FountainMark[]>> = {
  1: ["italic"],
  2: ["bold"],
  3: ["bold", "italic"],
};

interface Opener {
  readonly underline: boolean;
  readonly start: number;
  /** Stars still open; an underscore is one. */
  count: number;
  /** Where the emphasised text begins. */
  readonly content: number;
}

/** Emphasis read with a stack: a run of stars closes what is open before it opens anything, so `**a***b*` is bold then italic. */
class EmphasisReader {
  readonly dropped: Uint8Array;
  readonly spans: {
    marks: readonly FountainMark[];
    from: number;
    to: number;
  }[] = [];
  private readonly stack: Opener[] = [];

  constructor(private readonly text: string) {
    this.dropped = new Uint8Array(text.length);
    let i = 0;
    while (i < text.length) {
      const char = text[i]!;
      if (char === "\\" && FOUNTAIN_ESCAPED.includes(text[i + 1] ?? "")) {
        this.dropped[i] = 1;
        i += 2;
      } else if (char === "_") {
        this.underscore(i);
        i++;
      } else if (char === "*") {
        let end = i;
        while (text[end] === "*") end++;
        this.stars(i, end);
        i = end;
      } else i++;
    }
  }

  private isSpace(at: number): boolean {
    return at < 0 || at >= this.text.length || /\s/.test(this.text[at]!);
  }

  private close(opener: Opener, count: number, at: number): void {
    const marks = STAR_MARKS[count]!;
    this.spans.push({ marks, from: opener.content, to: at });
    const end = opener.start + opener.count;
    this.dropped.fill(1, end - count, end);
    this.dropped.fill(1, at, at + count);
  }

  private stars(from: number, to: number): void {
    let at = from;
    if (!this.isSpace(from - 1))
      while (at < to) {
        const top = this.stack.at(-1);
        if (top === undefined || top.underline) break;
        const count = Math.min(top.count, to - at);
        // one star cannot close two; three close as one and two, in either order
        if (count < top.count && top.count !== 3) break;
        this.close(top, count, at);
        at += count;
        top.count -= count;
        if (top.count === 0) this.stack.pop();
      }
    if (at < to && to - at <= 3 && !this.isSpace(to))
      this.stack.push({
        underline: false,
        start: at,
        count: to - at,
        content: to,
      });
  }

  private underscore(at: number): void {
    const top = this.stack.at(-1);
    if (top?.underline && top.content < at && !this.isSpace(at - 1)) {
      this.stack.pop();
      this.spans.push({ marks: ["underline"], from: top.content, to: at });
      this.dropped[top.start] = 1;
      this.dropped[at] = 1;
    } else if (!this.isSpace(at + 1))
      this.stack.push({
        underline: true,
        start: at,
        count: 1,
        content: at + 1,
      });
  }
}

/** A line's text with emphasis turned into marks, escapes removed, and each note at its offset in the text that is left. */
export function emphasisRuns(noted: NotedText): {
  text: string;
  content: TextJSON[];
  notes: NoteAt[];
} {
  const source = noted.text;
  const { dropped, spans } = new EmphasisReader(source);
  // per mark, +1 where a span of it begins and -1 where one ends
  const changes = FOUNTAIN_MARKS.map(() => new Int32Array(source.length + 1));
  for (const { marks, from, to } of spans)
    for (const mark of marks) {
      const change = changes[FOUNTAIN_MARKS.indexOf(mark)]!;
      change[from]!++;
      change[to]!--;
    }
  const open = FOUNTAIN_MARKS.map(() => 0);
  const offsets = new Int32Array(source.length + 1);
  const content: TextJSON[] = [];
  let text = "";
  let key = "";
  for (let i = 0; i < source.length; i++) {
    offsets[i] = text.length;
    for (let m = 0; m < FOUNTAIN_MARKS.length; m++) open[m]! += changes[m]![i]!;
    if (dropped[i] === 1) continue;
    const marks = FOUNTAIN_MARKS.filter((_, m) => open[m]! > 0);
    const runKey = marks.join("+");
    if (content.length === 0 || runKey !== key)
      content.push(
        marks.length === 0
          ? { type: "text", text: "" }
          : { type: "text", text: "", marks: marks.map((type) => ({ type })) },
      );
    key = runKey;
    content.at(-1)!.text += source[i]!;
    text += source[i]!;
  }
  offsets[source.length] = text.length;
  return {
    text,
    content,
    notes: noted.notes.map(({ at, note }) => ({ at: offsets[at]!, note })),
  };
}
