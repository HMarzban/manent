// To review's choices: each writes the script as one step of its undo, settles its entries and says what it did; the
// script's undo and redo open or settle them again.
import {
  ORIGIN_REVIEW,
  applyBlockOps,
  isUndoStep,
  observeScript,
  readBlocks,
  sceneOf,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc, JsonMapView } from "@manent/crdt";
import { canonicalBlock, randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { REVIEW_WORDS, joinNames, messageFor } from "@manent/ui";
import type { MessageQueue, TrustEvent } from "@manent/ui";
import { nameOf } from "./index-entries.ts";
import { openOverlaps, readAll, readEntry } from "./review-entries.ts";
import type { Listed } from "./review-entries.ts";

/** What one action of this tab wrote, so the script's undo and redo open or settle its entries again. */
export interface Acted {
  ids: readonly string[];
  /** Null: the action found no block, or inserted one. */
  before: BlockJSON | null;
  /** Canonical, as the script reads it back. */
  wrote: BlockJSON;
}

/** A script open in this tab, and what this tab's actions wrote there, by block id. */
export interface Acting {
  doc: CrdtDoc;
  acted: Map<string, Acted>;
}

export interface ReviewActions {
  keepAsMerged(id: string): void;
  useMine(id: string, doc: CrdtDoc): void;
  useTheirs(id: string, doc: CrdtDoc): void;
  /** Opens again this tab's last Keep as merged while its message is shown, if no review action came after it; false when there is none. */
  reopenKept(): boolean;
  /** Follows the script's undo and redo over the blocks this tab acted on; the returned function stops. */
  followUndo(open: Acting): () => void;
}

const sameBlock = (a: BlockJSON | null, b: BlockJSON | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The ids of the document's blocks, in order. */
export function blockOrder(doc: CrdtDoc): string[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap((section) =>
    (section.content ?? []).flatMap((block) =>
      typeof block.attrs?.id === "string" ? [block.attrs.id] : [],
    ),
  );
}

/** The scene the block is in, in To review's words; null outside a scene, or while the script is not open. */
export function sceneWords(
  doc: CrdtDoc | null,
  blockId: string | null,
): string | null {
  const n = doc === null || blockId === null ? null : sceneOf(doc, blockId);
  return n === null ? null : REVIEW_WORDS.scene(n);
}

/** The document's block `blockId`, as it reads it; null when it is gone. */
const blockIn = (doc: CrdtDoc, blockId: string): BlockJSON | null =>
  readBlocks(doc, new Set([blockId])).get(blockId) ?? null;

/** `blockId` when the document still holds it; else null, the start. */
const heldOrStart = (doc: CrdtDoc, blockId: string | null): string | null =>
  blockId !== null && blockIn(doc, blockId) !== null ? blockId : null;

/** Where Recovered text goes back: after the block it was near, else after the block before its own, else the start. */
function recoveredAnchor(
  doc: CrdtDoc,
  entry: Listed & { kind: "recovered" },
): string | null {
  const near = heldOrStart(doc, entry.nearBlockId);
  if (near !== null || entry.blockId === null) return near;
  const order = blockOrder(doc);
  return order[order.indexOf(entry.blockId) - 1] ?? null;
}

/** Sets each entry `settled`, keeping `before` while it is settled. */
function settleEntries(
  review: JsonMapView,
  ids: readonly string[],
  settled: boolean,
  before: BlockJSON | null,
): void {
  for (const id of ids) {
    const entry = readEntry(review.get(id));
    if (entry === null || entry.settled === settled) continue;
    review.set(id, { ...entry, settled, before: settled ? before : null });
  }
}

/** Opens again each acted entry whose block an undo or redo left as the action found it, and settles it again when as the action left it. */
function followUndoOf(review: JsonMapView, open: Acting): () => void {
  return observeScript(open.doc, (report) => {
    if (!isUndoStep(report.origin)) return;
    const touched = new Set([
      ...report.changed.map((b) => String(b.attrs?.id)),
      ...report.inserted.map(({ block }) => String(block.attrs?.id)),
      ...report.removed,
    ]);
    for (const [blockId, done] of open.acted) {
      if (!touched.has(blockId)) continue;
      const block = blockIn(open.doc, blockId);
      if (sameBlock(block, done.before))
        settleEntries(review, done.ids, false, null);
      else if (sameBlock(block, done.wrote))
        settleEntries(review, done.ids, true, done.before);
    }
  });
}

/** What a choice wrote, and the message that says so. */
interface Chosen {
  blockId: string;
  done: Acted;
  said: TrustEvent;
}

/** Puts Recovered text back as an action block of its own. */
function putBack(
  review: JsonMapView,
  entry: Listed & { kind: "recovered" },
  doc: CrdtDoc,
): Chosen {
  const blockId = randomBlockId();
  const block = canonicalBlock({
    type: "block",
    attrs: { id: blockId, type: "action" },
    content: entry.text === "" ? [] : [{ type: "text", text: entry.text }],
  });
  const after = recoveredAnchor(doc, entry);
  applyBlockOps(doc, [{ op: "insert", after, block }], ORIGIN_REVIEW);
  settleEntries(review, [entry.id], true, null);
  const scene = sceneWords(doc, blockId);
  return {
    blockId,
    done: { ids: [entry.id], before: null, wrote: block },
    said: { kind: "review_settled", choice: "recovered", names: null, scene },
  };
}

/** Writes one side's wording of an overlap, or puts it back after its anchor when the block is gone. */
function useWording(
  review: JsonMapView,
  entry: Listed & { kind: "overlap" },
  doc: CrdtDoc,
  side: "mine" | "theirs",
): Chosen {
  const { blockId } = entry;
  const wrote = canonicalBlock(entry[side]);
  const ids = openOverlaps(readAll(review), entry.docId, blockId).map(
    (e) => e.id,
  );
  const before = blockIn(doc, blockId);
  const after = heldOrStart(doc, entry.nearBlockId);
  const op =
    before === null
      ? ({ op: "insert", after, block: wrote } as const)
      : ({ op: "replace", block: wrote } as const);
  applyBlockOps(doc, [op], ORIGIN_REVIEW);
  settleEntries(review, ids, true, before);
  const people = entry.otherUserIds.length;
  const named = side === "theirs" && people > 0 && people < 3;
  const choice = side === "mine" ? "mine" : named ? "theirs" : "other";
  const names = named ? joinNames(entry.otherUserIds.map(nameOf)) : null;
  const scene = sceneWords(doc, blockId);
  return {
    blockId,
    done: { ids, before, wrote },
    said: { kind: "review_settled", choice, names, scene },
  };
}

/**
 * The choices over the review map; each one's message is pushed only after the script is written and the entry
 * settled. What a choice wrote is kept on the script `followed` holds, so its undo and redo follow.
 */
export function createReviewActions(options: {
  review: JsonMapView;
  messages: MessageQueue;
  followed: ReadonlyMap<string, Acting>;
}): ReviewActions {
  const { review, messages, followed } = options;
  let lastKept: readonly string[] | null = null;
  const find = (id: string): Listed | null =>
    readAll(review).find((e) => e.id === id) ?? null;
  const choose = (id: string, doc: CrdtDoc, side: "mine" | "theirs") => {
    const entry = find(id);
    if (entry === null) return;
    lastKept = null;
    const chosen =
      entry.kind === "recovered"
        ? putBack(review, entry, doc)
        : useWording(review, entry, doc, side);
    followed.get(entry.docId)?.acted.set(chosen.blockId, chosen.done);
    messages.push(messageFor(chosen.said));
  };
  return {
    keepAsMerged(id) {
      const entry = find(id);
      if (entry === null) return;
      const doc = followed.get(entry.docId)?.doc ?? null;
      const { blockId } = entry;
      const ids =
        entry.kind === "overlap"
          ? openOverlaps(readAll(review), entry.docId, entry.blockId).map(
              (e) => e.id,
            )
          : [id];
      const before =
        doc === null || blockId === null ? null : blockIn(doc, blockId);
      settleEntries(review, ids, true, before);
      lastKept = ids;
      const scene = sceneWords(doc, blockId);
      messages.push(
        messageFor({
          kind: "review_settled",
          choice: "merged",
          names: null,
          scene,
        }),
      );
    },
    useMine: (id, doc) => choose(id, doc, "mine"),
    useTheirs: (id, doc) => choose(id, doc, "theirs"),
    reopenKept() {
      const shown = messages
        .current()
        ?.actions.some((action) => action.commandId === "review.undo");
      if (lastKept === null || shown !== true) return false;
      settleEntries(review, lastKept, false, null);
      lastKept = null;
      return true;
    },
    followUndo: (open) => followUndoOf(review, open),
  };
}
