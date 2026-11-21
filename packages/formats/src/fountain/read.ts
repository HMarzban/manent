// Reading a Fountain script: its title page, its elements and notes, and what Manent keeps of the rest.
import { canonicalBlock, noteAnchorAt } from "@manent/schema";
import type {
  BlockJSON,
  BlockType,
  IdSource,
  NoteAnchor,
} from "@manent/schema";
import { FormatError } from "../script/model.ts";
import type { ImportedScript, KeptItem } from "../script/model.ts";
import { emphasisRuns, removeHiddenText } from "./inline.ts";
import type { Boneyard, NoteAt, NotedText } from "./inline.ts";
import { FOUNTAIN_LINE_LIMIT, classifyLines } from "./lines.ts";
import type { FountainLine, Span } from "./lines.ts";

const LINE_BREAK = /\r\n|\r|\n/;
const TITLE_KEY = /^([A-Za-z][A-Za-z0-9 ]*):(.*)$/;
const TAB = "    ";

/** Line, then column: where something stood in the script's body; the title page comes before line 0. */
type Place = readonly [number, number];

const isBefore = (a: Place, b: Place): boolean =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

interface Draft {
  readonly id: string;
  readonly type: BlockType;
  readonly attrs: Record<string, unknown>;
  readonly text: { text: string; readonly notes: NoteAt[] };
  readonly at: Place;
}

type Unnumbered = Omit<KeptItem, "id">;

function slice(line: NotedText, [from, to]: Span): NotedText {
  return {
    text: line.text.slice(from, to),
    notes: line.notes.map(({ at, note }) => ({
      at: Math.min(Math.max(at, from), to) - from,
      note,
    })),
  };
}

/** The next line of a speech, added to its dialogue after one space; in place, so a long speech is not copied per line. */
function append(draft: Draft, more: NotedText): void {
  const shift = draft.text.text.length + 1;
  draft.text.text += ` ${more.text}`;
  for (const { at, note } of more.notes)
    draft.text.notes.push({ at: at + shift, note });
}

/** The `Title` key's value with its continuation lines, joined by one space, emphasis removed; null when there is none. */
function titleOf(page: readonly string[]): string | null {
  const at = page.findIndex(
    (line) => TITLE_KEY.exec(line)?.[1]?.toLowerCase() === "title",
  );
  if (at === -1) return null;
  const rest = page.slice(at + 1);
  const end = rest.findIndex((line) => !/^\s/.test(line));
  const text = [
    TITLE_KEY.exec(page[at]!)![2]!,
    ...rest.slice(0, end === -1 ? rest.length : end),
  ]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ");
  const title = emphasisRuns({ text, notes: [] }).text;
  return title === "" ? null : title;
}

/** The title page, when the first line is a `Key: value` line and every line to the first blank one is another or a continuation. */
function titlePageOf(
  lines: readonly string[],
): { text: string; title: string | null; lines: number } | null {
  const end = lines.findIndex((line) => line.trim() === "");
  const page = lines.slice(0, end === -1 ? lines.length : end);
  const isPageLine = (line: string): boolean =>
    TITLE_KEY.test(line) || /^\s/.test(line);
  if (!TITLE_KEY.test(page[0] ?? "") || !page.every(isPageLine)) return null;
  return {
    text: page.join("\n"),
    title: titleOf(page),
    lines: page.length + 1,
  };
}

/** The blocks and kept items of the body, made line by line in document order. */
class Body {
  readonly drafts: Draft[] = [];
  readonly kept: { at: Place; item: Unnumbered }[] = [];
  private pending: NoteAt[] = [];
  private dialogue: Draft | null = null;
  private dual: "right" | null = null;

  constructor(private readonly ids: IdSource) {}

  /** A line that holds only notes passes them to the next line that has text. */
  hold(line: NotedText): void {
    this.pending.push(...line.notes);
  }

  read(index: number, line: NotedText, classed: FountainLine): void {
    if (classed.type !== "dialogue") this.dialogue = null;
    switch (classed.type) {
      case "blank":
        this.dual = null;
        return;
      case "speech_gap":
        return;
      case "page_break":
        this.add("page_break", index, line, [0, 0]);
        return;
      case "synopsis":
        this.synopsis(index, slice(line, classed.span));
        return;
      case "section": {
        const group = this.add("group", index, line, classed.span);
        if (classed.depth > 1)
          this.keep(
            [index, classed.span[0]],
            "fountain_markup",
            group.id,
            `section:${classed.depth}`,
            "",
          );
        return;
      }
      case "lyric": {
        const action = this.add("action", index, line, classed.span);
        this.keep(
          [index, classed.span[0]],
          "fountain_markup",
          action.id,
          "lyric",
          "",
        );
        return;
      }
      case "scene_heading": {
        const heading = this.add("scene_heading", index, line, classed.span);
        if (classed.number !== null)
          this.keep(
            [index, classed.span[1]],
            "scene_number",
            heading.id,
            "scene_number",
            classed.number,
          );
        return;
      }
      case "act_break":
        this.add("act_break", index, line, classed.span, {
          kind: classed.kind,
        });
        return;
      case "centered":
        this.add("action", index, line, classed.span, { align: "center" });
        return;
      case "character":
        this.cue(index, line, classed.span, classed.dual);
        return;
      case "dialogue":
        if (this.dialogue === null)
          this.dialogue = this.add("dialogue", index, line, classed.span);
        else append(this.dialogue, this.take(slice(line, classed.span)));
        return;
      case "parenthetical":
      case "transition":
      case "action":
        this.add(classed.type, index, line, classed.span);
        return;
      default:
        classed satisfies never;
    }
  }

  /** Notes that found no line with text after them, at the end of the last block. */
  finish(): void {
    const last = this.drafts.at(-1);
    if (last === undefined) return;
    const end = last.text.text.length;
    for (const { note } of this.pending)
      last.text.notes.push({ at: end, note });
    this.pending = [];
  }

  private take(text: NotedText): Draft["text"] {
    const held = this.pending.map(({ note }) => ({ at: 0, note }));
    this.pending = [];
    return { text: text.text, notes: [...held, ...text.notes] };
  }

  private add(
    type: BlockType,
    index: number,
    line: NotedText,
    span: Span,
    attrs: Record<string, unknown> = {},
  ): Draft {
    const speech =
      type === "character" || type === "parenthetical" || type === "dialogue";
    const draft: Draft = {
      id: this.ids(),
      type,
      attrs:
        speech && this.dual !== null ? { ...attrs, dual: this.dual } : attrs,
      text: this.take(slice(line, span)),
      at: [index, span[0]],
    };
    this.drafts.push(draft);
    return draft;
  }

  private keep(
    at: Place,
    kind: KeptItem["kind"],
    of: string | null,
    name: string,
    value: string,
  ): void {
    this.kept.push({ at, item: { kind, from: "fountain", of, name, value } });
  }

  private synopsis(index: number, text: NotedText): void {
    this.pending.push(...text.notes);
    const last = this.drafts.at(-1);
    if (last?.type === "scene_heading") {
      const before = String(last.attrs.synopsis ?? "");
      last.attrs.synopsis =
        before === "" ? text.text : `${before} ${text.text}`;
    } else
      this.keep(
        [index, 0],
        "fountain_markup",
        last?.id ?? null,
        "synopsis",
        text.text,
      );
  }

  /** A caret makes this speech the right one, and the speech just before it the left one. */
  private cue(index: number, line: NotedText, span: Span, dual: boolean): void {
    this.dual = null;
    if (dual) {
      for (let i = this.drafts.length - 1; i >= 0; i--) {
        const draft = this.drafts[i]!;
        if (
          draft.type !== "character" &&
          draft.type !== "parenthetical" &&
          draft.type !== "dialogue"
        )
          break;
        draft.attrs.dual ??= "left";
        if (draft.type === "character") break;
      }
      this.dual = "right";
    }
    this.add("character", index, line, span);
  }
}

/** The blocks, and the anchor of each note a block holds, by the note's index. */
function blocksOf(drafts: readonly Draft[]): {
  blocks: BlockJSON[];
  anchors: Map<number, NoteAnchor>;
} {
  const anchors = new Map<number, NoteAnchor>();
  const blocks = drafts.map(({ id, type, attrs, text }) => {
    const runs = emphasisRuns(text);
    for (const { at, note } of runs.notes)
      anchors.set(note, noteAnchorAt({ id, text: runs.text }, at, at));
    return canonicalBlock({
      type: "block",
      attrs: { ...attrs, id, type },
      content: runs.content,
    });
  });
  return { blocks, anchors };
}

/** Each kept item in reading order, numbered; a boneyard belongs to the block that begins before it. */
function keptOf(
  body: Body,
  boneyards: readonly Boneyard[],
  titlePage: string | null,
): KeptItem[] {
  // both lists are in reading order, so one walk finds each boneyard's block
  let before = -1;
  const placed = boneyards.map(({ line, column, text }) => {
    const at: Place = [line, column];
    while (
      before + 1 < body.drafts.length &&
      isBefore(body.drafts[before + 1]!.at, at)
    )
      before++;
    const of = body.drafts[before];
    return {
      at,
      item: {
        kind: "boneyard",
        from: "fountain",
        of: of?.id ?? null,
        name: "boneyard",
        value: text,
      } satisfies Unnumbered,
    };
  });
  const page: { at: Place; item: Unnumbered }[] =
    titlePage === null
      ? []
      : [
          {
            at: [-1, 0],
            item: {
              kind: "title_page",
              from: "fountain",
              of: null,
              name: "title_page",
              value: titlePage,
            },
          },
        ];
  return [...page, ...body.kept, ...placed]
    .toSorted((a, b) =>
      isBefore(a.at, b.at) ? -1 : isBefore(b.at, a.at) ? 1 : 0,
    )
    .map(({ item }, i) => ({ id: `k${i + 1}`, ...item }));
}

function isNoteOnly(line: NotedText): boolean {
  return line.notes.length > 0 && line.text.trim() === "";
}

/** A Fountain script; `titlePage` false for a paste, whose first lines are never a title page. Throws FormatError "malformed" for a line longer than FOUNTAIN_LINE_LIMIT. */
export function readFountain(
  text: string,
  options: { ids: IdSource; titlePage: boolean },
): ImportedScript {
  const raw = text.split(LINE_BREAK);
  const long = raw.find((line) => line.length > FOUNTAIN_LINE_LIMIT);
  if (long !== undefined)
    throw new FormatError(
      "malformed",
      `a Fountain line may hold ${FOUNTAIN_LINE_LIMIT} characters, not ${long.length}`,
    );
  const lines = raw.map((line) => line.replaceAll("\t", TAB));
  const page = options.titlePage ? titlePageOf(lines) : null;
  const hidden = removeHiddenText(lines.slice(page?.lines ?? 0).join("\n"));
  const shown = hidden.lines.filter((line) => !isNoteOnly(line));
  const classed = classifyLines(shown.map((line) => line.text));
  const body = new Body(options.ids);
  let next = 0;
  hidden.lines.forEach((line, index) => {
    if (isNoteOnly(line)) body.hold(line);
    else body.read(index, line, classed[next++]!);
  });
  body.finish();
  const { blocks, anchors } = blocksOf(body.drafts);
  return {
    from: "fountain",
    title: page?.title ?? null,
    paper: null,
    blocks,
    notes: hidden.notes.map((note, i) => ({
      id: `n${i + 1}`,
      note: {
        v: 1,
        anchor: anchors.get(i) ?? null,
        text: note,
        writerName: null,
        at: null,
      },
    })),
    production: null,
    kept: keptOf(body, hidden.boneyards, page?.text ?? null),
    coloursMapped: 0,
    unread: [],
  };
}
