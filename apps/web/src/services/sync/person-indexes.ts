// The person's private index, Library and To review over their started sync, and what each open document keeps current
// in them, loaded apart from the entry.
import type { DocHandle } from "@manent/sync-client";
import { LIBRARY_WORDS, createValue } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import type { TabPerson } from "../../session.ts";
import type { CommandsOptions } from "../person-commands.ts";
import type { PersonSync } from "./create-sync.ts";
import { askPersistenceOnce, tellCleared } from "./device-trust.ts";
import type { SyncLibrary, onOwnChange } from "./library-index.ts";
import type { checkCleared, recordOnDevice } from "./on-device.ts";
import type { PrivateIndex } from "./private-index.ts";
import type { ReviewStore } from "./review.ts";

type Options = CommandsOptions & { person: TabPerson };

/** The person's indexes, opened over their sync. */
export interface Indexes {
  privateIndex: PrivateIndex;
  library: SyncLibrary;
  review: ReviewStore;
  /**
   * Keeps the device's entry for the open document current, and asks for persistence at the person's first own change
   * to it; the returned function stops both.
   */
  keep(docId: string, handle: DocHandle): () => void;
}

interface Parts {
  privateIndex: PrivateIndex;
  library: SyncLibrary;
  review: ReviewStore;
  onOwnChange: typeof onOwnChange;
  recordOnDevice: typeof recordOnDevice;
  checkCleared: typeof checkCleared;
}

/** The person's private index and Library over `sync`, each loaded apart from the entry. */
async function openParts(
  sync: PersonSync,
  options: Options,
  messages: MessageQueue,
): Promise<Parts> {
  const { person } = options;
  const [privateParts, libraryParts, onDevice, reviewParts] = await Promise.all(
    [
      import("./private-index.ts"),
      import("./library-index.ts"),
      import("./on-device.ts"),
      import("./review.ts"),
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
    names: async (docId, clientIds) => {
      const asked = await sync.throughConnection(() =>
        options.api.docClients(docId, clientIds.slice(0, 64)),
      );
      return asked.clients.map((client) => client.userId);
    },
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
  parts: Parts,
  open: {
    docId: string;
    handle: DocHandle;
    deviceId: string;
    now: () => number;
  },
): () => void {
  const { docId, handle } = open;
  const title = parts.library.documentTitle(docId);
  let recorded = "";
  const record = (): void => {
    const status = handle.status.get();
    const synced = !status.neverSynced && status.waiting === 0;
    const named = title.get() ?? LIBRARY_WORDS.untitledScript;
    if (recorded === `${synced}|${named}`) return;
    recorded = `${synced}|${named}`;
    parts.recordOnDevice({
      privateIndex: parts.privateIndex,
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

/** The person's indexes over `sync` on `deviceId`; once the private index has synced, a cleared browser is told what came back. */
export async function openIndexes(
  sync: PersonSync,
  options: Options,
  open: { deviceId: string; messages: MessageQueue },
): Promise<Indexes> {
  const parts = await openParts(sync, options, open.messages);
  tellCleared(sync, parts, open);
  const askPersistence = askPersistenceOnce(options.where);
  return {
    privateIndex: parts.privateIndex,
    library: parts.library,
    review: parts.review,
    keep(docId, handle) {
      const stops = [
        keepOnDevice(parts, {
          docId,
          handle,
          deviceId: open.deviceId,
          now: options.now,
        }),
        parts.onOwnChange(handle, askPersistence),
      ];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
