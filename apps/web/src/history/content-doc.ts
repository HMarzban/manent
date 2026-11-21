// A version's content as a script document, for drawing, comparing and restoring it.
import { rejects, sectionize, validateBlocks } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";

/** True when the schema refuses none of `blocks`: each is then a block as `BlockJSON` describes it. */
const isBlockList = (blocks: readonly unknown[]): blocks is BlockJSON[] =>
  !rejects(validateBlocks(blocks, { isIdTaken: () => false }));

/** The blocks in even sections; null when the schema refuses one of them. */
export function docOfContent(content: VersionContent): DocJSON | null {
  return isBlockList(content.blocks) ? sectionize(content.blocks) : null;
}
