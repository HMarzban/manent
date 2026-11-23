// What the authority writes into a writer's private index: the entry of their private copy, and what their hand-in
// lists for them under To review.
import { jsonMap } from "@manent/crdt";
import { rejects, validateBlocks } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import type {
  HandInOverlap,
  HandInResponse,
  PrivateCopyEntry,
  ReplaySetAside,
} from "@manent/sync-protocol";
import type { SyncService } from "../sync/ports.ts";

type Block = HandInOverlap["mine"];

/** A To review entry as the private index stores it, with its fields in this order, as every device reads it. */
export type ReviewEntry =
  | {
      kind: "overlap";
      docId: string;
      blockId: string;
      mine: Block;
      theirs: Block;
      otherUserIds: string[];
      at: number;
      settled: false;
      before: null;
      nearBlockId: null;
      copyId: null;
    }
  | {
      kind: "recovered";
      docId: string;
      blockId: string | null;
      nearBlockId: string | null;
      text: string;
      at: number;
      settled: false;
      before: null;
    };

// each wording is checked alone: mine and theirs share their block's id
const ALONE = Object.freeze({ isIdTaken: () => false });

const isHoldable = (block: Block): boolean =>
  !rejects(validateBlocks([block], ALONE));

function recoveredEntry(
  docId: string,
  { blockId, nearBlockId, text }: ReplaySetAside,
  at: number,
): ReviewEntry {
  return {
    kind: "recovered",
    docId,
    blockId,
    nearBlockId,
    text,
    at,
    settled: false,
    before: null,
  };
}

/** The overlap's entry; Recovered text when the script could not hold either wording as its block. */
function overlapEntry(
  docId: string,
  overlap: HandInOverlap,
  at: number,
): ReviewEntry {
  const { blockId, mine, theirs, otherUserIds } = overlap;
  if (!isHoldable(mine) || !isHoldable(theirs)) {
    const text = (mine.content ?? []).map((run) => run.text).join("");
    return recoveredEntry(docId, { blockId, nearBlockId: null, text }, at);
  }
  return {
    kind: "overlap",
    docId,
    blockId,
    mine,
    theirs,
    otherUserIds,
    at,
    settled: false,
    before: null,
    nearBlockId: null,
    copyId: null,
  };
}

/** What a hand-in of the copy at `at` lists under To review, by id in the review map: its overlaps, then its set-aside text. */
export function reviewEntriesOf(
  hand: { docId: string; privateDocId: string; at: number },
  answer: HandInResponse,
): [string, ReviewEntry][] {
  const { docId, privateDocId, at } = hand;
  const entries = [
    ...answer.overlaps.map((overlap) => overlapEntry(docId, overlap, at)),
    ...answer.setAside.map((item) => recoveredEntry(docId, item, at)),
  ];
  return entries.map((entry, i) => [`handin:${privateDocId}:${i}`, entry]);
}

/**
 * Writes the private index of `userId` as the authority, placing it on this server first: the `private_copies` entry
 * of `docId` where it differs, and each review entry whose id the map does not hold yet, so that a settled one stays
 * settled. False when the index could not be placed or the write did not commit.
 */
export async function writePrivateIndex(
  sync: SyncService,
  userId: string,
  writes: {
    docId: string;
    entry: PrivateCopyEntry;
    review: readonly [string, ReviewEntry][];
  },
): Promise<boolean> {
  const docId = indexDocId("user", userId);
  const index = { docId, kind: "index", home: "user" };
  if (!sync.access.create(userId, index).ok) return false;
  const written = await sync.authorityWrite(docId, {
    userId,
    origin: "system",
    edit(doc) {
      const copies = jsonMap(doc, "private_copies");
      const stored = JSON.stringify(copies.get(writes.docId));
      if (stored !== JSON.stringify(writes.entry))
        copies.set(writes.docId, writes.entry);
      const review = jsonMap(doc, "review");
      const held = new Set(review.keys());
      for (const [id, entry] of writes.review)
        if (!held.has(id)) review.set(id, entry);
      return { ok: true };
    },
    inTransaction() {
      // an index keeps no rows beside its update
    },
  });
  return written.ok;
}
