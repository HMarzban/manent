// To review: what the device filed, moved into the person's private index, listed per script, with its choices and undo.
import { observeScript } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { createValue, statusText } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import { cached } from "./cached.ts";
import type { PersonSync } from "./create-sync.ts";
import type { ReviewPort } from "./document-source.ts";
import type { PrivateIndex } from "./private-index.ts";
import {
  anchorOf,
  blockOrder,
  createReviewActions,
  seenNow,
  trackOrder,
} from "./review-actions.ts";
import type { Acting, SeenOrder } from "./review-actions.ts";
import { listOpen, readAll } from "./review-entries.ts";
import type { Listed, ReviewEntry } from "./review-entries.ts";
import { createReviewMoves, quietly } from "./review-moves.ts";
import { toStatusFacts } from "./status-facts.ts";

export type { ReviewEntry } from "./review-entries.ts";

export interface ReviewStore extends ReviewPort {
  /** In document order; at most one open overlap per block. */
  entries(
    docId: string,
  ): Subscribable<readonly (ReviewEntry & { id: string })[]>;
  keepAsMerged(id: string): void;
  useMine(id: string, doc: CrdtDoc): void;
  useTheirs(id: string, doc: CrdtDoc): void;
  /** Opens again this tab's last Keep as merged while its message is shown, if no review action came after it; false when there is none. */
  reopenKept(): boolean;
  focus(docId: string, blockId: string): void;
  /** The block whose entry To review opens at; null: the first. */
  focusTarget(docId: string): Subscribable<string | null>;
  dispose(): void;
}

type Value<T> = Subscribable<T> & { set(value: T): void };

/** One open script, as this tab follows it for To review. */
interface Followed extends Acting {
  handle: DocHandle | null;
  /** Items moved that no receipt has counted yet; below 0 while a receipt counted items still being moved. */
  unannounced: number;
}

/**
 * Writes, for each open overlap of the script, the nearest block before its own that the script still holds, in what
 * this tab saw, as the overlap's anchor when it has changed; true when it wrote one.
 */
function keepAnchors(
  privateIndex: PrivateIndex,
  every: readonly Listed[],
  docId: string,
  seen: SeenOrder,
): boolean {
  let wrote = false;
  for (const listed of every) {
    const { id, ...entry } = listed;
    if (entry.kind !== "overlap" || entry.settled || entry.docId !== docId)
      continue;
    const nearBlockId = anchorOf(seen, listed);
    if (nearBlockId === entry.nearBlockId) continue;
    wrote = true;
    privateIndex.review.set(id, { ...entry, nearBlockId });
  }
  return wrote;
}

interface Lists {
  listOf(docId: string): Value<readonly Listed[]>;
  countOf(docId: string): Value<number>;
  show(): void;
  /** Follows the order of an open script's blocks while To review lists something there; the returned function stops. */
  followOrder(docId: string, open: Acting): () => void;
  dispose(): void;
}

/** The open entries of each script asked for, and their number, read again as the review map changes. */
function createLists(options: {
  privateIndex: PrivateIndex;
  sync: PersonSync;
  followed: ReadonlyMap<string, Followed>;
}): Lists {
  const { privateIndex, sync, followed } = options;
  const lists = new Map<string, Value<readonly Listed[]>>();
  const counts = new Map<string, Value<number>>();
  const countOf = (docId: string) =>
    cached(counts, docId, () => createValue(0));
  // only the leader keeps anchors, and a write shows the entries again
  const keptAnchors = (
    docId: string,
    open: Acting,
    every: readonly Listed[],
  ): boolean =>
    sync.link.get().leader &&
    open.seen !== null &&
    keepAnchors(privateIndex, every, docId, open.seen);
  const show = (): void => {
    const every = readAll(privateIndex.review);
    const listed = new Map<string, Listed[]>();
    for (const [docId, open] of followed) {
      const order = blockOrder(open.doc);
      const entries = listOpen(every, docId, order);
      open.seen =
        entries.length === 0 ? null : (open.seen ?? seenNow(open.doc));
      listed.set(docId, entries);
      if (keptAnchors(docId, open, every)) return;
    }
    for (const [docId, list] of lists) {
      const open = listed.get(docId) ?? listOpen(every, docId, []);
      list.set(open);
      countOf(docId).set(open.length);
    }
  };
  const dispose = privateIndex.review.subscribe(show);
  return {
    listOf(docId) {
      const known = lists.has(docId);
      const list = cached(lists, docId, () =>
        createValue<readonly Listed[]>([]),
      );
      if (!known) show();
      return list;
    },
    countOf,
    show,
    followOrder: (docId, open) =>
      observeScript(open.doc, (report) => {
        if (open.seen === null) return;
        if (report.inserted.length + report.removed.length === 0) return;
        trackOrder(open.seen, report);
        keptAnchors(docId, open, readAll(privateIndex.review));
      }),
    dispose,
  };
}

/** Says a followed script's status as the status bar words it, once it is synced, when it holds entries no message counts. */
function createAnnouncing(options: {
  sync: PersonSync;
  followed: ReadonlyMap<string, Followed>;
  countOf: (docId: string) => Subscribable<number>;
  announce: (text: string) => void;
  now: () => number;
}): (docId: string) => void {
  const { sync, followed } = options;
  const announce = (docId: string): void => {
    const open = followed.get(docId);
    if (open?.handle == null || open.unannounced <= 0) return;
    open.unannounced = 0;
    const words = statusText(
      toStatusFacts({
        status: open.handle.status.get(),
        link: sync.link.get(),
        network: sync.network.get(),
        viewRole: null,
        viewLive: false,
        offlineSinceAt: sync.offlineSince.get(),
        toReview: options.countOf(docId).get(),
        now: options.now(),
      }),
    );
    options.announce(
      [words.device, words.server].filter((w) => w !== null).join(" · "),
    );
  };
  return (docId) => {
    const synced = followed.get(docId)?.handle?.status.get().synced === true;
    // after the receipt that may follow in the same task
    if (synced) queueMicrotask(() => announce(docId));
  };
}

/** Moves what an open script's handle files, and counts what its receipts already say; the returned function closes it. */
function watchHandle(
  open: Followed,
  handle: DocHandle,
  parts: { move(): void; announce(): void },
): () => void {
  open.handle = handle;
  const stops = [
    handle.recovered.subscribe(parts.move),
    handle.on((event) => {
      if (event.type === "receipt" || event.type === "rebuilt")
        open.unannounced -= event.overlaps + event.setAside;
      if (event.type === "rejected") open.unannounced -= event.setAside;
    }),
    handle.status.subscribe(parts.announce),
  ];
  parts.move();
  return () => {
    for (const stop of stops) stop();
    void handle.close();
  };
}

/** Follows an open script's undo, then its handle once it has opened; the returned function stops both. */
function followScript(
  sync: PersonSync,
  docId: string,
  open: Followed,
  parts: { undo(): () => void; move(): void; announce(): void },
): () => void {
  const stopUndo = parts.undo();
  let stopHandle: (() => void) | null = null;
  let stopped = false;
  void sync.client.open(docId).then(
    (handle) => {
      if (stopped) void handle.close();
      else stopHandle = watchHandle(open, handle, parts);
    },
    () => {
      // a script the device cannot open files nothing here
    },
  );
  return () => {
    stopped = true;
    stopUndo();
    stopHandle?.();
  };
}

/** The entry the next `history.review` of the same task opens at, per script; null, the first, after that task. */
function createFocus(): Pick<ReviewStore, "focus" | "focusTarget"> {
  const targets = new Map<string, Value<string | null>>();
  const focusTarget = (docId: string) =>
    cached(targets, docId, () => createValue<string | null>(null));
  return {
    focus(docId, blockId) {
      const target = focusTarget(docId);
      target.set(blockId);
      queueMicrotask(() => target.set(null));
    },
    focusTarget,
  };
}

/**
 * The leader tab moves each item the device filed into the private index's `review` map, and lets the device forget it
 * only once that write is saved; every tab lists the entries from the map. The writers of an overlap are asked of
 * `names`; this person is never one of them.
 */
export function createReviewStore(options: {
  privateIndex: PrivateIndex;
  sync: PersonSync;
  names: (
    docId: string,
    clientIds: readonly number[],
  ) => Promise<readonly string[]>;
  messages: MessageQueue;
  announce: (text: string) => void;
  now: () => number;
}): ReviewStore {
  const { privateIndex, sync } = options;
  const followed = new Map<string, Followed>();
  const actions = createReviewActions({
    ...options,
    review: privateIndex.review,
    followed,
  });
  const lists = createLists({ privateIndex, sync, followed });
  const announce = createAnnouncing({ ...options, followed, ...lists });
  const moves = createReviewMoves({
    ...options,
    moved(docId) {
      const open = followed.get(docId);
      if (open !== undefined) open.unannounced += 1;
      announce(docId);
    },
  });
  quietly(moves.moveAll());
  const stopMoving = sync.link.subscribe(() => quietly(moves.moveAll()));
  return {
    openCount: (docId) => {
      lists.listOf(docId);
      return lists.countOf(docId);
    },
    entries: lists.listOf,
    follow(docId, doc) {
      const open: Followed = {
        doc,
        handle: null,
        acted: new Map(),
        seen: null,
        unannounced: 0,
      };
      followed.set(docId, open);
      lists.listOf(docId);
      lists.show();
      const stopOrder = lists.followOrder(docId, open);
      const stop = followScript(sync, docId, open, {
        undo: () => actions.followUndo(open),
        move: () => quietly(moves.move(docId)),
        announce: () => announce(docId),
      });
      return () => {
        stop();
        stopOrder();
        if (followed.get(docId) === open) followed.delete(docId);
      };
    },
    keepAsMerged: actions.keepAsMerged,
    useMine: actions.useMine,
    useTheirs: actions.useTheirs,
    reopenKept: actions.reopenKept,
    ...createFocus(),
    dispose() {
      lists.dispose();
      stopMoving();
    },
  };
}
