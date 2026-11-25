// Final Draft's script notes: inline at a paragraph's start, or ranged over the script's offsets.
import { textAnchorAt } from "@manent/schema";
import type { ScriptNote, TextAnchor } from "@manent/schema";
import { attr, elementsOf, paragraphText, withoutAttributes } from "./kept.ts";
import { blockAtOffset } from "./offsets.ts";
import type { XmlNode } from "../xml/node.ts";

const DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;
const RANGE = /^(\d+),(\d+)$/;

/** A note, and its attributes and elements Manent does not show as a `<ScriptNote>`, null when there are none. */
export interface NoteReading {
  readonly note: ScriptNote;
  readonly part: XmlNode | null;
}

/** `YYYYMMDDTHHMMSS` read as UTC, in milliseconds since the epoch; null for anything else. */
function parseDateTime(value: string | null): number | null {
  const parts = value === null ? null : DATE_TIME.exec(value);
  if (parts === null) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const at = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  const date = new Date(at);
  return date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day! &&
    date.getUTCHours() === hour! &&
    date.getUTCMinutes() === minute! &&
    date.getUTCSeconds() === second!
    ? at
    : null;
}

function readNote(
  node: XmlNode,
  anchor: TextAnchor | null,
  writerAttribute: string,
  taken: Set<string>,
): NoteReading {
  const at = parseDateTime(attr(node, "DateTime"));
  if (at !== null) taken.add("DateTime");
  taken.add(writerAttribute);
  const paragraphs = elementsOf(node).filter(
    (child) => child.name === "Paragraph",
  );
  const others = elementsOf(node).filter((child) => child.name !== "Paragraph");
  const attributes = withoutAttributes(node, taken);
  return {
    note: {
      v: 1,
      anchor,
      text: paragraphs.map(paragraphText).join("\n"),
      writerName: attr(node, writerAttribute),
      at,
    },
    part:
      Object.keys(attributes).length === 0 && others.length === 0
        ? null
        : { name: "ScriptNote", attributes, children: others },
  };
}

/** A note written inside a paragraph (Final Draft 8 to 11): it sits at the start of its block. */
export function readInlineNote(
  node: XmlNode,
  block: { id: string; text: string },
): NoteReading {
  return readNote(node, textAnchorAt(block, 0, 0), "Author", new Set());
}

/**
 * A note of the script's `ScriptNotes` list (Final Draft 13): anchored at the block holding its range's
 * start, its range clamped to that block. A range that cannot be placed gives a note without an anchor,
 * and the `Range` is kept.
 */
export function readRangedNote(
  node: XmlNode,
  blocks: readonly { id: string; text: string }[],
  starts: Int32Array,
): NoteReading {
  const range = RANGE.exec(attr(node, "Range") ?? "");
  const from = range === null ? null : Number(range[1]);
  const to = range === null ? null : Number(range[2]);
  const at =
    from === null || to === null || to < from
      ? null
      : blockAtOffset(starts, from);
  const block = at === null ? undefined : blocks[at.block];
  if (at === null || block === undefined || to === null)
    return readNote(node, null, "WriterName", new Set());
  const start = Math.min(at.offset, block.text.length);
  const end = Math.min(to - starts[at.block]!, block.text.length);
  return readNote(
    node,
    textAnchorAt(block, start, end),
    "WriterName",
    new Set(["Range"]),
  );
}

const pad = (value: number, width: number): string =>
  String(value).padStart(width, "0");

/** `YYYYMMDDTHHMMSS` in UTC, as a file gives a note's time. */
function formatDateTime(at: number): string {
  const d = new Date(at);
  return (
    pad(d.getUTCFullYear(), 4) +
    pad(d.getUTCMonth() + 1, 2) +
    pad(d.getUTCDate(), 2) +
    "T" +
    pad(d.getUTCHours(), 2) +
    pad(d.getUTCMinutes(), 2) +
    pad(d.getUTCSeconds(), 2)
  );
}

function writeNote(
  note: ScriptNote,
  part: XmlNode | null,
  own: Readonly<Record<string, string>>,
): XmlNode {
  return {
    name: "ScriptNote",
    attributes: {
      ...part?.attributes,
      ...own,
      ...(note.at === null ? {} : { DateTime: formatDateTime(note.at) }),
    },
    children: [
      ...note.text.split("\n").map((line) => ({
        name: "Paragraph",
        attributes: {},
        children: [{ name: "Text", attributes: {}, children: [line] }],
      })),
      ...(part?.children ?? []),
    ],
  };
}

/** A note at the start of its block, written inside the block's paragraph, with its kept `part`. */
export function writeInlineNote(
  note: ScriptNote,
  part: XmlNode | null,
): XmlNode {
  return writeNote(
    note,
    part,
    note.writerName === null ? {} : { Author: note.writerName },
  );
}

/** A note of the script's `ScriptNotes` list: `range` its script offsets, null for a note on no text. */
export function writeRangedNote(
  note: ScriptNote,
  part: XmlNode | null,
  range: readonly [number, number] | null,
): XmlNode {
  return writeNote(note, part, {
    ...(range === null ? {} : { Range: `${range[0]},${range[1]}` }),
    ...(note.writerName === null ? {} : { WriterName: note.writerName }),
  });
}
