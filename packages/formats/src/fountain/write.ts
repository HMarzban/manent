// Writing a script as Fountain: each element in the form the reader takes back, forced only where it would read as another.
import { renderedType } from "@manent/schema";
import type { BlockJSON, BlockType, TextJSON } from "@manent/schema";
import type {
  KeptItem,
  ScriptForExport,
  WrittenFile,
} from "../script/model.ts";
import {
  FOUNTAIN_ESCAPED,
  FOUNTAIN_MARKS,
  emphasisRuns,
  fountainNote,
} from "./inline.ts";
import type { FountainMark } from "./inline.ts";
import { FOUNTAIN_LINE_LIMIT, TITLE_KEY_LINE, classifyLines } from "./lines.ts";
import type { FountainLine } from "./lines.ts";

type Made = Omit<KeptItem, "id">;

/** The label of each element Fountain has no form for, which is written as action; null for an element it has. */
const LACKING: Readonly<Record<BlockType, string | null>> = {
  scene_heading: null,
  action: null,
  character: null,
  parenthetical: null,
  dialogue: null,
  transition: null,
  shot: "Shot",
  general: "General",
  slug: "Slug",
  bracket: "Bracket",
  emote: "Emote",
  camera: "Camera",
  engine: "Engine Direction",
  ink_line: "Ink line",
  act_break: null,
  group: null,
  page_break: null,
  chapter: "Chapter",
  body: "Body",
  break: "Break",
  quote: "Quote",
  graphic: "Graphic",
};

const MARKERS: Readonly<Record<FountainMark, string>> = {
  bold: "**",
  italic: "*",
  underline: "_",
};
/** Underline opens outside the stars, and bold outside italic. */
const OPEN_ORDER: readonly FountainMark[] = ["underline", "bold", "italic"];
const SPEECH_LINES: readonly string[] = ["parenthetical", "dialogue"];

/** A note's text at its UTF-16 offset in its block. */
interface Placed {
  readonly at: number;
  readonly text: string;
}

const escaped = (char: string): string =>
  FOUNTAIN_ESCAPED.includes(char) ? `\\${char}` : char;

const marksOf = (run: TextJSON): FountainMark[] =>
  FOUNTAIN_MARKS.filter((mark) => run.marks?.some((m) => m.type === mark));

/**
 * How emphasis is written: `nested` keeps a mark open across runs that share it, `flat` closes every mark at each
 * change; Fountain's markers cannot say every pair of runs one way, and a block neither way says is written plain.
 */
type Markup = "nested" | "flat" | "plain";
const MARKUPS: readonly Markup[] = ["nested", "flat"];

/** A block's runs as Fountain text: its emphasis as `markup` says, escapes, and each note at its offset. */
function markedUp(
  runs: readonly TextJSON[],
  notes: readonly Placed[],
  markup: Markup,
): string {
  const open: FountainMark[] = [];
  let out = "";
  let at = 0;
  let next = 0;
  const notesTo = (offset: number): void => {
    for (; next < notes.length && notes[next]!.at <= offset; next++)
      out += fountainNote(notes[next]!.text);
  };
  for (const run of runs) {
    const marks = markup === "plain" ? [] : marksOf(run);
    const closing = open.findIndex((mark) => !marks.includes(mark));
    const kept = markup === "flat" ? 0 : closing === -1 ? open.length : closing;
    for (const mark of open.splice(kept).toReversed()) out += MARKERS[mark];
    for (const mark of OPEN_ORDER)
      if (marks.includes(mark) && !open.includes(mark)) {
        out += MARKERS[mark];
        open.push(mark);
      }
    for (const char of run.text) {
      notesTo(at);
      out += escaped(char);
      at += char.length;
    }
  }
  notesTo(Infinity);
  for (const mark of open.toReversed()) out += MARKERS[mark];
  return out;
}

/** The runs' text, merged where the Fountain marks are the same: what the reader can give back. */
function fountainRuns(runs: readonly TextJSON[]): string {
  const merged: [string, string][] = [];
  for (const run of runs) {
    const key = marksOf(run).join("+");
    const last = merged.at(-1);
    if (last?.[1] === key) last[0] += run.text;
    else if (run.text !== "") merged.push([run.text, key]);
  }
  return JSON.stringify(merged);
}

/** How the reader takes `line` between blank lines, or before a line of speech when `speech`. */
function readsAs(line: string, speech: boolean): FountainLine {
  return classifyLines(["", line, speech ? "x" : ""])[1]!;
}

/** Whether the reader takes `line` as an element of `type` whose text is all of `text`. */
function isRead(
  read: FountainLine,
  line: string,
  type: FountainLine["type"],
  text: string,
): boolean {
  return (
    read.type === type &&
    "span" in read &&
    line.slice(read.span[0], read.span[1]) === text
  );
}

/** The Fountain items of a record, by the block they belong to; a null block is the script's start. */
class Kept {
  titlePage: string | null = null;
  readonly numbers = new Map<string, string>();
  readonly lyrics = new Set<string | null>();
  readonly depths = new Map<string | null, number>();
  readonly synopses = new Map<string | null, string[]>();
  readonly boneyards = new Map<string | null, string[]>();

  constructor(items: readonly KeptItem[]) {
    for (const { kind, from, of, name, value } of items) {
      if (from !== "fountain" || typeof value !== "string") continue;
      if (kind === "title_page") this.titlePage = value;
      else if (kind === "scene_number" && of !== null)
        this.numbers.set(of, value);
      else if (kind === "boneyard") push(this.boneyards, of, value);
      else if (kind === "fountain_markup" && name === "lyric")
        this.lyrics.add(of);
      else if (kind === "fountain_markup" && name === "synopsis")
        push(this.synopses, of, value);
      else if (kind === "fountain_markup" && name.startsWith("section:"))
        this.section(of, Number(name.slice("section:".length)));
    }
  }

  /** A record is read from storage: a depth no line could hold is not written. */
  private section(of: string | null, depth: number): void {
    if (Number.isInteger(depth) && depth > 1 && depth <= FOUNTAIN_LINE_LIMIT)
      this.depths.set(of, depth);
  }
}

function push<K>(map: Map<K, string[]>, key: K, value: string): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** The body's elements, as groups of lines with one blank line between groups. */
class Body {
  readonly groups: string[][] = [];
  readonly made: Made[] = [];
  /** Synopsis lines that follow the group being written once it ends. */
  private trailing: string[] = [];
  private previous: string | null = null;

  constructor(
    private readonly kept: Kept,
    private readonly notes: ReadonlyMap<string, Placed[]>,
    /** The first line must not read as a title page's: no title page is written before it. */
    private readonly untitled: boolean,
  ) {
    for (const value of kept.boneyards.get(null) ?? [])
      this.groups.push([`/*${value}*/`]);
    for (const value of kept.synopses.get(null) ?? [])
      this.groups.push([`= ${value}`]);
  }

  block(block: BlockJSON, next: BlockJSON | undefined): void {
    const id = block.attrs?.id ?? "";
    const type = renderedType(block.attrs?.type ?? "action");
    const speech =
      SPEECH_LINES.includes(type) &&
      this.previous !== null &&
      (this.previous === "character" || SPEECH_LINES.includes(this.previous));
    if (!speech) this.startGroup();
    const group = this.groups.at(-1)!;
    if (speech && type === "dialogue" && this.previous === "dialogue")
      group.push("  ");
    const label = LACKING[type];
    if (label !== null)
      this.made.push({
        kind: "element_type",
        from: "fountain",
        of: id,
        name: label,
        value: "",
      });
    const line = this.line(block, id, type, next);
    group.push(
      line +
        (this.kept.boneyards.get(id) ?? []).map((b) => `/*${b}*/`).join(""),
    );
    const synopsis = block.attrs?.synopsis ?? "";
    if (synopsis !== "") this.trailing.push(`= ${synopsis}`);
    for (const value of this.kept.synopses.get(id) ?? [])
      this.trailing.push(`= ${value}`);
    this.previous = type;
  }

  /** The notes that sit on no block of the script, on one line at the end. */
  finish(loose: readonly string[]): void {
    this.flush();
    if (loose.length > 0) this.groups.push([loose.map(fountainNote).join("")]);
  }

  private startGroup(): void {
    this.flush();
    this.groups.push([]);
  }

  private flush(): void {
    for (const line of this.trailing) this.groups.push([line]);
    this.trailing = [];
  }

  private line(
    block: BlockJSON,
    id: string,
    type: BlockType,
    next: BlockJSON | undefined,
  ): string {
    const runs = this.runsOf(block, id);
    const bare = markedUp(runs.content, [], runs.markup);
    const full = markedUp(runs.content, this.notes.get(id) ?? [], runs.markup);
    const first = this.untitled && this.groups.length === 1;
    const plain = (line: string, fits: (read: FountainLine) => boolean) =>
      fits(readsAs(line, false)) && !(first && TITLE_KEY_LINE.test(line));
    switch (type) {
      case "page_break":
        return `===${full}`;
      case "group":
        return `${"#".repeat(this.kept.depths.get(id) ?? 1)} ${full}`;
      case "act_break":
        return `> ${full} <`;
      case "parenthetical":
      case "dialogue":
        return full;
      case "scene_heading": {
        const number = this.kept.numbers.get(id) ?? null;
        const suffix = number === null ? "" : ` #${number}#`;
        const natural = plain(
          bare + suffix,
          (read) =>
            isRead(read, bare + suffix, "scene_heading", bare) &&
            read.type === "scene_heading" &&
            read.number === number,
        );
        return `${natural ? "" : "."}${full}${suffix}`;
      }
      case "character": {
        const caret = block.attrs?.dual === "right" ? " ^" : "";
        const speech = SPEECH_LINES.includes(next?.attrs?.type ?? "");
        const read = readsAs(bare + caret, speech);
        const natural =
          isRead(read, bare + caret, "character", bare) &&
          read.type === "character" &&
          read.dual === (caret !== "") &&
          !(first && TITLE_KEY_LINE.test(bare + caret));
        return `${natural ? "" : "@"}${full}${caret}`;
      }
      case "transition":
        return plain(bare, (read) => isRead(read, bare, "transition", bare))
          ? full
          : `>${full}`;
    }
    if (this.kept.lyrics.has(id)) return `~${full}`;
    if (block.attrs?.align === "center") return `> ${full} <`;
    return plain(bare, (read) => isRead(read, bare, "action", bare))
      ? full
      : `!${full}`;
  }

  /** The block's runs and how their emphasis is written; the marks Fountain cannot write are named in `made`. */
  private runsOf(
    block: BlockJSON,
    id: string,
  ): { content: readonly TextJSON[]; markup: Markup } {
    const content = block.content ?? [];
    const named = new Set<string>();
    const name = (mark: string): void => {
      if (named.has(mark)) return;
      named.add(mark);
      this.made.push({
        kind: "run_part",
        from: "fountain",
        of: id,
        name: mark,
        value: "",
      });
    };
    for (const run of content)
      for (const { type } of run.marks ?? [])
        if (!FOUNTAIN_MARKS.some((mark) => mark === type)) name(type);
    const wanted = fountainRuns(content);
    const markup = MARKUPS.find((way) => {
      const text = markedUp(content, [], way);
      return fountainRuns(emphasisRuns({ text, notes: [] }).content) === wanted;
    });
    if (markup !== undefined) return { content, markup };
    for (const run of content) for (const mark of marksOf(run)) name(mark);
    return { content, markup: "plain" };
  }
}

/** The notes of each block by offset, and the text of those that sit on no block of the script. */
function placedNotes(script: ScriptForExport): {
  byBlock: Map<string, Placed[]>;
  loose: string[];
} {
  const ids = new Set(script.blocks.map((block) => block.attrs?.id));
  const byBlock = new Map<string, Placed[]>();
  const loose: string[] = [];
  for (const { note } of script.notes) {
    const anchor = note.anchor;
    if (anchor === null || !ids.has(anchor.blockId)) loose.push(note.text);
    else {
      const list = byBlock.get(anchor.blockId) ?? [];
      list.push({ at: anchor.start, text: note.text });
      byBlock.set(anchor.blockId, list);
    }
  }
  for (const list of byBlock.values()) list.sort((a, b) => a.at - b.at);
  return { byBlock, loose };
}

/**
 * The script as Fountain. A Fountain import's title page is written back as it came; a script from anywhere else
 * gets one made from its title. `leftOut` names what Fountain cannot hold: marks and elements it has no form for,
 * then the kept items of another format.
 */
export function writeFountain(script: ScriptForExport): WrittenFile {
  const items = script.record?.kept ?? [];
  const kept = new Kept(items);
  const page =
    script.record?.from === "fountain"
      ? kept.titlePage
      : `Title: ${script.title}`;
  const { byBlock, loose } = placedNotes(script);
  const body = new Body(kept, byBlock, page === null);
  script.blocks.forEach((block, i) => body.block(block, script.blocks[i + 1]));
  body.finish(loose);
  const groups = page === null ? body.groups : [[page], ...body.groups];
  const lines = groups.flatMap((group, i) =>
    i === 0 ? group : ["", ...group],
  );
  return {
    text: lines.length === 0 ? "" : `${lines.join("\n")}\n`,
    leftOut: [
      ...body.made.map((item, i) => ({
        id: `k${items.length + i + 1}`,
        ...item,
      })),
      ...items.filter((item) => item.from !== "fountain"),
    ],
  };
}
