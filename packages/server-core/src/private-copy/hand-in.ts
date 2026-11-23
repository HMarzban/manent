// A hand-in's write into the room: the three-way block merge of the private copy, applied as its writer's edits,
// with the "Before hand-in" version, the copy closed and the stored answer, in one commit.
import {
  ORIGIN_SYSTEM,
  applyBlockOps,
  jsonMap,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { compareDocs, mergeByBlock } from "@manent/revisions";
import type { BlockMerge } from "@manent/revisions";
import { validateBlocks } from "@manent/schema";
import type { BlockOp, DocJSON } from "@manent/schema";
import type { DocFile, PrivateCopyRow } from "@manent/storage";
import type {
  HandInResponse,
  VersionContent,
  VersionPosition,
} from "@manent/sync-protocol";
import { lastChanges } from "../history/attribution.ts";
import type { BlockLastChange } from "../history/attribution.ts";
import { contentOfDoc } from "../history/content.ts";
import type { HistoryService } from "../history/service.ts";
import type { SyncService } from "../sync/ports.ts";
import { isStorageError } from "../sync/storage-error.ts";
import { MATERIAL_MAPS } from "./script-content.ts";
import type { ScriptContent } from "./script-content.ts";

/** What one hand-in writes: `mine` is the private copy as its turn read it, `base` the room as the copy was made from it. */
export interface HandIn {
  file: DocFile;
  userId: string;
  key: string;
  copy: PrivateCopyRow;
  base: DocJSON;
  mine: ScriptContent;
  versionId: string;
  /** Milliseconds since the epoch. */
  at: number;
  keep: HistoryService["keep"];
}

/** Every block the ops write passes validation without a reject or newer issue. */
function isWritable(ops: readonly BlockOp[]): boolean {
  const blocks = ops.flatMap((op) => (op.op === "delete" ? [] : [op.block]));
  return validateBlocks(blocks, { isIdTaken: () => false }).every(
    (issue) => issue.severity !== "reject" && issue.severity !== "newer",
  );
}

/** By block, the people other than the writer who last changed it in the room since the copy was made. */
function othersOf(hand: HandIn, merge: BlockMerge): Map<string, string[]> {
  const ids = new Set(merge.overlaps.map((overlap) => overlap.blockId));
  if (ids.size === 0) return new Map();
  const { file, copy, userId } = hand;
  const since = { generation: copy.baseGeneration, seq: copy.baseSeq };
  let changes: Map<string, BlockLastChange>;
  try {
    changes = lastChanges(file, copy.sourceDocId, ids, since);
  } catch (error) {
    if (!isStorageError(error) || error.code !== "corrupt") throw error;
    // attribution only names who else wrote a passage: the overlap is listed all the same, naming nobody
    return new Map();
  }
  const others = [...changes].filter(([, change]) => change.userId !== userId);
  return new Map(others.map(([id, change]) => [id, [change.userId]]));
}

/** The answer the hand-in gives and keeps. */
function answerOf(hand: HandIn, merge: BlockMerge): HandInResponse {
  const others = othersOf(hand, merge);
  return {
    versionId: hand.versionId,
    scenes: compareDocs(hand.base, hand.mine.body).scenes.length,
    overlaps: merge.overlaps.map(({ blockId, mine, theirs }) => ({
      blockId,
      mine,
      theirs,
      otherUserIds: others.get(blockId) ?? [],
    })),
    setAside: merge.setAside.map(({ blockId, nearBlockId, text }) => ({
      blockId,
      nearBlockId,
      text,
    })),
  };
}

/** The private copy's material entries under keys the room does not hold; a key both hold keeps the room's. */
function addMaterial(doc: CrdtDoc, material: ScriptContent["material"]): void {
  for (const name of MATERIAL_MAPS) {
    const map = jsonMap(doc, name);
    const held = new Set(map.keys());
    for (const [key, value] of Object.entries(material[name] ?? {}))
      if (!held.has(key)) map.set(key, value);
  }
}

/** In the hand-in's commit: "Before hand-in" at `head`, just before the merge, holding `before`; the copy closed; the answer stored under the key. */
function recordHandIn(
  file: DocFile,
  head: VersionPosition,
  hand: HandIn,
  { before, answer }: { before: VersionContent; answer: HandInResponse },
): void {
  const { copy, userId, key, versionId, at } = hand;
  const { privateDocId, sourceDocId } = copy;
  hand.keep(
    file,
    {
      id: versionId,
      docId: sourceDocId,
      ...head,
      kind: "pre_hand_in",
      name: null,
      createdByUserId: userId,
      createdAt: at,
      deviceId: null,
    },
    before,
  );
  file.privateCopies.markHandedIn(privateDocId, at);
  file.privateCopies.addHandIn({
    key,
    privateDocId,
    userId,
    beforeVersionId: versionId,
    answer: JSON.stringify(answer),
    at,
  });
}

/**
 * The hand-in as one authority write into the room: `mergeByBlock(base, mine, the room now)` applied as the writer's
 * edits with the copy's new material, and in its commit the "Before hand-in" version at the head just before it, the
 * copy closed at `at` and the answer stored under the key. `invalid`: the merge writes a block this build cannot hold.
 */
export async function writeHandIn(
  sync: SyncService,
  hand: HandIn,
): Promise<
  { ok: true; answer: HandInResponse } | { ok: false; code: "busy" | "invalid" }
> {
  const { userId } = hand;
  const docId = hand.copy.sourceDocId;
  const state: {
    before: VersionContent | null;
    answer: HandInResponse | null;
    stored: boolean;
  } = { before: null, answer: null, stored: false };
  const written = await sync.authorityWrite(docId, {
    userId,
    origin: "system",
    edit(doc) {
      const row = hand.file.log.get(docId);
      if (row === null) throw new RangeError(`no document ${docId} here`);
      const theirs = scriptBody(doc).materialize();
      const merge = mergeByBlock(hand.base, hand.mine.body, theirs);
      if (!isWritable(merge.ops)) return { ok: false, reason: "invalid" };
      state.before = contentOfDoc(doc, row, {});
      state.answer = answerOf(hand, merge);
      applyBlockOps(doc, merge.ops, ORIGIN_SYSTEM);
      addMaterial(doc, hand.mine.material);
      return { ok: true };
    },
    inTransaction(file, turn) {
      const { before, answer } = state;
      if (before === null || answer === null) return;
      recordHandIn(
        file,
        { generation: turn.generation, seq: turn.before },
        hand,
        { before, answer },
      );
      state.stored = true;
    },
  });
  if (!written.ok && written.code === "refused")
    return { ok: false, code: "invalid" };
  return written.ok && state.stored && state.answer !== null
    ? { ok: true, answer: state.answer }
    : { ok: false, code: "busy" };
}
