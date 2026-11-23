// The person's private index, their Library and their review over their sync, each loaded apart from the entry.
import type { WorkspaceRef } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { POLL_MS } from "../demo/use-demo.ts";
import type { TabPerson } from "../session.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type { PersonSync } from "./sync/create-sync.ts";
import type { SyncLibrary, onOwnChange } from "./sync/library-index.ts";
import type { checkCleared, keepOnDevice } from "./sync/on-device.ts";
import type { PrivateIndex } from "./sync/private-index.ts";
import type { ReviewStore } from "./sync/review.ts";

export type PersonOptions = CommandsOptions & { person: TabPerson };

export interface Indexes {
  privateIndex: PrivateIndex;
  library: SyncLibrary;
  review: ReviewStore;
  onOwnChange: typeof onOwnChange;
  keepOnDevice: typeof keepOnDevice;
  checkCleared: typeof checkCleared;
  /** Stops asking the server for the person's workspaces. */
  stopAsking: () => void;
}

/** Asks for the person's workspaces, again every POLL_MS until answered and while one is getting ready; returns the stop. */
function askWorkspaces(
  options: PersonOptions,
  heard: (workspaces: readonly WorkspaceRef[]) => void,
): () => void {
  let stopped = false;
  let cancel: (() => void) | null = null;
  const ask = (): void => {
    void options.api
      .me()
      .catch(() => ({ ok: false, reason: "unreachable" }) as const)
      .then((answer) => {
        if (stopped) return;
        if (answer.ok) heard(answer.me.workspaces);
        const again = answer.ok
          ? answer.me.workspaces.some((w) => w.seeding?.failed === false)
          : answer.reason === "unreachable";
        if (again) cancel = options.schedule(ask, POLL_MS);
      });
  };
  ask();
  return () => {
    stopped = true;
    cancel?.();
  };
}

/** The person's private index and Library over `sync`, each loaded apart from the entry. */
export async function openIndexes(
  sync: PersonSync,
  options: PersonOptions,
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
  const stopAsking =
    person.token === null
      ? () => {}
      : askWorkspaces(options, (heard) => {
          sync.memory.setWorkspaces(userId, heard);
          workspaces.set(heard);
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
    keepOnDevice: onDevice.keepOnDevice,
    checkCleared: onDevice.checkCleared,
    stopAsking,
  };
}
