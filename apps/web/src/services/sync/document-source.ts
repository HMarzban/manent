// One person's documents, each opened from the device at once and kept up to date by the person's sync.
import { UNSET } from "@manent/settings";
import type { Bag } from "@manent/settings";
import { createValue } from "@manent/ui";
import type { StateFact, StatusFacts } from "@manent/ui";
import { peoplePresent } from "../../room/people-present.ts";
import { materialActions } from "../../state/material.store.ts";
import type { DocumentServices, DocumentSource } from "../ports.ts";
import type { PersonSync } from "./create-sync.ts";
import type { Following, SceneWaiting, Shown } from "./follow-handle.ts";

export type { ReviewPort } from "./follow-handle.ts";

const noop = (): void => {};

/** The status while the document opens: an editor's, saved; syncing for a person with a session, else never synced. */
const opening = (now: number, signedIn: boolean): StatusFacts => ({
  access: "edit",
  device: "ok",
  network: "online",
  server: signedIn ? "syncing" : "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: !signedIn,
  shell: "web",
  toReview: 0,
  now,
});

interface Options extends Following {
  sync: Promise<PersonSync>;
  /** The person has a session. */
  signedIn: boolean;
}

/** What only an open handle needs, loaded apart from the entry. */
const loadParts = async () => {
  const [bag, follow] = await Promise.all([
    import("./script-bag.ts"),
    import("./follow-handle.ts"),
  ]);
  return {
    createScriptBag: bag.createScriptBag,
    followHandle: follow.followHandle,
  };
};

type Listener = Parameters<Bag["subscribe"]>[0];

/** A bag that holds what is written until the script's own bag arrives, then passes everything to it. */
function createLaterBag(): Bag & { attach(bag: Bag): () => void } {
  let target: Bag | null = null;
  const queued = new Map<string, unknown>();
  const listeners = new Set<Listener>();
  const tell: Listener = (keys, origin) => {
    for (const listener of listeners) listener(keys, origin);
  };
  return {
    read: () =>
      target?.read() ??
      Object.fromEntries([...queued].filter(([, value]) => value !== UNSET)),
    provenance: (key) => target?.provenance(key) ?? null,
    write(patch) {
      if (target !== null) return target.write(patch);
      for (const [key, value] of Object.entries(patch)) queued.set(key, value);
      tell(Object.keys(patch), "local");
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canWrite: (key) => target?.canWrite(key) ?? true,
    attach(bag) {
      const loaded = Object.keys(bag.read()).filter((key) => !queued.has(key));
      target = bag;
      const stop = bag.subscribe(tell);
      if (queued.size > 0) bag.write(Object.fromEntries(queued));
      queued.clear();
      if (loaded.length > 0) tell(loaded, "remote");
      return stop;
    },
  };
}

/**
 * Each document opens its handle at once, from the device first. Until the handle has opened, its status is the one a
 * document shows while it opens and its script settings are held, then written through the handle.
 */
export function createSyncDocumentSource(options: Options): DocumentSource {
  const open = new Map<string, { services: DocumentServices; close(): void }>();
  const openDocument = (docId: string) => {
    const shown: Shown = {
      status: createValue(opening(options.now(), options.signedIn)),
      waitingByScene: createValue<readonly SceneWaiting[]>([]),
      stateFacts: createValue<readonly StateFact[]>([]),
    };
    const scriptBag = createLaterBag();
    let closed = false;
    let stop = noop;
    (async () => {
      const sync = await options.sync;
      const [handle, parts] = await Promise.all([
        sync.client.open(docId),
        loadParts(),
      ]);
      // what was written while it opened is sent even when it has been closed since
      const stopBag = scriptBag.attach(
        parts.createScriptBag(
          handle,
          () => shown.status.get().access === "edit",
        ),
      );
      if (closed) {
        stopBag();
        await handle.close();
        return;
      }
      const stopFollowing = parts.followHandle(options, {
        docId,
        handle,
        sync,
        shown,
      });
      stop = () => {
        stopFollowing();
        stopBag();
        void handle.close();
      };
    })().catch(() => {
      // a sync that cannot start, or a document it cannot open, is never said to be saved on this device
      shown.status.set({
        ...opening(options.now(), options.signedIn),
        device: "failing",
      });
    });
    return {
      services: {
        ...shown,
        scriptBag,
        people: peoplePresent(docId),
        material: materialActions,
      },
      close() {
        closed = true;
        stop();
      },
    };
  };
  return {
    open(docId) {
      const known = open.get(docId) ?? openDocument(docId);
      open.set(docId, known);
      return known.services;
    },
    close(docId) {
      open.get(docId)?.close();
      open.delete(docId);
    },
  };
}
