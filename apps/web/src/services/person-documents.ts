// The person's sync and what it opens: their private index, the Library read from index documents, and their documents.
import type { KeyValueMap } from "@manent/settings";
import type { DocHandle, SyncClient } from "@manent/sync-client";
import { LIBRARY_WORDS, createValue } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
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
import type { SyncLibrary } from "./sync/library-index.ts";
import type { recordOnDevice } from "./sync/on-device.ts";
import type { PrivateIndex } from "./sync/private-index.ts";
import type { ReviewStore } from "./sync/review.ts";

type Options = CommandsOptions & { person: TabPerson };

interface Indexes {
  privateIndex: PrivateIndex;
  library: SyncLibrary;
  review: ReviewStore;
  recordOnDevice: typeof recordOnDevice;
}

/** What the services keep of the person's sync. */
export interface PersonDocuments {
  client: Promise<SyncClient>;
  documents: DocumentSource;
  library: SyncLibrary;
  review: PersonReview;
  /** The private index's maps, holding what is written until it opens. */
  maps: { prefs: KeyValueMap; keys: KeyValueMap; flags: KeyValueMap };
  /** Settles once the private index has opened and its maps are attached, or the sync could not start. */
  ready: Promise<void>;
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
    recordOnDevice: onDevice.recordOnDevice,
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
 * The person's sync, started here on `deviceId`; their preference maps, held until the private index opens; the
 * documents it opens; and the Library. `dispose` disposes the sync.
 */
export function createPersonDocuments(
  options: Options,
  deviceId: string,
  messages: MessageQueue,
): PersonDocuments {
  const sync = options.startSync(options.person, deviceId);
  const client = sync.then((s) => s.client);
  void client.catch(() => {
    // each document's status says that the sync cannot start
  });
  const indexes = sync
    .then((s) => openIndexes(s, options, messages))
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
  const documents = createSyncDocumentSource({
    sync,
    review,
    titles: (docId) =>
      library.documentTitle(docId).get() ?? LIBRARY_WORDS.untitledScript,
    messages,
    now: options.now,
    schedule: options.schedule,
    removedInfo: (docId) => options.api.removedDoc(docId),
    opened(docId, handle) {
      const stops = [library.follow(docId, handle)];
      let stopped = false;
      void indexes.then((opened) => {
        if (stopped || opened === null) return;
        const { now } = options;
        stops.push(keepOnDevice(opened, { docId, handle, deviceId, now }));
      });
      return () => {
        stopped = true;
        for (const stop of stops) stop();
      };
    },
  });
  return {
    client,
    documents,
    library,
    review,
    maps,
    ready,
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
