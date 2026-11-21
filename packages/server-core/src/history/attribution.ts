// Who changed a block and when: exactly from the log after the newest checkpoint, and by version
// before it; and what other people changed since a position.
import {
  ORIGIN_LOAD,
  applyInspecting,
  createDoc,
  loadDoc,
  scriptBody,
} from "@manent/crdt";
import { canonicalBlocksOf, compareDocs, idOf } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { DocFile, DocumentRow, VersionRow } from "@manent/storage";
import type {
  AuthorsRequest,
  AuthorsResponse,
  HttpErrorCode,
  SinceResponse,
  VersionContent,
  VersionPosition,
  WhoWroteResponse,
} from "@manent/sync-protocol";
import { isStorageError } from "../sync/storage-error.ts";
import { corruptError } from "./chunks.ts";
import { contentAt, materializeVersion, soleAuthor } from "./content.ts";
import type { HistoryOutcome } from "./service.ts";
import { positionOf } from "./summaries.ts";

/** How far back attribution by version looks before it answers from the oldest version it read. */
const VERSIONS_WALKED = 50;

/** A block's last change: `previous` is the block before it, null when the change made it. */
export interface BlockLastChange {
  userId: string;
  at: number;
  previous: BlockJSON | null;
  /** Read from the log, per change, rather than known only by version. */
  exact: boolean;
}

export interface Attribution {
  whoWrote(
    userId: string,
    docId: string,
    blockId: string,
  ): Promise<HistoryOutcome<WhoWroteResponse>>;
  since(
    userId: string,
    docId: string,
    position: VersionPosition,
  ): Promise<HistoryOutcome<SinceResponse>>;
  authors(
    userId: string,
    body: AuthorsRequest,
  ): Promise<HistoryOutcome<AuthorsResponse>>;
}

const docOf = (blocks: readonly BlockJSON[]): DocJSON => ({
  type: "doc",
  content: [{ type: "section", content: [...blocks] }],
});

const textOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

/** True when `at` is `since` or before it in the document's history. */
const isAtOrBefore = (at: VersionPosition, since: VersionPosition): boolean =>
  at.generation < since.generation ||
  (at.generation === since.generation && at.seq <= since.seq);

/** What the log after the newest checkpoint tells of the wanted blocks. */
interface Tail {
  /** The last change of each block after `since`. */
  found: Map<string, BlockLastChange>;
  /** Every block the tail changed, after `since` or not. */
  changed: Set<string>;
  /** Each wanted block as it was at the tail's start, canonical. */
  start: Map<string, BlockJSON>;
}

function readTail(
  file: DocFile,
  row: DocumentRow,
  wanted: ReadonlySet<string>,
  since: VersionPosition | null,
): Tail {
  const { id: docId, generation } = row;
  const checkpoint = file.checkpoints.newest(docId, generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  try {
    const tail = file.log.tail(docId, generation, checkpoint?.seq ?? 0, {
      quarantine: false,
    });
    if (tail.corrupt.length > 0) throw corruptError();
    const latest = new Map<string, BlockJSON>();
    for (const block of canonicalBlocksOf(scriptBody(doc).materialize())) {
      const id = idOf(block);
      if (id !== null && wanted.has(id) && !latest.has(id))
        latest.set(id, block);
    }
    const result: Tail = {
      found: new Map(),
      changed: new Set(),
      start: new Map(latest),
    };
    for (const { seq, update, userId, createdAt } of tail.rows) {
      const report = applyInspecting(doc, update, ORIGIN_LOAD);
      if (report === null) continue;
      const counted =
        since === null || !isAtOrBefore({ generation, seq }, since);
      const written = [
        ...report.inserted.map((entry) => entry.block),
        ...report.changed,
      ];
      for (const block of written) {
        const id = idOf(block);
        if (id === null || !wanted.has(id)) continue;
        result.changed.add(id);
        const previous = latest.get(id) ?? null;
        if (counted)
          result.found.set(id, {
            userId,
            at: createdAt,
            previous,
            exact: true,
          });
        latest.set(id, canonicalBlock(block));
      }
      for (const id of report.removed) latest.delete(id);
    }
    return result;
  } finally {
    doc.destroy();
  }
}

/** The version's content; null when it has none any more, or it does not read. */
function readVersion(
  file: DocFile,
  version: VersionRow,
): VersionContent | null {
  try {
    return materializeVersion(file, version);
  } catch (error) {
    if (isStorageError(error) && error.code === "corrupt") return null;
    throw error;
  }
}

/**
 * The block's last change by version: the version just newer than the newest one holding the
 * block otherwise than `current`. Only versions whose summary names the block are read. Past
 * VERSIONS_WALKED versions, or the oldest, the oldest one read names the block's author.
 */
function versionChange(
  file: DocFile,
  docId: string,
  blockId: string,
  current: BlockJSON | null,
  since: VersionPosition | null,
): BlockLastChange | null {
  const now = JSON.stringify(current);
  let newer: VersionRow | null = null;
  let oldest: VersionContent | null = null;
  for (const version of file.history.page(docId, null, VERSIONS_WALKED)) {
    const position = positionOf(version);
    if (since !== null && position !== null && isAtOrBefore(position, since))
      return null;
    const summary = file.history.summary(version.id);
    const read =
      summary === null || summary.blockIds.includes(blockId)
        ? readVersion(file, version)
        : null;
    const block = read?.blocks.find((b) => idOf(b) === blockId) ?? null;
    if (read !== null && JSON.stringify(block) !== now) {
      if (newer === null) return null;
      const authorIds = file.history.summary(newer.id)?.authorIds ?? [];
      const userId = soleAuthor(authorIds, newer.createdByUserId);
      return { userId, at: newer.createdAt, previous: block, exact: false };
    }
    oldest = read ?? oldest;
    newer = version;
  }
  const authors = oldest?.authors ?? {};
  if (since !== null || !Object.hasOwn(authors, blockId)) return null;
  const { userId, at } = authors[blockId]!;
  return { userId, at, previous: null, exact: false };
}

/**
 * By block id, the last change after `since` (null: ever) of each block of `blockIds`: read
 * exactly from the log after the current generation's newest checkpoint, and for a block that
 * log never changed, by version. A block neither tells of is left out.
 * Throws StorageError("corrupt") (`corruptError`) for a log row after the checkpoint that does not verify.
 */
export function lastChanges(
  file: DocFile,
  docId: string,
  blockIds: ReadonlySet<string>,
  since: VersionPosition | null,
): Map<string, BlockLastChange> {
  const row = file.log.get(docId);
  if (row === null) return new Map();
  const { found, changed, start } = readTail(file, row, blockIds, since);
  for (const id of blockIds) {
    if (changed.has(id)) continue;
    const change = versionChange(file, docId, id, start.get(id) ?? null, since);
    if (change !== null) found.set(id, change);
  }
  return found;
}

/** The blocks other people than `userId` changed after `position`, and who they are, ascending. */
function changedSince(
  file: DocFile,
  docId: string,
  userId: string,
  position: VersionPosition,
): SinceResponse | null {
  const row = file.log.get(docId);
  const then = contentAt(file, docId, position);
  if (row === null || then === null) return null;
  const head = contentAt(file, docId, {
    generation: row.generation,
    seq: row.headSeq,
  });
  const ids = compareDocs(docOf(then.blocks), docOf(head?.blocks ?? []))
    .entries.filter((entry) => entry.kind !== "unchanged" || entry.moved)
    .map((entry) => entry.id);
  const others = [...lastChanges(file, docId, new Set(ids), position).values()]
    .map((change) => change.userId)
    .filter((author) => author !== userId);
  return {
    changes: others.length,
    authorUserIds: [...new Set(others)].toSorted(),
  };
}

export function createAttribution(options: {
  /** The placed document's file, if `userId` may read it. */
  authorize(
    userId: string,
    docId: string,
    need: "read",
  ): { ok: true; file: DocFile } | { ok: false; code: HttpErrorCode };
}): Attribution {
  const notFound = { ok: false, code: "not_found" } as const;
  return {
    async whoWrote(userId, docId, blockId) {
      const access = options.authorize(userId, docId, "read");
      if (!access.ok) return access;
      const wanted = new Set([blockId]);
      const change = lastChanges(access.file, docId, wanted, null).get(blockId);
      if (change === undefined) return notFound;
      const previous =
        change.previous === null ? null : textOf(change.previous);
      return { ok: true, value: { ...change, previous } };
    },
    async since(userId, docId, position) {
      const access = options.authorize(userId, docId, "read");
      if (!access.ok) return access;
      const answer = changedSince(access.file, docId, userId, position);
      return answer === null ? notFound : { ok: true, value: answer };
    },
    async authors(userId, { docId, since, blockIds }) {
      const access = options.authorize(userId, docId, "read");
      if (!access.ok) return access;
      const { file } = access;
      let from: VersionPosition | null;
      if ("versionId" in since) {
        const version = file.history.get(since.versionId);
        if (version?.docId !== docId) return notFound;
        from = positionOf(version);
      } else from = since.position;
      const changes = lastChanges(file, docId, new Set(blockIds), from);
      const authors = [...changes].map(([id, change]) => [id, change.userId]);
      return { ok: true, value: { authors: Object.fromEntries(authors) } };
    },
  };
}
