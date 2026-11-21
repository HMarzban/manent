// What keeps an open document's status, facts, waiting changes and messages to its handle, loaded once a handle has opened.
import { sceneOf } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle, StoredEntry, ViewHandle } from "@manent/sync-client";
import type { RemovedDocResponse } from "@manent/sync-protocol";
import { messageFor } from "@manent/ui";
import type {
  MessageQueue,
  StateFact,
  StatusFacts,
  Subscribable,
} from "@manent/ui";
import type { PersonSync } from "./create-sync.ts";
import { toStatusFacts } from "./status-facts.ts";
import { trustEventsOf } from "./trust-events.ts";

/** What the document source needs of the review entries. */
export interface ReviewPort {
  openCount(docId: string): Subscribable<number>;
  /** Follows `doc` for the document's entries; the returned function stops. */
  follow(docId: string, doc: CrdtDoc): () => void;
}

/** What following a handle is given. */
export interface Following {
  review: ReviewPort;
  titles: (docId: string) => string;
  messages: MessageQueue;
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  removedInfo: (docId: string) => Promise<RemovedDocResponse | null>;
}

type Value<T> = Subscribable<T> & { set(value: T): void };

export interface SceneWaiting {
  scene: string;
  count: number;
}

/** Each open document's values: what it shows before its handle opens, filled once it has. */
export interface Shown {
  status: Value<StatusFacts>;
  waitingByScene: Value<readonly SceneWaiting[]>;
  stateFacts: Value<readonly StateFact[]>;
}

/** An open document and the person's sync it is open in. */
interface Opened {
  docId: string;
  handle: DocHandle;
  sync: PersonSync;
  shown: Shown;
}

/** The waiting changes are grouped by scene at most this often. */
const WAITING_EVERY_MS = 250;

/** The same facts read at another time: nothing the status says has changed. */
const isSameStatus = (a: StatusFacts, b: StatusFacts): boolean =>
  Object.keys(a).every(
    (key) =>
      key === "now" || Object.is(Reflect.get(a, key), Reflect.get(b, key)),
  );

const NO_FACTS: readonly StateFact[] = Object.freeze([]);
const ROLE_COMMENT: readonly StateFact[] = Object.freeze([
  { kind: "role_comment" },
]);

/** The element ids of the own changes not yet acknowledged, each once. */
function waitingElements(entries: readonly StoredEntry[]): Set<string> {
  return new Set(
    entries.flatMap((e) =>
      e.kind === "update" && e.own && !e.acked ? e.elements : [],
    ),
  );
}

/** The waiting changes by scene, grouped again at most every WAITING_EVERY_MS once the count changes. */
function groupWaiting(options: Following, open: Opened): () => void {
  const { docId, handle, sync, shown } = open;
  let cancel: (() => void) | null = null;
  let groupedAt = Number.NEGATIVE_INFINITY;
  let count = -1;
  const group = async (): Promise<void> => {
    const loaded = await sync.store.load(docId);
    const scenes = new Map<string, number>();
    for (const id of waitingElements(loaded?.entries ?? [])) {
      const scene = sceneOf(handle.doc(), id);
      if (scene !== null) scenes.set(scene, (scenes.get(scene) ?? 0) + 1);
    }
    shown.waitingByScene.set(
      [...scenes]
        .map(([scene, n]) => ({ scene, count: n }))
        .toSorted((a, b) =>
          a.scene.localeCompare(b.scene, "en", { numeric: true }),
        ),
    );
  };
  const follow = (): void => {
    const { waiting } = handle.status.get();
    if (waiting === count || cancel !== null) return;
    count = waiting;
    const waitMs = Math.max(0, groupedAt + WAITING_EVERY_MS - options.now());
    cancel = options.schedule(() => {
      cancel = null;
      groupedAt = options.now();
      void group();
      follow();
    }, waitMs);
  };
  follow();
  const stop = handle.status.subscribe(follow);
  return () => {
    stop();
    cancel?.();
  };
}

/** Keeps `open.shown` to the handle's facts and tells its events; the returned function stops. */
export function followHandle(options: Following, open: Opened): () => void {
  const { docId, handle, sync, shown } = open;
  const toReview = options.review.openCount(docId);
  let view: ViewHandle | null = null;
  const show = (): void => {
    const role = view?.status.get().role ?? null;
    const facts = toStatusFacts({
      status: handle.status.get(),
      link: sync.link.get(),
      network: sync.network.get(),
      viewRole: role,
      viewLive: view?.status.get().live ?? false,
      offlineSinceAt: sync.offlineSince.get(),
      toReview: toReview.get(),
      now: options.now(),
    });
    // a keystroke changes the handle's status as it is saved, which the status never says
    if (!isSameStatus(shown.status.get(), facts)) shown.status.set(facts);
    shown.stateFacts.set(role === "comment" ? ROLE_COMMENT : NO_FACTS);
  };
  let stopView: (() => void) | null = null;
  const viewing = (next: ViewHandle | null): void => {
    stopView?.();
    view = next;
    stopView = next?.status.subscribe(show) ?? null;
    show();
  };
  let unfollow = options.review.follow(docId, handle.doc());
  viewing(handle.readOnly.get());
  const stops = [
    handle.readOnly.subscribe(viewing),
    ...[
      handle.status,
      sync.link,
      sync.network,
      sync.offlineSince,
      toReview,
    ].map((source: Subscribable<unknown>) => source.subscribe(show)),
    handle.on((event) => {
      if (event.type !== "replaced") return;
      unfollow();
      unfollow = options.review.follow(docId, handle.doc());
    }),
    trustEventsOf({
      handle,
      title: () => options.titles(docId),
      removedInfo: options.removedInfo,
      lastSyncedAt: async () =>
        (await sync.store.load(docId))?.meta.lastSyncedAt ?? null,
      push: (event) => options.messages.push(messageFor(event)),
    }),
    groupWaiting(options, open),
  ];
  return () => {
    for (const stop of stops) stop();
    stopView?.();
    unfollow();
  };
}
