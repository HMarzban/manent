// Final Draft's script notes: inline at a paragraph's start, or ranged over the script's offsets.
import { noteAnchorAt } from "@manent/schema";
import type { NoteAnchor, ScriptNote } from "@manent/schema";
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
  anchor: NoteAnchor | null,
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
  return readNote(node, noteAnchorAt(block, 0, 0), "Author", new Set());
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
    noteAnchorAt(block, start, end),
    "WriterName",
    new Set(["Range"]),
  );
}
