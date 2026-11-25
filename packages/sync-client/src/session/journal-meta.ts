// Initial metadata and server entry helpers for a document journal.
import type { DocMeta, StoredEntry } from "../ports/ports.ts";

export function freshMeta(docId: string, create: DocMeta["create"]): DocMeta {
  return {
    docId,
    generation: 0,
    lastServerSeq: 0,
    clientIds: [],
    ackedClocks: {},
    neverSynced: true,
    create,
    parked: null,
    recovering: null,
    lastDeviceVersionAt: 0,
    lastSyncedAt: null,
    moving: null,
  };
}

export function serverEntry(
  localSeq: number,
  update: Uint8Array,
  applied: boolean,
): StoredEntry {
  return {
    kind: "update",
    localSeq,
    update,
    own: false,
    acked: true,
    applied,
    elements: [],
  };
}
