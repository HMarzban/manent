// The anchor that finds a range of a block's text again, whatever is attached to it.
import type { NoteAnchor } from "./notes.ts";
import { isCount, isObject, isString } from "./shape.ts";

export {
  NOTE_CONTEXT_UNITS as ANCHOR_CONTEXT_UNITS,
  noteAnchorAt as textAnchorAt,
} from "./notes.ts";
export type { NoteAnchor as TextAnchor } from "./notes.ts";

/** Whether a stored value is an anchor, by the type of every field; it is not looked for in any block. */
export function isTextAnchor(value: unknown): value is NoteAnchor {
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
