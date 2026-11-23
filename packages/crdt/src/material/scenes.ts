// The script's blocks in document order, and where the scene each heading opens ends, as the Scenes tab counts them.
import type { BlockJSON } from "@manent/schema";
import type { CrdtDoc } from "../doc.ts";
import { scriptBody } from "../writer.ts";

const SCENE_HEADINGS: readonly string[] = Object.freeze([
  "scene_heading",
  "slug",
  "chapter",
]);

/** A scene runs up to the next scene heading, act break or Section block. */
const SCENE_ENDS: readonly string[] = Object.freeze([
  ...SCENE_HEADINGS,
  "act_break",
  "group",
]);

/** Every block of the script, canonical, in document order. */
export function scriptBlocks(doc: CrdtDoc): BlockJSON[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
}

export function isSceneHeading(block: BlockJSON): boolean {
  return SCENE_HEADINGS.includes(String(block.attrs?.type));
}

/** The index one past the last block of the scene whose heading is `blocks[start]`. */
export function sceneEnd(blocks: readonly BlockJSON[], start: number): number {
  const next = blocks.findIndex(
    (block, i) => i > start && SCENE_ENDS.includes(String(block.attrs?.type)),
  );
  return next === -1 ? blocks.length : next;
}

/** The index of the first block holding `id`, as the block writer finds it; -1 when none does. */
export function indexOfBlock(blocks: readonly BlockJSON[], id: string): number {
  return blocks.findIndex((block) => block.attrs?.id === id);
}
