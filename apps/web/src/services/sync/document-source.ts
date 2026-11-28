// One person's documents, each opened from the device at once and kept up to date by the person's sync.
import { UNSET } from "@manent/settings";
import type { Bag } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import type { StateFact, StatusFacts } from "@manent/ui";
import { peoplePresent } from "../../room/people-present.ts";
import { materialActions } from "../../state/material.store.ts";
import { writingActions } from "../../state/writing.store.ts";
import type { DocumentServices, DocumentSource } from "../ports.ts";
import type { PersonSync } from "./create-sync.ts";
import type { Following, SceneWaiting, Shown } from "./follow-handle.ts";

export type { ReviewPort } from "./follow-handle.ts";

const noop = (): void => {};

/** The status while the document opens: an editor's, saved; syncing for a person with a session, else never synced. */
const opening = (
  now: number,
  signedIn: boolean,
  shell: StatusFacts["shell"] = "web",
): StatusFacts => ({
  access: "edit",
  device: "ok",
  network: "online",
  server: signedIn ? "syncing" : "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: !signedIn,
  shell,
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
      status: createValue(
        opening(options.now(), options.signedIn, options.shell),
      ),
      waitingByScene: createValue<readonly SceneWaiting[]>([]),
      stateFacts: createValue<readonly StateFact[]>([]),
      viewers: createValue(0),
    };
    const scriptBag = createLaterBag();
    let closed = false;
    let stop = noop;
    let stopTarget = noop;
    (async () => {
      const sync = await options.sync;
      // what the editor session shows, so status, settings and content describe one document
      const bound = writingActions.boundTarget(docId);
      let target = bound.get() ?? writingActions.openTarget(docId);
      const [handle, parts] = await Promise.all([
        sync.client.open(target),
        loadParts(),
      ]);
      const attachBag = (opened: DocHandle): (() => void) =>
        scriptBag.attach(
          parts.createScriptBag(
            opened,
            () => shown.status.get().access === "edit",
          ),
        );
      const follow = (opened: DocHandle, stopBag: () => void) => {
        const stopFollowing = parts.followHandle(options, {
          docId,
          handle: opened,
          sync,
          shown,
        });
        return () => {
          stopFollowing();
          stopBag();
          void opened.close();
        };
      };
      // what was written while it opened is sent even when it has been closed since
      const stopBag = attachBag(handle);
      if (closed) {
        stopBag();
        await handle.close();
        return;
      }
      stop = follow(handle, stopBag);
      // the handle before closes only once the next is followed: its close flushes its outbox
      const swapTo = async (next: string) => {
        const opened = await sync.client.open(next);
        if (closed || target !== next) return opened.close();
        const previous = stop;
        stop = follow(opened, attachBag(opened));
        previous();
      };
      const check = (next: string | null): void => {
        if (next === null || next === target) return;
        target = next;
        swapTo(next).catch(() => {
          // a target the session has just shown and this cannot open leaves the document on the open handle
        });
      };
      stopTarget = bound.subscribe(check);
      // the session may have shown another target while this one opened
      check(bound.get());
    })().catch(() => {
      // a sync that cannot start, or a document it cannot open, is never said to be saved on this device
      shown.status.set({
        ...opening(options.now(), options.signedIn, options.shell),
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
        stopTarget();
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
