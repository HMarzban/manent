// A paragraph's Text runs: its text, its marks, the sets that mark it, and what else each run says.
import type { MarkJSON, TextJSON } from "@manent/schema";
import {
  FDX_HIGHLIGHTS,
  FDX_TEXT_COLOURS,
  nearestColour,
  parseFdxColour,
} from "./colours.ts";
import { elementsOf, textOf } from "./kept.ts";
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
      keptRuns.push({
        name: "Run",
        attributes: {
          Start: String(start),
          End: String(text.length),
          ...reading.rest,
        },
        children: [],
      });
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
