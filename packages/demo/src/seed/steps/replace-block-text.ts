// Minimal text diff edit on one script block's CRDT text.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";

/** Replaces `from` with `to` in `blockId` by deleting and inserting only the differing span. */
export function replaceBlockText(
  doc: CrdtDoc,
  blockId: string,
  from: string,
  to: string,
): void {
  let start = 0;
  while (start < from.length && from[start] === to[start]) start += 1;
  let end = 0;
  while (
    end < from.length - start &&
    end < to.length - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]
  )
    end += 1;
  scriptBody(doc).write((writer) => {
    writer.deleteText(blockId, start, from.length - start - end);
    writer.insertText(blockId, start, to.slice(start, to.length - end));
  });
}
