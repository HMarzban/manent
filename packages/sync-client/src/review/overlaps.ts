// Blocks both sides changed differently since a common base, and the overlaps a reconnect or a
// move finds, each with this device's wording and the other side's.
import {
  applyInspecting,
  blockAuthors,
  loadDoc,
  readBlocks,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Overlap } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { blockList, overlapLeftover } from "../recovery/recover.ts";
import type { Leftover } from "../recovery/recover.ts";

/** Each id's first block, in document order. */
function byId(doc: DocJSON): Map<string, BlockJSON> {
  const blocks = new Map<string, BlockJSON>();
  for (const { id, block } of blockList(doc))
    if (!blocks.has(id)) blocks.set(id, block);
  return blocks;
}

/** Equal in canonical form, so that two spellings of one block are the same. */
export function isSameBlock(a: BlockJSON, b: BlockJSON): boolean {
  return (
    JSON.stringify(canonicalBlock(a)) === JSON.stringify(canonicalBlock(b))
  );
}

/**
 * The blocks, matched by id, that all three documents hold and that mine and
 * theirs each changed from base, differently; in mine's document order. A
 * block gone from one side is no overlap: its text is set aside instead.
 */
export function findOverlaps(
  base: DocJSON,
  mine: DocJSON,
  theirs: DocJSON,
): Overlap[] {
  const before = byId(base);
  const after = byId(theirs);
  return [...byId(mine)].flatMap(([blockId, block]) => {
    const was = before.get(blockId);
    const other = after.get(blockId);
    if (was === undefined || other === undefined) return [];
    if (isSameBlock(block, was) || isSameBlock(other, was)) return [];
    return isSameBlock(block, other)
      ? []
      : [{ blockId, mine: block, theirs: other }];
  });
}

/**
 * The overlaps of a reconnect: base is the synced base, theirs the base with
 * the server's step 2, mine this device's content before that step. Each is
 * named by the Yjs clients other than `own` that wrote in the block since the
 * base, none when they only deleted. None without a base or without mine.
 */
export function reconnectOverlaps(
  syncedBase: Uint8Array | null,
  stepTwo: Uint8Array,
  mine: DocJSON | null,
  own: readonly number[],
): Leftover[] {
  if (syncedBase === null || mine === null) return [];
  const scratch = loadDoc(syncedBase);
  const baseVector = scratch.encodeStateVector();
  const base = scriptBody(scratch).materialize();
  if (applyInspecting(scratch, stepTwo) === null) return [];
  const theirs = scriptBody(scratch).materialize();
  const ownIds = new Set(own);
  return findOverlaps(base, mine, theirs).map((overlap) => {
    const others = blockAuthors(scratch, overlap.blockId, baseVector).filter(
      (clientId) => !ownIds.has(clientId),
    );
    return overlapLeftover(overlap, others);
  });
}

/**
 * The reconnect's overlaps whose block step 2, now applied to `doc`, changed:
 * a block it left as mine held it brought nothing from elsewhere, as when the
 * other side's change was already seen online.
 */
export function changedByStepTwo(
  doc: CrdtDoc,
  overlaps: readonly Leftover[],
): Leftover[] {
  // a read of the whole script, made only when there is something to check
  if (overlaps.length === 0) return [];
  const ids = overlaps.flatMap(({ blockId }) => blockId ?? []);
  const now = readBlocks(doc, new Set(ids));
  return overlaps.filter(({ blockId, mine }) => {
    const block = blockId === null ? undefined : now.get(blockId);
    return block !== undefined && mine !== null && !isSameBlock(block, mine);
  });
}

/** The overlaps a replay's answer names, with the block as `mine` and as `theirs` hold it. */
export function wordingsOf(
  overlaps: readonly { blockId: string; text: string }[],
  mine: DocJSON,
  theirs: DocJSON,
): Leftover[] {
  const sent = byId(mine);
  const now = byId(theirs);
  return overlaps.map(({ blockId, text }) => ({
    blockId,
    nearBlockId: null,
    text,
    cause: "overlap",
    mine: sent.get(blockId) ?? null,
    theirs: now.get(blockId) ?? null,
    otherClientIds: [],
  }));
}
