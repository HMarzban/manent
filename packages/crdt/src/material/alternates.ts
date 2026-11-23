// A speech's alternates: other ways to say a dialogue block's line, kept in the script's alternates map by alternate id.
import { isBlockId } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import { applyBlockOpsAsOne } from "../block-ops.ts";
import { readBlocks } from "../block-reads.ts";
import { ORIGIN_MATERIAL, yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { jsonMap } from "../json-map.ts";
import { ALTERNATES_MAP } from "../script-maps.ts";
import { isObject } from "./entry-shape.ts";

/**
 * One alternate of the dialogue block `blockId`. `text` is plain: marks on a line are not kept when it becomes an
 * alternate. `createdAt` is milliseconds since the epoch; a speech's alternates are ordered by it, then by id.
 */
export interface Alternate {
  v: 1;
  blockId: string;
  text: string;
  authorUserId: string;
  createdAt: number;
  pitched: boolean;
}

/** An entry of this version; keys a newer build adds are allowed. */
export function isAlternate(value: unknown): value is Alternate {
  return (
    isObject(value) &&
    value.v === 1 &&
    isBlockId(value.blockId) &&
    typeof value.text === "string" &&
    typeof value.authorUserId === "string" &&
    Number.isSafeInteger(value.createdAt) &&
    typeof value.pitched === "boolean"
  );
}

const textOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

/** The dialogue block `blockId`, canonical; null when the script holds none. */
function speechBlock(doc: CrdtDoc, blockId: string): BlockJSON | null {
  const block = readBlocks(doc, new Set([blockId])).get(blockId);
  return block?.attrs?.type === "dialogue" ? block : null;
}

/**
 * Adds `text` as an alternate of the dialogue block `blockId`, by `authorUserId`, in one transaction of origin
 * ORIGIN_MATERIAL; the alternate's id comes from `ids`. `not_found` when the script holds no such dialogue block.
 */
export function addAlternate(
  doc: CrdtDoc,
  options: {
    blockId: string;
    text: string;
    authorUserId: string;
    pitched: boolean;
    now: () => number;
    ids: IdSource;
  },
): { ok: true; alternateId: string } | { ok: false; reason: "not_found" } {
  const { blockId, text, authorUserId, pitched } = options;
  if (speechBlock(doc, blockId) === null)
    return { ok: false, reason: "not_found" };
  const alternateId = options.ids();
  const alternate: Alternate = {
    v: 1,
    blockId,
    text,
    authorUserId,
    createdAt: options.now(),
    pitched,
  };
  yDocOf(doc).transact(
    () => jsonMap(doc, ALTERNATES_MAP).set(alternateId, alternate),
    ORIGIN_MATERIAL,
  );
  return { ok: true, alternateId };
}

/**
 * Makes a text the line of the dialogue block `blockId`, plain, in one transaction of origin ORIGIN_MATERIAL: the
 * alternate `alternateId`, whose entry goes, or `text` typed for it. The line it replaces, unless empty, becomes a new
 * alternate by `authorUserId`. `not_found` when the script holds no such dialogue block, or the block has no alternate
 * `alternateId`.
 */
export function swapAlternate(
  doc: CrdtDoc,
  options: {
    blockId: string;
    swapIn:
      | { type: "alternate"; alternateId: string }
      | { type: "text"; text: string };
    authorUserId: string;
    now: () => number;
    ids: IdSource;
  },
): { ok: true } | { ok: false; reason: "not_found" } {
  const { blockId, swapIn } = options;
  const block = speechBlock(doc, blockId);
  if (block === null) return { ok: false, reason: "not_found" };
  const alternates = jsonMap(doc, ALTERNATES_MAP);
  let text: string;
  if (swapIn.type === "alternate") {
    const chosen = alternates.get(swapIn.alternateId);
    if (!isAlternate(chosen) || chosen.blockId !== blockId)
      return { ok: false, reason: "not_found" };
    text = chosen.text;
  } else text = swapIn.text;
  const line = textOf(block);
  yDocOf(doc).transact(() => {
    applyBlockOpsAsOne(
      doc,
      [
        {
          op: "replace",
          block: { ...block, content: [{ type: "text", text }] },
        },
      ],
      ORIGIN_MATERIAL,
    );
    if (swapIn.type === "alternate") alternates.delete(swapIn.alternateId);
    if (line === "") return;
    const replaced: Alternate = {
      v: 1,
      blockId,
      text: line,
      authorUserId: options.authorUserId,
      createdAt: options.now(),
      pitched: false,
    };
    alternates.set(options.ids(), replaced);
  }, ORIGIN_MATERIAL);
  return { ok: true };
}
