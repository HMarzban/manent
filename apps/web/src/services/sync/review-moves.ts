// The hand-over of what the device filed for review: into the person's private index, and only then out of the store.
import type { RecoveredItem } from "@manent/sync-client";
import type { PersonSync } from "./create-sync.ts";
import type { PrivateIndex } from "./private-index.ts";
import { entryOf, readEntry } from "./review-entries.ts";

/** Settled entries are deleted this long after they were filed. */
const SETTLED_KEPT_MS = 30 * 86_400_000;

/** Resolves once the private index's writes are on the device. */
function savedIndex(privateIndex: PrivateIndex): Promise<void> {
  return new Promise((resolve) => {
    const { status } = privateIndex.handle;
    if (status.get().saved) return resolve();
    const stop = status.subscribe((next) => {
      if (!next.saved) return;
      stop();
      resolve();
    });
  });
}

/** Errors of a hand-over are passed over: the store keeps its items, and the next connection or filing moves them. */
export function quietly(work: Promise<void>): void {
  void work.catch(() => {
    // what was not moved stays filed on the device
  });
}

/**
 * Moves, in the leader tab only, each item the device filed for a script into the review map, then has the store
 * forget it once that write is saved; `moved` is told each entry it writes. `moveAll` does so for every script the
 * store holds items of, after deleting the settled entries kept long enough.
 */
export function createReviewMoves(options: {
  privateIndex: PrivateIndex;
  sync: PersonSync;
  names: (
    docId: string,
    clientIds: readonly number[],
  ) => Promise<readonly string[]>;
  now: () => number;
  moved: (docId: string) => void;
}): { move(docId: string): Promise<void>; moveAll(): Promise<void> } {
  const { privateIndex, sync } = options;
  const { review } = privateIndex;
  const writersOf = async (item: RecoveredItem): Promise<string[]> => {
    if (item.otherClientIds.length === 0) return [];
    const ids = await options
      .names(item.docId, item.otherClientIds)
      .catch(() => []);
    // a change made on the person's other device was made elsewhere, by nobody else
    return [...new Set(ids)].filter((id) => id !== sync.userId);
  };
  const move = async (docId: string): Promise<void> => {
    if (!sync.link.get().leader) return;
    for (const item of await sync.store.recovered(docId)) {
      if (review.get(item.id) === null) {
        review.set(item.id, entryOf(item, await writersOf(item)));
        options.moved(docId);
      }
      await savedIndex(privateIndex);
      await sync.store.dismissRecovered(item.id);
    }
  };
  return {
    move,
    async moveAll() {
      if (!sync.link.get().leader) return;
      const at = options.now();
      for (const [id, value] of Object.entries(review.entries())) {
        const entry = readEntry(value);
        if (entry?.settled === true && at - entry.at > SETTLED_KEPT_MS)
          review.delete(id);
      }
      for (const { docId, recovered } of await sync.client.documents())
        if (recovered > 0) await move(docId);
    },
  };
}
