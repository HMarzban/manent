// To review: what the device filed, moved into the person's private index, listed per script, with its choices and undo.
import {
  ORIGIN_REVIEW,
  applyBlockOps,
  isUndoStep,
  observeScript,
  readBlocks,
  sceneOf,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlock, randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import {
  REVIEW_WORDS,
  createValue,
  joinNames,
  messageFor,
  statusText,
} from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import type { PersonSync } from "./create-sync.ts";
import type { ReviewPort } from "./document-source.ts";
import { nameOf } from "./index-entries.ts";
import type { PrivateIndex } from "./private-index.ts";
import { listOpen, openOverlaps, readEntry } from "./review-entries.ts";
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

/** What one action of this tab wrote, so the script's undo and redo open or settle its entries again. */
interface Acted {
  ids: readonly string[];
  /** Null: the action found no block, or inserted one. */
  before: BlockJSON | null;
  wrote: BlockJSON;
}

/** One open script, as this tab follows it for To review. */
interface Followed {
  doc: CrdtDoc;
  handle: DocHandle | null;
  /** Each acted block's id: what the action there wrote. */
  acted: Map<string, Acted>;
  /** Items moved that no receipt has counted yet; below 0 while a receipt counted items still being moved. */
  unannounced: number;
}

const sameBlock = (a: BlockJSON | null, b: BlockJSON | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** The ids of the document's blocks, in order. */
function blockOrder(doc: CrdtDoc): string[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap((section) =>
    (section.content ?? []).flatMap((block) =>
      typeof block.attrs?.id === "string" ? [block.attrs.id] : [],
    ),
  );
}

/** An action block holding `text`, under a new id. */
const actionBlock = (text: string): BlockJSON => ({
  type: "block",
  attrs: { id: randomBlockId(), type: "action" },
  content: text === "" ? [] : [{ type: "text", text }],
});

/** The scene the block is in, in To review's words; null outside a scene. */
function sceneWords(doc: CrdtDoc, blockId: string | null): string | null {
  const n = blockId === null ? null : sceneOf(doc, blockId);
  return n === null ? null : REVIEW_WORDS.scene(n);
}

/** One value per key, made once. */
function valueOf<T>(
  values: Map<string, Value<T>>,
  key: string,
  initial: T,
): Value<T> {
  const known = values.get(key);
  if (known !== undefined) return known;
  const made = createValue(initial);
  values.set(key, made);
  return made;
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
  const { privateIndex, sync, messages, now } = options;
  const { review } = privateIndex;
  const lists = new Map<string, Value<readonly Listed[]>>();
  const counts = new Map<string, Value<number>>();
  const targets = new Map<string, Value<string | null>>();
  const followed = new Map<string, Followed>();
  // the blocks before each entry's block as this tab last saw them, nearest first, so a deleted passage goes back in place
  const earlier = new Map<string, string[]>();
  let lastKept: readonly string[] | null = null;

  const all = (): Listed[] =>
    Object.entries(review.entries()).flatMap(([id, value]) => {
      const entry = readEntry(value);
      return entry === null ? [] : [{ ...entry, id }];
    });
  const find = (id: string): Listed | null =>
    all().find((e) => e.id === id) ?? null;
  const show = (): void => {
    const every = all();
    for (const [docId, list] of lists) {
      const doc = followed.get(docId)?.doc;
      const order = doc === undefined ? [] : blockOrder(doc);
      for (const e of every) {
        const at = e.docId === docId ? order.indexOf(e.blockId ?? "") : -1;
        if (at !== -1) earlier.set(e.id, order.slice(0, at).toReversed());
      }
      const open = listOpen(every, docId, order);
      list.set(open);
      valueOf(counts, docId, 0).set(open.length);
    }
  };
  const listOf = (docId: string): Value<readonly Listed[]> => {
    const known = lists.has(docId);
    const list = valueOf<readonly Listed[]>(lists, docId, []);
    if (!known) show();
    return list;
  };
  const stopShowing = review.subscribe(show);

  /** Says the script's status, as the status bar words it, for the entries no message counts. */
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
        toReview: valueOf(counts, docId, 0).get(),
        now: now(),
      }),
    );
    options.announce(
      [words.device, words.server].filter((w) => w !== null).join(" · "),
    );
  };
  /** Once the script is synced, after the receipt that may follow in the same task. */
  const announceWhenSynced = (docId: string): void => {
    const synced = followed.get(docId)?.handle?.status.get().synced === true;
    if (synced) queueMicrotask(() => announce(docId));
  };
  const moves = createReviewMoves({
    ...options,
    moved(docId) {
      const open = followed.get(docId);
      if (open !== undefined) open.unannounced += 1;
      announceWhenSynced(docId);
    },
  });
  quietly(moves.moveAll());
  const stopMoving = sync.link.subscribe(() => quietly(moves.moveAll()));

  const settle = (
    ids: readonly string[],
    settled: boolean,
    before: BlockJSON | null,
  ): void => {
    for (const id of ids) {
      const entry = readEntry(review.get(id));
      if (entry === null || entry.settled === settled) continue;
      review.set(id, { ...entry, settled, before: settled ? before : null });
    }
  };
  /** The nearest block before the entry's that the document still holds; null: the start. */
  const anchorOf = (doc: CrdtDoc, entryId: string): string | null => {
    const held = new Set(blockOrder(doc));
    return earlier.get(entryId)?.find((id) => held.has(id)) ?? null;
  };
  const remember = (docId: string, blockId: string, done: Acted): void => {
    followed.get(docId)?.acted.set(blockId, done);
  };
  const choose = (id: string, doc: CrdtDoc, side: "mine" | "theirs") => {
    const entry = find(id);
    if (entry === null) return;
    lastKept = null;
    if (entry.kind === "recovered") {
      const block = actionBlock(entry.text);
      const after = entry.nearBlockId ?? anchorOf(doc, entry.id);
      applyBlockOps(doc, [{ op: "insert", after, block }], ORIGIN_REVIEW);
      settle([id], true, null);
      const blockId = String(block.attrs?.id);
      remember(entry.docId, blockId, { ids: [id], before: null, wrote: block });
      const scene = sceneWords(doc, blockId);
      messages.push(
        messageFor({
          kind: "review_settled",
          choice: "recovered",
          names: null,
          scene,
        }),
      );
      return;
    }
    const { blockId } = entry;
    const wrote = canonicalBlock(entry[side]);
    const ids = openOverlaps(all(), entry.docId, blockId).map((e) => e.id);
    const before = readBlocks(doc, new Set([blockId])).get(blockId) ?? null;
    const op =
      before === null
        ? ({ op: "insert", after: anchorOf(doc, id), block: wrote } as const)
        : ({ op: "replace", block: wrote } as const);
    applyBlockOps(doc, [op], ORIGIN_REVIEW);
    settle(ids, true, before);
    remember(entry.docId, blockId, { ids, before, wrote });
    const people = entry.otherUserIds.length;
    const named = side === "theirs" && people > 0 && people < 3;
    const choice = side === "mine" ? "mine" : named ? "theirs" : "other";
    const names = named ? joinNames(entry.otherUserIds.map(nameOf)) : null;
    const scene = sceneWords(doc, blockId);
    messages.push(messageFor({ kind: "review_settled", choice, names, scene }));
  };

  /** An undo or redo of the person's that leaves an acted block as the action found it opens its entries again, and as the action left it settles them again. */
  const followUndo = (open: Followed) =>
    observeScript(open.doc, (report) => {
      if (!isUndoStep(report.origin)) return;
      const touched = new Set([
        ...report.changed.map((b) => String(b.attrs?.id)),
        ...report.inserted.map(({ block }) => String(block.attrs?.id)),
        ...report.removed,
      ]);
      for (const [blockId, done] of open.acted) {
        if (!touched.has(blockId)) continue;
        const block =
          readBlocks(open.doc, new Set([blockId])).get(blockId) ?? null;
        if (sameBlock(block, done.before)) settle(done.ids, false, null);
        else if (sameBlock(block, done.wrote))
          settle(done.ids, true, done.before);
      }
    });
  const watchHandle = (docId: string, open: Followed, handle: DocHandle) => {
    open.handle = handle;
    const stops = [
      handle.recovered.subscribe(() => quietly(moves.move(docId))),
      handle.on((event) => {
        if (event.type === "receipt" || event.type === "rebuilt")
          open.unannounced -= event.overlaps + event.setAside;
        if (event.type === "rejected") open.unannounced -= event.setAside;
      }),
      handle.status.subscribe(() => announceWhenSynced(docId)),
    ];
    quietly(moves.move(docId));
    return () => {
      for (const stop of stops) stop();
      void handle.close();
    };
  };

  return {
    openCount: (docId) => {
      listOf(docId);
      return valueOf(counts, docId, 0);
    },
    entries: listOf,
    follow(docId, doc) {
      const open: Followed = {
        doc,
        handle: null,
        acted: new Map(),
        unannounced: 0,
      };
      followed.set(docId, open);
      listOf(docId);
      show();
      const stopUndo = followUndo(open);
      let stopHandle: (() => void) | null = null;
      let stopped = false;
      void sync.client.open(docId).then(
        (handle) => {
          if (stopped) void handle.close();
          else stopHandle = watchHandle(docId, open, handle);
        },
        () => {
          // a script the device cannot open files nothing here
        },
      );
      return () => {
        stopped = true;
        stopUndo();
        stopHandle?.();
        if (followed.get(docId) === open) followed.delete(docId);
      };
    },
    keepAsMerged(id) {
      const entry = find(id);
      if (entry === null) return;
      const doc = followed.get(entry.docId)?.doc ?? null;
      const { blockId } = entry;
      const ids =
        entry.kind === "overlap"
          ? openOverlaps(all(), entry.docId, entry.blockId).map((e) => e.id)
          : [id];
      const before =
        doc === null || blockId === null
          ? null
          : (readBlocks(doc, new Set([blockId])).get(blockId) ?? null);
      settle(ids, true, before);
      lastKept = ids;
      const scene = doc === null ? null : sceneWords(doc, blockId);
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
      settle(lastKept, false, null);
      lastKept = null;
      return true;
    },
    focus(docId, blockId) {
      const target = valueOf<string | null>(targets, docId, null);
      target.set(blockId);
      // what follows in the same task (history.review) opens there; after it, the first entry again
      queueMicrotask(() => target.set(null));
    },
    focusTarget: (docId) => valueOf<string | null>(targets, docId, null),
    dispose() {
      stopShowing();
      stopMoving();
    },
  };
}
