// The person's sync and what it opens: their private index, the Library read from index documents, and their documents.
import type { KeyValueMap } from "@manent/settings";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { LIBRARY_WORDS, createValue } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import type { ConnectionControl } from "../demo/connection-transport.ts";
import { watchHandoffRefusals } from "../desktop/handoff-message.ts";
import type { TabPerson } from "../session.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type { DocumentSource } from "./ports.ts";
import type { PersonSync } from "./sync/create-sync.ts";
import type { markOpen } from "./sync/device-trust.ts";
import { createSyncDocumentSource } from "./sync/document-source.ts";
import {
  createLaterLibrary,
  createLaterMap,
  createLaterReview,
} from "./sync/later-index.ts";
import type { LaterMap, PersonReview } from "./sync/later-index.ts";
import type { SyncLibrary } from "./sync/library-index.ts";
import type { Indexes } from "./sync/person-indexes.ts";

type Options = CommandsOptions & { person: TabPerson };

/** The started sync, and how an open document is marked open in it. */
interface Started {
  sync: PersonSync;
  markOpen: typeof markOpen;
}

/** What the services keep of the person's sync. */
export interface PersonDocuments {
  client: Promise<SyncClient>;
  /** Rejects when the sync cannot start. */
  connection: Promise<ConnectionControl>;
  /** The person's sync says it can reach the network; the browser's word until the sync has started. */
  network: Subscribable<boolean>;
  documents: DocumentSource;
  library: SyncLibrary;
  review: PersonReview;
  /** The private index's maps, holding what is written until it opens. */
  maps: { prefs: KeyValueMap; keys: KeyValueMap; flags: KeyValueMap };
  /** Settles once the private index has opened and its maps are attached, or the sync could not start. */
  ready: Promise<void>;
  /**
   * The page is going: what the maps hold for a private index that has not opened is kept for its next open to carry
   * over, the open marker is removed, and each open document with own changes waiting and no connection saves a
   * version of the session's end.
   */
  leave(): void;
  dispose(): void;
}

/**
 * What an open document keeps current in this tab: its `editedAt`, the open marker, its entry of what this device
 * holds, and the persistence request at the person's first own change; `handles` holds it while it is open.
 */
function openedHook(hook: {
  library: SyncLibrary;
  indexes: Promise<Indexes | null>;
  started: () => Started | null;
  handles: Subscribable<readonly DocHandle[]> & {
    set(handles: readonly DocHandle[]): void;
  };
  messages: MessageQueue;
}): (docId: string, handle: DocHandle) => () => void {
  const { handles } = hook;
  return (docId, handle) => {
    handles.set([...handles.get(), handle]);
    const started = hook.started();
    const stops = [
      hook.library.follow(docId, handle),
      ...(started === null
        ? []
        : [started.markOpen(started.sync, { docId, messages: hook.messages })]),
      () => handles.set(handles.get().filter((each) => each !== handle)),
    ];
    let stopped = false;
    void hook.indexes.then((opened) => {
      if (stopped || opened === null) return;
      stops.push(opened.keep(docId, handle));
    });
    return () => {
      stopped = true;
      for (const stop of stops) stop();
    };
  };
}

/** `source`, writing Continue as a document is asked for, even when it is left before its handle has opened. */
function continuedSource(
  source: DocumentSource,
  library: SyncLibrary,
): DocumentSource {
  const marked = new Map<string, () => void>();
  return {
    open(docId) {
      if (!marked.has(docId)) marked.set(docId, library.markOpened(docId));
      return source.open(docId);
    },
    close(docId) {
      marked.get(docId)?.();
      marked.delete(docId);
      source.close(docId);
    },
  };
}

/** The private index's maps, each holding what is written until the index opens; `ready` settles once they are attached. */
function laterMaps(indexes: Promise<Indexes | null>): {
  maps: { prefs: LaterMap; keys: LaterMap; flags: LaterMap };
  ready: Promise<void>;
} {
  const maps = {
    prefs: createLaterMap(),
    keys: createLaterMap(),
    flags: createLaterMap(),
  };
  const ready = indexes.then((opened) => {
    if (opened === null) return;
    maps.prefs.attach(opened.privateIndex.prefs);
    maps.keys.attach(opened.privateIndex.keys);
    maps.flags.attach(opened.privateIndex.flags);
  });
  return { maps, ready };
}

/** What `PersonDocuments.leave` does, over the started sync. */
function leavePage(
  sync: PersonSync,
  maps: { prefs: LaterMap; keys: LaterMap },
  handles: readonly DocHandle[],
): void {
  const { memory, link, userId } = sync;
  memory.keepLegacyMaps(userId, {
    prefs: maps.prefs.held(),
    keys: maps.keys.held(),
  });
  // only the leader marks what it opens
  if (link.get().leader) memory.setOpenMarker(userId, null);
  if (link.get().state === "online") return;
  for (const handle of handles)
    if (handle.status.get().waiting > 0)
      void handle.saveVersion("session_end").catch(() => {
        // best effort: the page is going, and the changes are already saved on the device
      });
}

/** The person's sync, started once the demo's seed has been followed, and their indexes opened over it. */
function startPersonSync(
  options: Options,
  deviceId: string,
  messages: MessageQueue,
): {
  sync: Promise<PersonSync>;
  /** Null until the sync has started. */
  started: () => Started | null;
  network: Subscribable<boolean>;
  client: Promise<SyncClient>;
  connection: Promise<ConnectionControl>;
  /** Null when the sync or the indexes could not start. */
  indexes: Promise<Indexes | null>;
} {
  // following the seed, and what only a started sync runs, load apart from the entry
  const trust = import("./sync/device-trust.ts");
  const sync = trust.then(async ({ followSeed }) => {
    await followSeed(options);
    return options.startSync(options.person, deviceId);
  });
  let started: Started | null = null;
  const network = createValue(options.online());
  const client = Promise.all([sync, trust]).then(([s, { markOpen }]) => {
    started = { sync: s, markOpen };
    network.set(s.network.get());
    s.network.subscribe((online) => network.set(online));
    return s.client;
  });
  void client.catch(() => {
    // each document's status says that the sync cannot start
  });
  const connection = sync.then((s) => s.connection);
  void connection.catch(() => {
    // the demo bar draws no Connection for a sync that cannot start
  });
  const indexes = Promise.all([sync, import("./sync/person-indexes.ts")])
    .then(([s, { openIndexes }]) =>
      openIndexes(s, options, { deviceId, messages }),
    )
    .catch(() => {
      // the maps hold what is written for this session, and the Library stays empty
      return null;
    });
  return {
    sync,
    started: () => started,
    network,
    client,
    connection,
    indexes,
  };
}

/**
 * The person's sync, started here on `deviceId`; their preference maps, held until the private index opens; the
 * documents it opens; and the Library. `dispose` disposes the sync.
 */
export function createPersonDocuments(
  options: Options,
  deviceId: string,
  messages: MessageQueue,
): PersonDocuments {
  const { sync, started, network, client, connection, indexes } =
    startPersonSync(options, deviceId, messages);
  const { maps, ready } = laterMaps(indexes);
  const library = createLaterLibrary({
    library: indexes.then((opened) => opened?.library ?? null),
    newId: options.randomId,
  });
  const review = createLaterReview({
    store: indexes.then((opened) => opened?.review ?? null),
  });
  const handles = createValue<readonly DocHandle[]>([]);
  const titles = (docId: string): string =>
    library.documentTitle(docId).get() ?? LIBRARY_WORDS.untitledScript;
  // only the desktop app's node sends an upstream status: on the web this says nothing
  const stopRefusals = watchHandoffRefusals({
    handles: handles.get,
    handlesChanged: handles.subscribe,
    title: titles,
    queue: messages,
  });
  const source = createSyncDocumentSource({
    sync,
    review,
    titles,
    messages,
    now: options.now,
    schedule: options.schedule,
    removedInfo: async (docId) =>
      (await sync).throughConnection(() => options.api.removedDoc(docId)),
    opened: openedHook({
      library,
      indexes,
      started,
      handles,
      messages,
    }),
  });
  const documents = continuedSource(source, library);
  return {
    client,
    connection,
    network,
    documents,
    library,
    review,
    maps,
    ready,
    leave() {
      const going = started();
      if (going !== null) leavePage(going.sync, maps, handles.get());
    },
    dispose() {
      stopRefusals();
      review.dispose();
      void sync.then(
        (s) => s.dispose(),
        () => {
          // a sync that never started holds nothing to dispose
        },
      );
    },
  };
}
