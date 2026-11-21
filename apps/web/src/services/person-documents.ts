// The person's sync and what it opens: their private index, the Library read from index documents, and their documents.
import type { KeyValueMap } from "@manent/settings";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { LIBRARY_WORDS, createValue, messageFor } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import type { ConnectionControl } from "../demo/connection-transport.ts";
import { followDemoSeed } from "../demo/use-demo.ts";
import type { Where } from "../platform.ts";
import type { TabPerson } from "../session.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type { DocumentSource } from "./ports.ts";
import type { PersonSync } from "./sync/create-sync.ts";
import { createSyncDocumentSource } from "./sync/document-source.ts";
import {
  createLaterLibrary,
  createLaterMap,
  createLaterReview,
} from "./sync/later-index.ts";
import type { PersonReview } from "./sync/later-index.ts";
import type { SyncLibrary, onOwnChange } from "./sync/library-index.ts";
import type { checkCleared, recordOnDevice } from "./sync/on-device.ts";
import type { PrivateIndex } from "./sync/private-index.ts";
import type { ReviewStore } from "./sync/review.ts";

type Options = CommandsOptions & { person: TabPerson };

interface Indexes {
  privateIndex: PrivateIndex;
  library: SyncLibrary;
  review: ReviewStore;
  onOwnChange: typeof onOwnChange;
  recordOnDevice: typeof recordOnDevice;
  checkCleared: typeof checkCleared;
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

/** The person's private index and Library over `sync`, each loaded apart from the entry. */
async function openIndexes(
  sync: PersonSync,
  options: Options,
  messages: MessageQueue,
): Promise<Indexes> {
  const { person } = options;
  const [privateParts, libraryParts, onDevice, reviewParts] = await Promise.all(
    [
      import("./sync/private-index.ts"),
      import("./sync/library-index.ts"),
      import("./sync/on-device.ts"),
      import("./sync/review.ts"),
    ],
  );
  const { userId } = person;
  const privateIndex = await privateParts.openPrivateIndex({
    sync,
    userId,
    memory: sync.memory,
  });
  const workspaces = createValue(sync.memory.workspaces(userId) ?? []);
  if (person.token !== null)
    void options.api.me().then((answer) => {
      if (!answer.ok) return;
      sync.memory.setWorkspaces(userId, answer.me.workspaces);
      workspaces.set(answer.me.workspaces);
    });
  const library = libraryParts.createSyncLibrary({
    sync,
    privateIndex,
    userId,
    workspaces,
    localWorkspaceId: person.token === null ? userId : null,
    language: options.language,
    now: options.now,
    newId: options.randomId,
  });
  const review = reviewParts.createReviewStore({
    privateIndex,
    sync,
    // the server answers for at most 64 ids at once
    names: async (docId, clientIds) =>
      (await options.api.docClients(docId, clientIds.slice(0, 64))).clients.map(
        (client) => client.userId,
      ),
    messages,
    announce: (text) => options.dom.announce(text),
    now: options.now,
  });
  return {
    privateIndex,
    library,
    review,
    onOwnChange: libraryParts.onOwnChange,
    recordOnDevice: onDevice.recordOnDevice,
    checkCleared: onDevice.checkCleared,
  };
}

/** Keeps the device's entry for an open document: its title, and whether the server holds all of it. */
function keepOnDevice(
  indexes: Indexes,
  open: {
    docId: string;
    handle: DocHandle;
    deviceId: string;
    now: () => number;
  },
): () => void {
  const { docId, handle } = open;
  const title = indexes.library.documentTitle(docId);
  let recorded = "";
  const record = (): void => {
    const status = handle.status.get();
    const synced = !status.neverSynced && status.waiting === 0;
    const named = title.get() ?? LIBRARY_WORDS.untitledScript;
    if (recorded === `${synced}|${named}`) return;
    recorded = `${synced}|${named}`;
    indexes.recordOnDevice({
      privateIndex: indexes.privateIndex,
      deviceId: open.deviceId,
      docId,
      title: named,
      synced,
      now: open.now,
    });
  };
  record();
  const stops = [handle.status.subscribe(record), title.subscribe(record)];
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * In this tab's leader, marks `docId` open from the store's next local sequence, and removes the mark when it closes.
 * A mark of the same document found already there means the page ended without leaving: the own changes stored since
 * are told as already saved.
 */
function markOpen(
  sync: PersonSync,
  open: { docId: string; messages: MessageQueue },
): () => void {
  const { docId } = open;
  const { memory, userId } = sync;
  let closed = false;
  void (async () => {
    if (!sync.link.get().leader) return;
    const before = memory.openMarker(userId);
    const entries = (await sync.store.load(docId))?.entries ?? [];
    if (closed) return;
    const changed = new Set(
      entries.flatMap((entry) =>
        before?.docId === docId &&
        entry.kind === "update" &&
        entry.own &&
        entry.localSeq >= before.fromLocalSeq
          ? entry.elements
          : [],
      ),
    );
    if (changed.size > 0)
      open.messages.push(
        messageFor({ kind: "crash_recovered", count: changed.size }),
      );
    const last = Math.max(0, ...entries.map((entry) => entry.localSeq));
    memory.setOpenMarker(userId, { docId, fromLocalSeq: last + 1 });
  })();
  return () => {
    closed = true;
    if (memory.openMarker(userId)?.docId === docId)
      memory.setOpenMarker(userId, null);
  };
}

/**
 * Asks the browser to keep this origin's data, once, at the person's first own change of the session. Firefox would
 * ask the person a question, so there only Preferences asks.
 */
function askPersistenceOnce(where: Where): () => void {
  let asked = where.browser === "Firefox";
  return () => {
    if (asked) return;
    asked = true;
    void import("@manent/client-web")
      .then(({ requestPersistence }) =>
        requestPersistence("storage" in navigator ? navigator.storage : null),
      )
      .catch(() => {
        // a browser that cannot be asked keeps the data as it decides; Preferences says which
      });
  };
}

/** Once the private index has synced, tells what came back to a browser that cleared Manent's data. */
function tellCleared(
  sync: PersonSync,
  indexes: Indexes,
  open: { deviceId: string; messages: MessageQueue },
): void {
  const { handle } = indexes.privateIndex;
  const check = async (): Promise<void> => {
    const event = await indexes.checkCleared({
      hadDatabase: sync.hadDatabase,
      privateIndex: indexes.privateIndex,
      deviceId: open.deviceId,
      documents: () => sync.client.documents(),
    });
    if (event !== null) open.messages.push(messageFor(event));
  };
  if (handle.status.get().synced) return void check();
  const stop = handle.status.subscribe((status) => {
    if (!status.synced) return;
    stop();
    void check();
  });
}

/** Settles once the demo's seed has been followed: never when this device's data is cleared and the page reloaded. */
async function followSeed(options: Options): Promise<void> {
  const device = await import("./sync/device-memory.ts");
  await followDemoSeed({
    demo: () => options.api.demo(),
    memory: device.createDeviceMemory({
      local: options.storage,
      session: null,
    }),
    clear: async () =>
      (await import("@manent/client-web")).clearManentData(
        device.browserStores(),
      ),
    reload: () => location.reload(),
  });
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
  const { person } = options;
  const sync = followSeed(options).then(() =>
    options.startSync(person, deviceId),
  );
  let started: PersonSync | null = null;
  const network = createValue(options.online());
  const client = sync.then((s) => {
    started = s;
    network.set(s.network.get());
    s.network.subscribe((online) => network.set(online));
    return s.client;
  });
  void client.catch(() => {
    // each document's status says that the sync cannot start
  });
  const indexes = sync
    .then(async (s) => {
      const opened = await openIndexes(s, options, messages);
      tellCleared(s, opened, { deviceId, messages });
      return opened;
    })
    .catch(() => {
      // the maps hold what is written for this session, and the Library stays empty
      return null;
    });
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
  const library = createLaterLibrary({
    library: indexes.then((opened) => opened?.library ?? null),
    newId: options.randomId,
  });
  const review = createLaterReview({
    store: indexes.then((opened) => opened?.review ?? null),
  });
  const handles = new Set<DocHandle>();
  const askPersistence = askPersistenceOnce(options.where);
  const source = createSyncDocumentSource({
    sync,
    review,
    titles: (docId) =>
      library.documentTitle(docId).get() ?? LIBRARY_WORDS.untitledScript,
    messages,
    now: options.now,
    schedule: options.schedule,
    removedInfo: (docId) => options.api.removedDoc(docId),
    opened(docId, handle) {
      handles.add(handle);
      const stops = [
        library.follow(docId, handle),
        ...(started === null ? [] : [markOpen(started, { docId, messages })]),
        () => handles.delete(handle),
      ];
      let stopped = false;
      void indexes.then((opened) => {
        if (stopped || opened === null) return;
        const { now } = options;
        stops.push(
          keepOnDevice(opened, { docId, handle, deviceId, now }),
          opened.onOwnChange(handle, askPersistence),
        );
      });
      return () => {
        stopped = true;
        for (const stop of stops) stop();
      };
    },
  });
  // Continue is written as a document is asked for, even when it is left before its handle has opened
  const marked = new Map<string, () => void>();
  const documents: DocumentSource = {
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
  const connection = sync.then((s) => s.connection);
  void connection.catch(() => {
    // the demo bar draws no Connection for a sync that cannot start
  });
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
      if (started === null) return;
      const { memory, link } = started;
      memory.keepLegacyMaps(person.userId, {
        prefs: maps.prefs.held(),
        keys: maps.keys.held(),
      });
      // only the leader marks what it opens
      if (link.get().leader) memory.setOpenMarker(person.userId, null);
      if (link.get().state === "online") return;
      for (const handle of handles)
        if (handle.status.get().waiting > 0)
          void handle.saveVersion("session_end").catch(() => {
            // best effort: the page is going, and the changes are already saved on the device
          });
    },
    dispose() {
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
