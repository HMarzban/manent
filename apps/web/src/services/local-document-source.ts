// The documents of this tab until sync supplies them: each held in memory, never synced, and editable by everyone.
import { createMemoryBag } from "@manent/settings";
import { createValue } from "@manent/ui";
import { materialActions } from "../state/material.store.ts";
import type { DocumentServices, DocumentSource } from "./ports.ts";

/** Every person is an editor of every document here, until sync supplies roles; a document's script settings last for this session. */
export function createLocalDocumentSource(options: {
  now: () => number;
  shell: "web" | "desktop";
}): DocumentSource {
  const documents = new Map<string, DocumentServices>();
  const create = (): DocumentServices => ({
    status: createValue({
      access: "edit",
      device: "ok",
      network: "online",
      server: "synced",
      waiting: 0,
      notSent: 0,
      offlineSinceAt: null,
      neverSynced: true,
      shell: options.shell,
      toReview: 0,
      now: options.now(),
    }),
    waitingByScene: createValue([]),
    stateFacts: createValue([]),
    scriptBag: createMemoryBag({ initial: {}, writable: () => true }),
    people: createValue([]),
    material: materialActions,
  });
  return {
    open(docId) {
      const existing = documents.get(docId);
      if (existing !== undefined) return existing;
      const opened = create();
      documents.set(docId, opened);
      return opened;
    },
    // memory is the only copy: a closed document keeps its script settings until the tab goes
    close() {},
  };
}
