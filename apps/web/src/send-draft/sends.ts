// Per-script store of sent drafts, refreshed from the server and on draft_sent / draft_opened controls.
import type { DraftSendGroup, DraftSendItem } from "@manent/sync-protocol";
import { createValue, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useEffect, useMemo } from "react";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import { listDraftSends } from "./requests.ts";

export type { DraftSendGroup, DraftSendItem };

export interface SentDraftLink {
  readonly name: string;
  readonly path: string;
}

export interface ScriptSendsState {
  readonly docId: string;
  readonly status: "loading" | "ready" | "forbidden" | "error";
  readonly sends: readonly DraftSendItem[];
  readonly lastSentLink: SentDraftLink | null;
}

export interface ScriptSendsStore extends Subscribable<ScriptSendsState> {
  refresh(): Promise<void>;
  clear(): void;
}

interface StoreEntry {
  readonly store: ScriptSendsStore;
  readonly record: (item: DraftSendItem, link: SentDraftLink | null) => void;
  setActive(active: boolean): void;
}

const byServices = new WeakMap<PersonServices, Map<string, StoreEntry>>();
const CONTROL_KINDS: readonly string[] = ["draft_sent", "draft_opened"];

const EMPTY = (docId: string): ScriptSendsState => ({
  docId,
  status: "loading",
  sends: [],
  lastSentLink: null,
});

function createEntry(services: PersonServices, docId: string): StoreEntry {
  const value = createValue<ScriptSendsState>(EMPTY(docId));
  let active = false;
  let epoch = 0;
  let refCount = 0;
  let stopControls: (() => void) | null = null;
  let inFlight = false;
  let queued = false;

  const startControls = (): void => {
    if (stopControls !== null) return;
    let cancelled = false;
    let closeHandle: (() => void) | null = null;
    stopControls = () => {
      cancelled = true;
      closeHandle?.();
      stopControls = null;
    };
    void services.openHandle(docId).then(
      (handle) => {
        if (cancelled) {
          void handle.close();
          return;
        }
        const off = handle.on((event) => {
          if (event.type === "control" && CONTROL_KINDS.includes(event.kind))
            void refresh();
        });
        closeHandle = () => {
          off();
          void handle.close();
        };
      },
      () => {
        // sync may be offline or not yet started
      },
    );
  };

  const stopAllControls = (): void => {
    stopControls?.();
  };

  const refresh = async (): Promise<void> => {
    if (!active) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    const callEpoch = epoch;
    try {
      const answer = await listDraftSends(services.userId, docId);
      if (callEpoch !== epoch || !active) return;
      if (!answer.ok) {
        if (answer.code === "forbidden" || answer.code === "unauthenticated") {
          value.set({
            docId,
            status: "forbidden",
            sends: [],
            lastSentLink: null,
          });
          return;
        }
        const current = value.get();
        value.set({
          ...current,
          status: current.sends.length > 0 ? "ready" : "error",
        });
        return;
      }
      value.set({
        docId,
        status: "ready",
        sends: answer.sends,
        lastSentLink: value.get().lastSentLink,
      });
    } finally {
      inFlight = false;
      if (queued && active) {
        queued = false;
        void refresh();
      }
    }
  };

  const clear = (): void => {
    epoch += 1;
    queued = false;
    value.set({
      docId,
      status: "forbidden",
      sends: [],
      lastSentLink: null,
    });
  };

  const store: ScriptSendsStore = {
    get: () => value.get(),
    subscribe(listener) {
      refCount += 1;
      if (refCount === 1 && active) {
        startControls();
        if (!inFlight) void refresh();
      }
      const unsub = value.subscribe(listener);
      return () => {
        unsub();
        refCount -= 1;
        if (refCount <= 0) {
          refCount = 0;
          stopAllControls();
        }
      };
    },
    refresh,
    clear,
  };

  const record = (item: DraftSendItem, link: SentDraftLink | null): void => {
    const current = value.get();
    const rest = current.sends.filter((entry) => entry.sendId !== item.sendId);
    value.set({
      docId,
      status: "ready",
      sends: [item, ...rest].toSorted((a, b) => b.sentAt - a.sentAt),
      lastSentLink: link,
    });
  };

  const setActive = (next: boolean): void => {
    if (next === active) return;
    active = next;
    if (!active) {
      stopAllControls();
      clear();
      return;
    }
    value.set(EMPTY(docId));
    if (refCount > 0) startControls();
    void refresh();
  };

  return { store, record, setActive };
}

function entryOf(services: PersonServices, docId: string): StoreEntry {
  let map = byServices.get(services);
  if (map === undefined) {
    map = new Map();
    byServices.set(services, map);
  }
  let entry = map.get(docId);
  if (entry === undefined) {
    entry = createEntry(services, docId);
    map.set(docId, entry);
  }
  return entry;
}

/** Per-script store of sent drafts for `docId`, gated cleanly on editor access. */
export function draftSendsOf(
  services: PersonServices,
  docId: string,
): ScriptSendsStore {
  return entryOf(services, docId).store;
}

export function recordSentDraft(
  services: PersonServices,
  docId: string,
  item: DraftSendItem,
  link: SentDraftLink | null,
): void {
  const entry = entryOf(services, docId);
  entry.setActive(true);
  entry.record(item, link);
}

export function clearDraftSends(services: PersonServices, docId: string): void {
  entryOf(services, docId).setActive(false);
}

export function readLastSentDraftLink(
  services: PersonServices,
  docId: string,
): SentDraftLink | null {
  const state = entryOf(services, docId).store.get();
  return state.status === "forbidden" ? null : state.lastSentLink;
}

export function findSendForVersion(
  sends: readonly DraftSendItem[],
  versionId: string,
): DraftSendItem | null {
  return sends.find((send) => send.versionId === versionId) ?? null;
}

/** Subscribes to sent drafts for `docId` while `enabled` is true; non-editors receive nothing (`status: "forbidden"`). */
export function useDraftSends(docId: string, enabled = true): ScriptSendsState {
  const services = useServices();
  const entry = useMemo(() => entryOf(services, docId), [services, docId]);
  useEffect(() => {
    entry.setActive(enabled);
  }, [entry, enabled]);
  return useSubscribable(entry.store);
}
