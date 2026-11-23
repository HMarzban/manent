// The anchor that finds a range of a block's text again, whatever is attached to it.
import { isCount, isObject, isString } from "./shape.ts";

/** A range of one block's text: block id, UTF-16 range, and the quoted text with what surrounds it, to find it again. */
export interface TextAnchor {
  blockId: string;
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

/** The UTF-16 units of an anchor's prefix and suffix. */
export const ANCHOR_CONTEXT_UNITS = 16;

/** Whether a stored value is an anchor, by the type of every field; it is not looked for in any block. */
export function isTextAnchor(value: unknown): value is TextAnchor {
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

const isLowSurrogate = (text: string, at: number): boolean => {
  const unit = text.charCodeAt(at);
  return unit >= 0xdc00 && unit <= 0xdfff;
};
const isHighSurrogate = (text: string, at: number): boolean => {
  const unit = text.charCodeAt(at);
  return unit >= 0xd800 && unit <= 0xdbff;
};

/**
 * The anchor of `text[start, end)`: its prefix and suffix are up to ANCHOR_CONTEXT_UNITS units each,
 * one fewer where the full length would split a surrogate pair. Throws a RangeError when the range is not
 * inside the block's text.
 */
export function textAnchorAt(
  block: { id: string; text: string },
  start: number,
  end: number,
): TextAnchor {
  const { id, text } = block;
  if (!isCount(start) || !isCount(end) || start > end || end > text.length)
    throw new RangeError(
      `an anchor's range must lie inside its block's ${text.length} units, not ${start} to ${end}`,
    );
  let from = Math.max(0, start - ANCHOR_CONTEXT_UNITS);
  if (from > 0 && isLowSurrogate(text, from)) from++;
  let to = Math.min(text.length, end + ANCHOR_CONTEXT_UNITS);
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
