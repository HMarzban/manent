// What a recalled revision is corrected to: the pages chosen for the correction as they are now, the rest as issued.
import { sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { canonicalBlocksOf, idOf } from "../compare/align.ts";

/**
 * The issued script with the blocks `pageOf` places on one of `pages` as `current` holds them: changed
 * blocks take their current content where they were issued, removed ones go, and blocks added there
 * follow the nearest earlier block of `current` that the issued script holds. Every other block, and
 * every block without an id, stays as issued. The blocks are canonical, in even sections.
 */
export function correctedBaseline(
  issued: DocJSON,
  current: DocJSON,
  pageOf: (blockId: string) => string | null,
  pages: ReadonlySet<string>,
): DocJSON {
  const isChosen = (id: string): boolean => {
    const label = pageOf(id);
    return label !== null && pages.has(label);
  };
  const issuedBlocks = canonicalBlocksOf(issued);
  const issuedIds = new Set(issuedBlocks.flatMap((block) => idOf(block) ?? []));
  const now = new Map<string, BlockJSON>();
  // By the id of the block they follow (null: the start), the added blocks on the chosen pages.
  const added = new Map<string | null, BlockJSON[]>();
  let after: string | null = null;
  for (const block of canonicalBlocksOf(current)) {
    const id = idOf(block);
    if (id !== null && issuedIds.has(id)) {
      now.set(id, block);
      after = id;
    } else if (id !== null && isChosen(id))
      added.set(after, [...(added.get(after) ?? []), block]);
  }
  const blocks: BlockJSON[] = [...(added.get(null) ?? [])];
  for (const block of issuedBlocks) {
    const id = idOf(block);
    if (id === null) {
      blocks.push(block);
      continue;
    }
    const kept = isChosen(id) ? now.get(id) : block;
    if (kept !== undefined) blocks.push(kept);
    blocks.push(...(added.get(id) ?? []));
  }
  return sectionize(blocks);
}
