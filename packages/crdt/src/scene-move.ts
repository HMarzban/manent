// A scene moved to another place in the script: its blocks deleted and inserted again with the same IDs.
import type { BlockOp, IdSource } from "@manent/schema";
import { applyBlockOpsAsOne } from "./block-ops.ts";
import { ORIGIN_MATERIAL } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { reinsertOps } from "./material/reinsert.ts";
import {
  indexOfBlock,
  isSceneHeading,
  sceneEnd,
  scriptBlocks,
} from "./material/scenes.ts";

/**
 * Moves the scene whose heading is `headingId` after `afterBlockId`, the last block of the scene, act break or Section
 * it lands after (null: the start of the script), in one transaction of origin ORIGIN_MATERIAL. A scene is its heading
 * and every block up to the next scene heading, act break or Section block. Each moved block keeps its ID and gets a
 * `from` naming itself. `not_found`: no heading `headingId`, no block `afterBlockId`, or a block of the scene without an
 * ID; `no_change`: the scene already lies there, or `afterBlockId` is one of its own blocks.
 */
export function moveScene(
  doc: CrdtDoc,
  options: { headingId: string; afterBlockId: string | null; ids: IdSource },
): { ok: true } | { ok: false; reason: "not_found" | "no_change" } {
  const { headingId, afterBlockId } = options;
  const blocks = scriptBlocks(doc);
  const start = indexOfBlock(blocks, headingId);
  if (start === -1 || !isSceneHeading(blocks[start]!))
    return { ok: false, reason: "not_found" };
  const end = sceneEnd(blocks, start);
  const scene = blocks.slice(start, end);
  if (scene.some((block) => typeof block.attrs?.id !== "string"))
    return { ok: false, reason: "not_found" };
  const target =
    afterBlockId === null ? -1 : indexOfBlock(blocks, afterBlockId);
  if (afterBlockId !== null && target === -1)
    return { ok: false, reason: "not_found" };
  // a target inside the scene would be deleted before the scene could land after it
  if (target === start - 1 || (target >= start && target < end))
    return { ok: false, reason: "no_change" };
  const deletes = scene.map((block): BlockOp => ({
    op: "delete",
    id: String(block.attrs?.id),
  }));
  applyBlockOpsAsOne(
    doc,
    [...deletes, ...reinsertOps(scene, afterBlockId, options.ids)],
    ORIGIN_MATERIAL,
  );
  return { ok: true };
}
