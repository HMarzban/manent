// The device's own typing in a block a replay replaces, written where it was typed: a replace alone
// writes the text between the common ends, which may put the typing elsewhere in the block, under
// the device's client id, and part of what was there under it.
import { applyBlockOps, scriptBody } from "@manent/crdt";
import type { BlockWriter, CrdtDoc, TypedText } from "@manent/crdt";
import { blockText, blockView, canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockOp } from "@manent/schema";

/** The block without its typed characters; a run left empty is dropped. */
function untyped(block: BlockJSON, typed: readonly boolean[]): BlockJSON {
  let at = 0;
  const content = (block.content ?? []).flatMap((run) => {
    let text = "";
    for (let i = 0; i < run.text.length; i++)
      if (typed[at + i] !== true) text += run.text.charAt(i);
    at += run.text.length;
    return text === "" ? [] : [{ ...run, text }];
  });
  return { ...block, content };
}

/** Inserts each stretch of the block's typed characters at its place, from the start. */
function insertTyped(
  w: BlockWriter,
  id: string,
  block: BlockJSON,
  typed: readonly boolean[],
): void {
  let at = 0;
  for (const run of block.content ?? []) {
    let i = 0;
    while (i < run.text.length) {
      if (typed[at + i] !== true) {
        i++;
        continue;
      }
      let end = i + 1;
      while (end < run.text.length && typed[at + end] === true) end++;
      w.insertText(id, at + i, run.text.slice(i, end), run.marks);
      i = end;
    }
    at += run.text.length;
  }
}

/**
 * For each replace in `ops` whose block holds the text `typed` gives for it: the block replaced
 * without the typed characters, then those inserted where they stand, with their marks, under
 * `origin`. The replace then finds its text in place.
 */
export function writeTyping(
  doc: CrdtDoc,
  ops: readonly BlockOp[],
  typed: ReadonlyMap<string, TypedText>,
  origin: unknown,
): void {
  for (const op of ops) {
    if (op.op !== "replace") continue;
    const block = canonicalBlock(op.block);
    const id = block.attrs?.id;
    if (typeof id !== "string") continue;
    const found = typed.get(id);
    if (found === undefined || found.text !== blockText(blockView(block)))
      continue;
    const without: BlockOp = {
      op: "replace",
      block: untyped(block, found.typed),
    };
    applyBlockOps(doc, [without], origin);
    scriptBody(doc).write(
      (w) => insertTyped(w, id, block, found.typed),
      origin,
    );
  }
}
