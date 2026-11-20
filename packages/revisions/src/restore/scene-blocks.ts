// The blocks a scene holds: its heading and everything up to the next heading.
import type { DocJSON } from "@manent/schema";
import { SCENE_HEADINGS, canonicalBlocksOf } from "../compare/align.ts";

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
  const start = blocks.findIndex((block) => block.attrs?.id === headingId);
  if (start === -1) return [];
  const end = blocks.findIndex(
    (block, i) =>
      i > start && SCENE_HEADINGS.some((type) => type === block.attrs?.type),
  );
  return Object.freeze(
    blocks
      .slice(start, end === -1 ? blocks.length : end)
      .flatMap((block) =>
        typeof block.attrs?.id === "string" ? [block.attrs.id] : [],
      ),
  );
}
