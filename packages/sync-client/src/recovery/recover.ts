// What a permanently rejected push held that the server lacks, filed as Recovered text.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { RecoveredItem } from "../ports/ports.ts";

/** The blocks of every section, in document order, each with its id; a block with none is passed over. */
function blockList(doc: DocJSON): { id: string; block: BlockJSON }[] {
  return (doc.content ?? []).flatMap((section) =>
    (section.content ?? []).flatMap((block) => {
      const id = block.attrs?.id;
      return typeof id === "string" ? [{ id, block }] : [];
    }),
  );
}

function byId(doc: DocJSON): Map<string, string> {
  return new Map(
    blockList(doc).map(({ id, block }) => [
      id,
      JSON.stringify(canonicalBlock(block)),
    ]),
  );
}

/**
 * The text of every run, joined. Read from the runs, not through `blockView`,
 * which throws for an attribute the server refused, the very block filed here.
 */
function textOf(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

/**
 * Whole blocks of `mine`, in document order, that differ from `base` (or that
 * `base` lacks) and that `theirs` does not hold equal. `nearBlockId` is the
 * nearest earlier block of `mine` that `theirs` holds. A block only `mine`
 * deleted lists nothing: a deletion has no text.
 */
function rejectedText(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
): { blockId: string; nearBlockId: string | null; text: string }[] {
  const before = byId(base);
  const held = byId(theirs);
  const listed: {
    blockId: string;
    nearBlockId: string | null;
    text: string;
  }[] = [];
  let near: string | null = null;
  for (const { id, block } of blockList(mine)) {
    const json = JSON.stringify(canonicalBlock(block));
    if (before.get(id) !== json && held.get(id) !== json)
      listed.push({ blockId: id, nearBlockId: near, text: textOf(block) });
    if (held.has(id)) near = id;
  }
  return listed;
}

/** `rejectedText` as Recovered text of the document, each item under an id from `newId`. */
export function rejectedItems(input: {
  docId: string;
  base: DocJSON;
  mine: DocJSON;
  theirs: DocJSON;
  recoveredAt: number;
  newId: () => string;
}): RecoveredItem[] {
  return rejectedText(input.base, input.mine, input.theirs).map((found) => ({
    id: input.newId(),
    docId: input.docId,
    ...found,
    recoveredAt: input.recoveredAt,
    cause: "rejected",
  }));
}
