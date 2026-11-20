// What prosemirror-changeset compares inside a block: characters with their marks, nodes with their attributes.
import type { TokenEncoder } from "prosemirror-changeset";
import type { CompareMode } from "./compare-mode.ts";

/** Above every UTF-16 unit, so one number holds a unit and its mark set. */
const MARK_SET_STEP = 0x200000;

/**
 * The tokens of one comparison: a character is its UTF-16 unit plus its mark
 * set's number times MARK_SET_STEP (mark sets are numbered as first met, and
 * all are 0 in text_and_elements); a node opens as "<", its name, "|" and the
 * JSON text of its attributes (only `type` in text_and_elements) and closes
 * as ">".
 */
export function createTokenEncoder(options: {
  mode: CompareMode;
}): TokenEncoder<string | number> {
  const markSets = new Map<string, number>();
  const full = options.mode === "full";
  return {
    encodeCharacter: (char, marks) => {
      if (!full) return char;
      const key = JSON.stringify(marks.map((mark) => mark.toJSON()));
      let id = markSets.get(key);
      if (id === undefined) {
        id = markSets.size;
        markSets.set(key, id);
      }
      return id * MARK_SET_STEP + char;
    },
    encodeNodeStart: (node) =>
      `<${node.type.name}|${JSON.stringify(full ? node.attrs : (node.attrs.type ?? null))}`,
    encodeNodeEnd: () => ">",
    compareTokens: (a, b) => a === b,
  };
}
