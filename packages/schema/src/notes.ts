// A writer's note in the script, and the anchor that finds its text again.
import { isCount, isObject, isString } from "./shape.ts";

/** Where a note sits: block id, UTF-16 range, and the quoted text with what surrounds it, to find it again. */
export interface NoteAnchor {
  blockId: string;
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

/** A writer's note in the script (the interface word "Note"). `at` is when it was written, null when the file gave no time. */
export interface ScriptNote {
  v: 1;
  anchor: NoteAnchor | null;
  text: string;
  writerName: string | null;
  at: number | null;
}

/** The UTF-16 units of an anchor's prefix and suffix. */
export const NOTE_CONTEXT_UNITS = 16;

function isNoteAnchor(value: unknown): value is NoteAnchor {
  return (
    isObject(value) &&
    isString(value.blockId) &&
    isCount(value.start) &&
    isCount(value.end) &&
    isString(value.quote) &&
    isString(value.prefix) &&
    isString(value.suffix)
  );
}

/** Whether a stored value is a note of this version, by the type of every field; its anchor is not looked for in any block. */
export function isScriptNote(value: unknown): value is ScriptNote {
  return (
    isObject(value) &&
    value.v === 1 &&
    (value.anchor === null || isNoteAnchor(value.anchor)) &&
    isString(value.text) &&
    (value.writerName === null || isString(value.writerName)) &&
    (value.at === null || Number.isInteger(value.at))
  );
}

const isLowSurrogate = (text: string, at: number): boolean => {
  const unit = text.charCodeAt(at);
  return unit >= 0xdc00 && unit <= 0xdfff;
};
const isHighSurrogate = (text: string, at: number): boolean => {
  const unit = text.charCodeAt(at);
  return unit >= 0xd800 && unit <= 0xdbff;
};

/**
 * The anchor of `text[start, end)`: its prefix and suffix are up to NOTE_CONTEXT_UNITS units each,
 * one fewer where the full length would split a surrogate pair. Throws a RangeError when the range is not
 * inside the block's text.
 */
export function noteAnchorAt(
  block: { id: string; text: string },
  start: number,
  end: number,
): NoteAnchor {
  const { id, text } = block;
  if (!isCount(start) || !isCount(end) || start > end || end > text.length)
    throw new RangeError(
      `a note's range must lie inside its block's ${text.length} units, not ${start} to ${end}`,
    );
  let from = Math.max(0, start - NOTE_CONTEXT_UNITS);
  if (from > 0 && isLowSurrogate(text, from)) from++;
  let to = Math.min(text.length, end + NOTE_CONTEXT_UNITS);
  if (to < text.length && isHighSurrogate(text, to - 1)) to--;
  return {
    blockId: id,
    start,
    end,
    quote: text.slice(start, end),
    prefix: text.slice(from, start),
    suffix: text.slice(end, to),
  };
}
