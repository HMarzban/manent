// A version's content: read from its snapshot, or built from the log at its position, with the
// authors of the newest snapshot before it carried forward.
import {
  ORIGIN_LOAD,
  createDoc,
  loadDoc,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlocksOf } from "@manent/revisions";
import type { DocFile, DocumentRow, VersionRow } from "@manent/storage";
import type {
  VersionAuthor,
  VersionContent,
  VersionPosition,
} from "@manent/sync-protocol";
import { corruptError } from "./chunks.ts";
import { readSnapshot } from "./snapshot.ts";
import { carryAuthors } from "./summaries.ts";

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

/** The content of the newest version at or before `position` that has a snapshot. */
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
  return newest === null ? null : readSnapshot(file, newest.ref);
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
 * authors are those of the newest snapshot before it, for the blocks it holds unchanged.
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
  const [only, ...others] = file.history.summary(version.id)?.authorIds ?? [];
  const userId =
    only !== undefined && others.length === 0 ? only : version.createdByUserId;
  return contentFromLog(
    file,
    docId,
    { generation, seq },
    { userId, at: version.createdAt },
  );
}
