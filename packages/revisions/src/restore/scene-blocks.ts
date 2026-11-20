// The blocks a scene holds: its heading and everything up to the next heading.
import type { DocJSON } from "@manent/schema";
import { canonicalBlocksOf, idOf, isSceneHeading } from "../compare/align.ts";

/**
 * The ids of the heading and of the blocks up to the next SCENE_HEADINGS
 * block, in order (a block without an id is left out); [] when the document
 * lacks the heading.
 */
export function sceneBlocks(
  doc: DocJSON,
  headingId: string,
): readonly string[] {
  const blocks = canonicalBlocksOf(doc);
  const start = blocks.findIndex((block) => idOf(block) === headingId);
  if (start === -1) return [];
  const end = blocks.findIndex(
    (block, i) => i > start && isSceneHeading(block),
  );
  return Object.freeze(
    blocks.slice(start, end === -1 ? blocks.length : end).flatMap((block) => {
      const id = idOf(block);
      return id === null ? [] : [id];
    }),
  );
}
