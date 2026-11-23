// Cuts: whole blocks taken out of the script with where they came from, kept in the script's cuts map by cut id.
import { isBlockId, rejects, validateBlocks } from "@manent/schema";
import type { BlockJSON, BlockOp, IdSource } from "@manent/schema";
import { applyBlockOpsAsOne } from "../block-ops.ts";
import { ORIGIN_MATERIAL, yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { jsonMap } from "../json-map.ts";
import { CUTS_MAP } from "../script-maps.ts";
import { isObject } from "./entry-shape.ts";
import { reinsertOps } from "./reinsert.ts";
import {
  indexOfBlock,
  isSceneHeading,
  sceneEnd,
  scriptBlocks,
} from "./scenes.ts";

/**
 * Blocks moved to cuts, canonical, with their IDs. `origin.afterBlockId` is the block they followed, null at the start
 * of the script; `origin.sceneHeadingId` is the heading of the scene that block is in, null before the first heading.
 * `createdAt` is milliseconds since the epoch; cuts are listed newest first by it.
 */
export interface Cut {
  v: 1;
  blocks: BlockJSON[];
  origin: { afterBlockId: string | null; sceneHeadingId: string | null };
  authorUserId: string;
  createdAt: number;
}

// a cut's blocks are checked alone: they are out of the script while they are cut
const ALONE = Object.freeze({ isIdTaken: () => false });

const isIdOrNull = (value: unknown): value is string | null =>
  value === null || isBlockId(value);

/** An entry of this version whose blocks the script can hold again, each with an ID; keys a newer build adds are allowed. */
export function isCut(value: unknown): value is Cut {
  return (
    isObject(value) &&
    value.v === 1 &&
    Array.isArray(value.blocks) &&
    value.blocks.length > 0 &&
    value.blocks.every(
      (block) =>
        isObject(block) && isObject(block.attrs) && isBlockId(block.attrs.id),
    ) &&
    !rejects(validateBlocks(value.blocks, ALONE)) &&
    isObject(value.origin) &&
    isIdOrNull(value.origin.afterBlockId) &&
    isIdOrNull(value.origin.sceneHeadingId) &&
    typeof value.authorUserId === "string" &&
    Number.isSafeInteger(value.createdAt)
  );
}

const idOf = (block: BlockJSON | undefined): string | null =>
  typeof block?.attrs?.id === "string" ? block.attrs.id : null;

/** The last ID among `blocks[0 .. end)` of a block `isWanted` accepts; null when none. */
function lastIdBefore(
  blocks: readonly BlockJSON[],
  end: number,
  isWanted: (block: BlockJSON) => boolean,
): string | null {
  const found = blocks
    .slice(0, end)
    .findLast((block) => isWanted(block) && idOf(block) !== null);
  return idOf(found);
}

/**
 * Moves the blocks `blockIds` to a new cut by `authorUserId`, in document order, in one transaction of origin
 * ORIGIN_MATERIAL; the cut's id comes from `ids`. Its origin is the block before the first of them and that block's
 * scene. `not_found`, writing nothing, when one of the IDs is not in the script, or none is given.
 */
export function moveToCuts(
  doc: CrdtDoc,
  options: {
    blockIds: readonly string[];
    authorUserId: string;
    now: () => number;
    ids: IdSource;
  },
): { ok: true; cutId: string } | { ok: false; reason: "not_found" } {
  const blocks = scriptBlocks(doc);
  const at = [...new Set(options.blockIds)]
    .map((id) => indexOfBlock(blocks, id))
    .toSorted((a, b) => a - b);
  if (at.length === 0 || at[0] === -1)
    return { ok: false, reason: "not_found" };
  const cut = at.map((i) => blocks[i]!);
  const first = at[0]!;
  const cutId = options.ids();
  const entry: Cut = {
    v: 1,
    blocks: cut,
    origin: {
      afterBlockId: lastIdBefore(blocks, first, () => true),
      sceneHeadingId: lastIdBefore(blocks, first, isSceneHeading),
    },
    authorUserId: options.authorUserId,
    createdAt: options.now(),
  };
  yDocOf(doc).transact(() => {
    applyBlockOpsAsOne(
      doc,
      cut.map((block): BlockOp => ({
        op: "delete",
        id: String(block.attrs?.id),
      })),
      ORIGIN_MATERIAL,
    );
    jsonMap(doc, CUTS_MAP).set(cutId, entry);
  }, ORIGIN_MATERIAL);
  return { ok: true, cutId };
}

/** Where a restore put a cut's blocks: after its origin block, after its origin scene's last block, or at the end. */
type Placed = "origin" | "scene" | "end";

/** The block a restore inserts after (null: the start of the script), by the first of the three places that exists. */
function restorePlace(
  blocks: readonly BlockJSON[],
  origin: Cut["origin"],
): { after: string | null; placed: Placed } {
  const { afterBlockId, sceneHeadingId } = origin;
  if (afterBlockId === null || indexOfBlock(blocks, afterBlockId) !== -1)
    return { after: afterBlockId, placed: "origin" };
  const heading =
    sceneHeadingId === null ? -1 : indexOfBlock(blocks, sceneHeadingId);
  if (heading !== -1 && isSceneHeading(blocks[heading]!)) {
    const after = lastIdBefore(blocks, sceneEnd(blocks, heading), () => true);
    return { after, placed: "scene" };
  }
  return {
    after: lastIdBefore(blocks, blocks.length, () => true),
    placed: "end",
  };
}

/**
 * Puts the cut `cutId` back and deletes its entry, in one transaction of origin ORIGIN_MATERIAL. Its blocks keep their
 * IDs, each with a `from` naming itself, and go after `origin.afterBlockId` when it exists (at the start when it is
 * null); otherwise after the last block of `origin.sceneHeadingId`'s scene; otherwise at the end of the script.
 * `not_found` when there is no such cut.
 */
export function restoreCut(
  doc: CrdtDoc,
  options: { cutId: string; ids: IdSource },
): { ok: true; placed: Placed } | { ok: false; reason: "not_found" } {
  const cuts = jsonMap(doc, CUTS_MAP);
  const cut = cuts.get(options.cutId);
  if (!isCut(cut)) return { ok: false, reason: "not_found" };
  const { after, placed } = restorePlace(scriptBlocks(doc), cut.origin);
  yDocOf(doc).transact(() => {
    applyBlockOpsAsOne(
      doc,
      reinsertOps(cut.blocks, after, options.ids),
      ORIGIN_MATERIAL,
    );
    cuts.delete(options.cutId);
  }, ORIGIN_MATERIAL);
  return { ok: true, placed };
}
