// Blocks written back into the script with their IDs, as a scene move and a restore from cuts write them.
import { formatFrom } from "@manent/schema";
import type { BlockJSON, BlockOp, IdSource } from "@manent/schema";

/**
 * Inserts of `blocks` in order, the first after `after` (null: the start of the script), each with its `from` naming
 * itself, as findCopies reads a moved block. Every block holds a string ID.
 */
export function reinsertOps(
  blocks: readonly BlockJSON[],
  after: string | null,
  ids: IdSource,
): BlockOp[] {
  let anchor = after;
  return blocks.map((block) => {
    const id = String(block.attrs?.id);
    const op: BlockOp = {
      op: "insert",
      after: anchor,
      block: {
        ...block,
        attrs: { ...block.attrs, from: formatFrom(id, ids()) },
      },
    };
    anchor = id;
    return op;
  });
}
