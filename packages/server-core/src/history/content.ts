// A version's content: read from its snapshot, or built from the log at its position, and who
// last wrote each of its blocks, carried from version to version.
import {
  ORIGIN_LOAD,
  createDoc,
  loadDoc,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlocksOf, idOf } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { DocFile, DocumentRow, VersionRow } from "@manent/storage";
import type {
  LockAnchorRecord,
  VersionAuthor,
  VersionContent,
  VersionPosition,
} from "@manent/sync-protocol";
import { isStorageError } from "../sync/storage-error.ts";
import { corruptError } from "./chunks.ts";
import { readSnapshot } from "./snapshot.ts";

/** The lock table open at a position; null: page numbers were not locked. */
export type LocksAt = (
  file: DocFile,
  docId: string,
  at: VersionPosition,
) => LockAnchorRecord[] | null;

/** The author a version gives each block it changed: its summary's one author, else its maker. */
export function soleAuthor(
  authorIds: readonly string[],
  createdByUserId: string,
): string {
  return authorIds.length === 1 && authorIds[0] !== undefined
    ? authorIds[0]
    : createdByUserId;
}

/**
 * The authors of `blocks` (canonical): `previous`'s author for each block whose canonical content
 * it holds unchanged, and `author` for each block it lacks or holds otherwise. A null `author`
 * leaves those blocks out: who wrote them is not known.
 */
export function carryAuthors(
  previous: VersionContent | null,
  blocks: readonly BlockJSON[],
  author: VersionAuthor | null,
): Record<string, VersionAuthor> {
  const before = new Map<string, string>();
  for (const block of previous?.blocks ?? []) {
    const id = idOf(block);
    if (id !== null && !before.has(id)) before.set(id, JSON.stringify(block));
  }
  const known = previous?.authors ?? {};
  // a Map, then own entries: a block id may be "__proto__"
  const authors = new Map<string, VersionAuthor>();
  for (const block of blocks) {
    const id = idOf(block);
    if (id === null || authors.has(id)) continue;
    const unchanged = before.get(id) === JSON.stringify(block);
    if (unchanged && Object.hasOwn(known, id)) authors.set(id, known[id]!);
    if (!unchanged && author !== null) authors.set(id, author);
  }
  return Object.fromEntries(authors);
}

/** Negative when `a` is before `b` in the document's history. */
const comparePositions = (a: VersionPosition, b: VersionPosition): number =>
  a.generation - b.generation || a.seq - b.seq;

/** `doc`'s content with `row`'s schema and engine versions; `locks` is null, for the caller that knows them to fill. */
export function contentOfDoc(
  doc: CrdtDoc,
  row: DocumentRow,
  authors: Record<string, VersionAuthor>,
): VersionContent {
  return {
    v: 1,
    blocks: canonicalBlocksOf(scriptBody(doc).materialize()),
    settings: scriptSettings(doc).entries(),
    schemaVersion: row.schemaVersion,
    engineVersion: row.engineVersion,
    locks: null,
    authors,
  };
}

/** The last sequence of the generation's log; null when it is unknown or its log was purged. */
function lastSeqOf(
  file: DocFile,
  row: DocumentRow,
  generation: number,
): number | null {
  if (generation === row.generation) return row.headSeq;
  const frozen = file.generations.get(row.id, generation);
  return frozen === null || frozen.finalState === null ? null : frozen.finalSeq;
}

/** The newest checkpoint at or before `position`, then the rows after it up to it; null past the head or once purged. */
function docAt(
  file: DocFile,
  row: DocumentRow,
  position: VersionPosition,
): CrdtDoc | null {
  const { generation, seq } = position;
  const last = lastSeqOf(file, row, generation);
  if (last === null || seq > last) return null;
  const checkpoint = file.checkpoints.atOrBefore(row.id, generation, seq);
  const tail = file.log.tail(row.id, generation, checkpoint?.seq ?? 0, {
    quarantine: false,
  });
  if (tail.corrupt.some((corrupt) => corrupt <= seq)) throw corruptError();
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  for (const { seq: at, update } of tail.rows)
    if (at <= seq) doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

/** The content of the newest version at or before `position` that has a snapshot; null when that one does not read. */
function snapshotBefore(
  file: DocFile,
  docId: string,
  position: VersionPosition,
): VersionContent | null {
  let newest: { ref: string; at: VersionPosition } | null = null;
  for (const { id, generation, seq } of file.versions.list(docId)) {
    if (generation === null || seq === null) continue;
    const at = { generation, seq };
    if (comparePositions(at, position) > 0) continue;
    if (newest !== null && comparePositions(at, newest.at) <= 0) continue;
    const ref = file.history.snapshotOf(id)?.ref;
    if (ref !== undefined) newest = { ref, at };
  }
  if (newest === null) return null;
  try {
    return readSnapshot(file, newest.ref);
  } catch (error) {
    // a damaged earlier snapshot leaves who wrote each block unknown, not this content unread
    if (isStorageError(error) && error.code === "corrupt") return null;
    throw error;
  }
}

function contentFromLog(
  file: DocFile,
  docId: string,
  position: VersionPosition,
  author: VersionAuthor | null,
): VersionContent | null {
  const row = file.log.get(docId);
  if (row === null) return null;
  const doc = docAt(file, row, position);
  if (doc === null) return null;
  try {
    const content = contentOfDoc(doc, row, {});
    const previous = snapshotBefore(file, docId, position);
    return {
      ...content,
      authors: carryAuthors(previous, content.blocks, author),
    };
  } finally {
    doc.destroy();
  }
}

/**
 * The document at `position`; null past the head, or once that generation's log is purged. Its
 * authors are those of the newest snapshot before it, for the blocks it holds unchanged; none
 * when that snapshot does not read.
 * Throws StorageError("corrupt") (`corruptError`) for a row in reach that does not verify.
 */
export function contentAt(
  file: DocFile,
  docId: string,
  position: VersionPosition,
): VersionContent | null {
  return contentFromLog(file, docId, position, null);
}

/**
 * A snapshot version from its chunks; a log version from its position, each block it changed
 * written by its summary's one author, else by its maker, at its time. Null for a version that
 * has neither, or whose position `contentAt` cannot reach.
 */
export function materializeVersion(
  file: DocFile,
  version: VersionRow,
): VersionContent | null {
  const snapshot = file.history.snapshotOf(version.id);
  if (snapshot !== null) return readSnapshot(file, snapshot.ref);
  const { docId, generation, seq } = version;
  if (generation === null || seq === null) return null;
  const authorIds = file.history.summary(version.id)?.authorIds ?? [];
  const userId = soleAuthor(authorIds, version.createdByUserId);
  return contentFromLog(
    file,
    docId,
    { generation, seq },
    { userId, at: version.createdAt },
  );
}

/** A version's content as it is opened: a log version's locks are those open at its position. */
export function openVersion(
  file: DocFile,
  version: VersionRow,
  locksAt: LocksAt,
): VersionContent | null {
  const content = materializeVersion(file, version);
  const { docId, generation, seq } = version;
  if (content === null || generation === null || seq === null) return content;
  if (file.history.snapshotOf(version.id) !== null) return content;
  return { ...content, locks: locksAt(file, docId, { generation, seq }) };
}

/**
 * What a device's version is kept as: its blocks, canonical, with the document's settings and
 * engine version and the locks open now, and the schema version it was written with. Its authors
 * are carried when it is recorded. Null for a document the file does not hold.
 */
export function uploadedContent(
  file: DocFile,
  docId: string,
  uploaded: { content: DocJSON; schemaVersion: number },
  locksAt: LocksAt,
): VersionContent | null {
  const row = file.log.get(docId);
  if (row === null) return null;
  const head = { generation: row.generation, seq: row.headSeq };
  return {
    v: 1,
    blocks: canonicalBlocksOf(uploaded.content),
    settings: contentAt(file, docId, head)?.settings ?? {},
    schemaVersion: uploaded.schemaVersion,
    engineVersion: row.engineVersion,
    locks: locksAt(file, docId, head),
    authors: {},
  };
}
