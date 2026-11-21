// A paragraph's Text runs: its text, its marks, the sets that mark it, and what else each run says.
import type { RevisionSource } from "@manent/revisions";
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
import {
  FDX_HIGHLIGHTS,
  FDX_TEXT_COLOURS,
  fdxColour,
  nearestColour,
  parseFdxColour,
} from "./colours.ts";
import { attr, elementsOf, textOf, withoutAttributes } from "./kept.ts";
import type { XmlNode } from "../xml/node.ts";

const STYLE_MARKS: ReadonlyMap<string, string> = new Map([
  ["Bold", "bold"],
  ["Italic", "italic"],
  ["Underline", "underline"],
  ["Strikeout", "strike"],
  ["AllCaps", "caps"],
]);
/** Run attributes whose value here is what a run without them shows. */
const RUN_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  Font: "Courier Final Draft",
  Size: "12",
  AdornmentStyle: "0",
  RevisionID: "0",
});
const BLACK = Object.freeze([0, 0, 0] as const);
const WHITE = Object.freeze([255, 255, 255] as const);
const LINE_BREAK = /[\n\r]/g;
const RUN_PLACE: ReadonlySet<string> = new Set(["Start", "End"]);

/** The text of a block's runs, joined. */
export function blockTextOf(block: BlockJSON | undefined): string {
  return (block?.content ?? []).map((run) => run.text).join("");
}

/** A range of a paragraph's text that a revision set marks, in UTF-16 units. */
export interface RevisionRun {
  readonly revisionId: string;
  readonly start: number;
  readonly end: number;
}

export interface ParagraphRuns {
  readonly text: string;
  readonly content: TextJSON[];
  /** `<Runs>` of a `<Run Start End …>` for each run with attributes Manent does not show; null when none has. */
  readonly kept: XmlNode | null;
  /** Runs whose colour or highlight was not exactly one of Manent's. */
  readonly mapped: number;
  readonly revisions: RevisionRun[];
}

interface RunReading {
  readonly marks: MarkJSON[];
  readonly rest: Record<string, string>;
  readonly mapped: boolean;
  readonly revisionId: string | null;
}

function colourMark(
  value: string,
  type: "color" | "highlight",
): { mark: MarkJSON | null; mapped: boolean } | null {
  const rgb = parseFdxColour(value);
  if (rgb === null) return null;
  const nearest =
    type === "color"
      ? nearestColour(rgb, FDX_TEXT_COLOURS, BLACK)
      : nearestColour(rgb, FDX_HIGHLIGHTS, WHITE);
  return {
    mark:
      nearest.name === null ? null : { type, attrs: { value: nearest.name } },
    mapped: !nearest.exact,
  };
}

function readRun(run: XmlNode, revisionIds: ReadonlySet<string>): RunReading {
  const marks: MarkJSON[] = [];
  const rest: Record<string, string> = {};
  let mapped = false;
  let revisionId: string | null = null;
  for (const [name, value] of Object.entries(run.attributes)) {
    if (name === "Style") {
      const kept = value.split("+").filter((token) => {
        const mark = STYLE_MARKS.get(token);
        if (mark !== undefined) marks.push({ type: mark });
        return mark === undefined && token !== "";
      });
      if (kept.length > 0) rest[name] = kept.join("+");
      continue;
    }
    const colour =
      name === "Color" || name === "Background"
        ? colourMark(value, name === "Color" ? "color" : "highlight")
        : null;
    if (colour !== null) {
      if (colour.mark !== null) marks.push(colour.mark);
      mapped ||= colour.mapped;
    } else if (name === "RevisionID" && revisionIds.has(value))
      revisionId = value;
    else if (RUN_DEFAULTS[name] !== value) rest[name] = value;
  }
  return { marks, rest, mapped, revisionId };
}

const sameAttributes = (
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([key, value]) => b[key] === value);

/** A `<Run>` for `[start, end)`, joined to the one before when that ends at `start` with the same attributes. */
function keepRun(
  runs: XmlNode[],
  start: number,
  end: number,
  rest: Readonly<Record<string, string>>,
): void {
  const last = runs.at(-1);
  if (last !== undefined) {
    const attributes = withoutAttributes(last, RUN_PLACE);
    if (
      attr(last, "End") === String(start) &&
      sameAttributes(attributes, rest)
    ) {
      runs[runs.length - 1] = {
        ...last,
        attributes: { ...last.attributes, End: String(end) },
      };
      return;
    }
  }
  runs.push({
    name: "Run",
    attributes: { Start: String(start), End: String(end), ...rest },
    children: [],
  });
}

/**
 * The paragraph's runs read in order: their text joined (a line break inside a run becomes a space), a mark
 * for each style, colour and highlight Manent has, and the ranges marked by a set whose id is in `revisionIds`.
 */
export function readRuns(
  paragraph: XmlNode,
  revisionIds: ReadonlySet<string>,
): ParagraphRuns {
  const content: TextJSON[] = [];
  const keptRuns: XmlNode[] = [];
  const revisions: RevisionRun[] = [];
  let text = "";
  let mapped = 0;
  for (const run of elementsOf(paragraph)) {
    if (run.name !== "Text") continue;
    const runText = textOf(run).replace(LINE_BREAK, " ");
    if (runText === "") continue;
    const start = text.length;
    text += runText;
    const reading = readRun(run, revisionIds);
    content.push(
      reading.marks.length === 0
        ? { type: "text", text: runText }
        : { type: "text", text: runText, marks: reading.marks },
    );
    if (reading.mapped) mapped++;
    if (reading.revisionId !== null)
      revisions.push({
        revisionId: reading.revisionId,
        start,
        end: text.length,
      });
    if (Object.keys(reading.rest).length > 0)
      keepRun(keptRuns, start, text.length, reading.rest);
  }
  return {
    text,
    content,
    kept:
      keptRuns.length === 0
        ? null
        : { name: "Runs", attributes: {}, children: keptRuns },
    mapped,
    revisions,
  };
}

const MARK_STYLES: ReadonlyMap<string, string> = new Map(
  [...STYLE_MARKS].map(([token, mark]) => [mark, token]),
);
const STYLE_ORDER = [...STYLE_MARKS.keys()];
const isLowSurrogate = (unit: number): boolean =>
  unit >= 0xdc00 && unit <= 0xdfff;

const tableValue = (
  table: Readonly<Record<string, readonly [number, number, number]>>,
  value: unknown,
): string | null =>
  typeof value === "string" && Object.hasOwn(table, value)
    ? fdxColour(table[value]!)
    : null;

/** The attributes a run is written with for its marks; the names of the marks a file cannot hold go in `leftOut`. */
function markAttributes(
  marks: readonly MarkJSON[],
  leftOut: Set<string>,
): { styles: string[]; colours: Record<string, string> } {
  const styles: string[] = [];
  const colours: Record<string, string> = {};
  for (const mark of marks) {
    const style = MARK_STYLES.get(mark.type);
    const color =
      mark.type === "color"
        ? tableValue(FDX_TEXT_COLOURS, mark.attrs?.value)
        : null;
    const background =
      mark.type === "highlight"
        ? tableValue(FDX_HIGHLIGHTS, mark.attrs?.value)
        : null;
    if (style !== undefined) styles.push(style);
    else if (color !== null) colours.Color = color;
    else if (background !== null) colours.Background = background;
    else leftOut.add(mark.type);
  }
  return {
    styles: styles.toSorted(
      (a, b) => STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b),
    ),
    colours,
  };
}

/** Where a kept `<Run>` lies in the block's text, and the attributes it keeps. */
function keptRunsOf(
  kept: XmlNode | null,
): { start: number; end: number; rest: Record<string, string> }[] {
  return (kept === null ? [] : elementsOf(kept)).map((run) => ({
    start: Number(attr(run, "Start")),
    end: Number(attr(run, "End")),
    rest: withoutAttributes(run, RUN_PLACE),
  }));
}

/**
 * A block's text as `Text` runs, split wherever its marks, its revision or its kept run attributes change:
 * `revisions[u]` is the ordinal of the set that marks unit `u`, 0 for none. Marks a file cannot hold are
 * left off, and named in `leftOut`.
 */
export function writeRuns(
  content: readonly TextJSON[],
  kept: XmlNode | null,
  revisions: Int32Array,
): { runs: XmlNode[]; leftOut: string[] } {
  const leftOut = new Set<string>();
  const keptRuns = keptRunsOf(kept);
  const pieces: { text: string; attributes: Record<string, string> }[] = [];
  let at = 0;
  for (const node of content) {
    const { styles, colours } = markAttributes(node.marks ?? [], leftOut);
    for (let u = 0; u < node.text.length; u++, at++) {
      const { Style, ...rest } =
        keptRuns.find((run) => run.start <= at && at < run.end)?.rest ?? {};
      const style = [...styles, ...(Style === undefined ? [] : [Style])];
      const revision = revisions[at] ?? 0;
      const attributes: Record<string, string> = {
        ...rest,
        ...(style.length === 0 ? {} : { Style: style.join("+") }),
        ...colours,
        ...(revision === 0 ? {} : { RevisionID: String(revision) }),
      };
      const last = pieces.at(-1);
      // a surrogate pair is never split between two runs
      if (
        last !== undefined &&
        (sameAttributes(last.attributes, attributes) ||
          isLowSurrogate(node.text.charCodeAt(u)))
      )
        last.text += node.text[u];
      else pieces.push({ text: node.text[u]!, attributes });
    }
  }
  const runs = pieces.map(({ text, attributes }) => ({
    name: "Text",
    attributes,
    children: [text],
  }));
  return {
    runs:
      runs.length === 0
        ? [{ name: "Text", attributes: {}, children: [""] }]
        : runs,
    leftOut: [...leftOut],
  };
}

/** Each unit of a block's text: the ordinal of the latest source whose mark covers it, 0 for none. */
export function revisionsOf(
  sources: readonly RevisionSource[],
  blockId: string,
  length: number,
): Int32Array {
  const units = new Int32Array(length);
  for (const source of sources) {
    const mark = source.marks.get(blockId);
    if (mark === undefined) continue;
    const ranges =
      mark.kind === "whole" ? [[0, length] as const] : mark.inserted;
    for (const [start, end] of ranges)
      units.fill(source.ordinal, Math.max(0, start), Math.min(length, end));
  }
  return units;
}
