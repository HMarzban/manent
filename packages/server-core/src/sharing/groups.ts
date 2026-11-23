// A project's groups as the server holds them: read from the project's index, for the document a grant or a send names.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  loadDoc,
  readGroups,
} from "@manent/crdt";
import type { CrdtDoc, GroupEntry } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";

/** The id of the index of the project whose home this is; null for a home that is not a project's. */
export function projectIndexOf(home: Home): string | null {
  return home.kind === "project" ? indexDocId("project", home.id) : null;
}

/** The document as its log holds it, without its room; null for one the home's file does not hold. The caller destroys it. */
function committedDoc(
  storage: Storage,
  home: Home,
  docId: string,
): CrdtDoc | null {
  const file = storage.open(home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const tail = file.log.tail(docId, row.generation, checkpoint?.seq ?? 0, {
    quarantine: false,
  });
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  // what waits for a damaged row is its room's to drop, not this copy's
  discardPending(doc);
  return doc;
}

/** The groups of the project the document lives in, by id; none for a document outside a project. */
export function readProjectGroups(
  storage: Storage,
  docId: string,
): Map<string, GroupEntry> {
  const home = storage.directory.placeOf(docId)?.home ?? null;
  const index = home === null ? null : projectIndexOf(home);
  const doc =
    home === null || index === null ? null : committedDoc(storage, home, index);
  if (doc === null) return new Map();
  try {
    return readGroups(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * The groups among `groupIds` that the project the document lives in holds, in the order given, each once; an id the
 * project does not hold is left out.
 */
export function findGroups(
  storage: Storage,
  docId: string,
  groupIds: readonly string[],
): GroupEntry[] {
  const groups = readProjectGroups(storage, docId);
  return [...new Set(groupIds)].flatMap((id) => groups.get(id) ?? []);
}
