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
import { SYSTEM_USER_ID } from "../rebuild/rebuilder.ts";
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

/** Each wanted block by id, the first of an id winning. */
function blocksById(
  blocks: readonly BlockJSON[],
  wanted: ReadonlySet<string>,
): Map<string, BlockJSON> {
  const byId = new Map<string, BlockJSON>();
  for (const block of blocks) {
    const id = idOf(block);
    if (id !== null && wanted.has(id) && !byId.has(id)) byId.set(id, block);
  }
  return byId;
}

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
    const blocks = canonicalBlocksOf(scriptBody(doc).materialize());
    const latest = blocksById(blocks, wanted);
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
      // a rebuild's first row carries the text as it was, written by nobody: a block it holds keeps its author,
      // whom the versions name
      const carried = userId === SYSTEM_USER_ID;
      const written = [
        ...report.inserted.map((entry) => entry.block),
        ...report.changed,
      ];
      for (const block of written) {
        const id = idOf(block);
        if (id === null || !wanted.has(id)) continue;
        const canonical = canonicalBlock(block);
        if (carried) {
          if (!result.changed.has(id)) result.start.set(id, canonical);
        } else {
          result.changed.add(id);
          const previous = latest.get(id) ?? null;
          if (counted)
            result.found.set(id, {
              userId,
              at: createdAt,
              previous,
              exact: true,
            });
        }
        latest.set(id, canonical);
      }
      for (const id of report.removed) {
        latest.delete(id);
        if (carried && !result.changed.has(id)) result.start.delete(id);
      }
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

/** A change made by `version`, from `previous`: by its summary's one author, else its maker. */
function changeBy(
  file: DocFile,
  version: VersionRow,
  previous: BlockJSON | null,
): BlockLastChange {
  const authorIds = file.history.summary(version.id)?.authorIds ?? [];
  const userId = soleAuthor(authorIds, version.createdByUserId);
  return { userId, at: version.createdAt, previous, exact: false };
}

/**
 * The last change by version of each block of `current` (by id, the block as it is now, null
 * when it is gone): the version just newer than the newest one holding the block otherwise.
 * One walk serves every block: a version is read at most once, and only when its summary names
 * a block still unsettled. Past VERSIONS_WALKED versions, or the oldest, the oldest version read
 * for a block names its author. A block neither tells of is left out.
 */
function versionChanges(
  file: DocFile,
  docId: string,
  current: ReadonlyMap<string, BlockJSON | null>,
  since: VersionPosition | null,
): Map<string, BlockLastChange> {
  const found = new Map<string, BlockLastChange>();
  const open = new Map(
    [...current].map(([id, block]) => [id, JSON.stringify(block)]),
  );
  const oldest = new Map<string, VersionContent>();
  const versions = file.history.page(docId, null, VERSIONS_WALKED);
  for (const [index, version] of versions.entries()) {
    if (open.size === 0) return found;
    const position = positionOf(version);
    if (since !== null && position !== null && isAtOrBefore(position, since))
      return found;
    const summary = file.history.summary(version.id);
    const named = new Set(
      summary === null
        ? open.keys()
        : summary.blockIds.filter((id) => open.has(id)),
    );
    const read = named.size > 0 ? readVersion(file, version) : null;
    if (read === null) continue;
    const blocks = blocksById(read.blocks, named);
    const newer = versions[index - 1] ?? null;
    for (const id of named) {
      const block = blocks.get(id) ?? null;
      if (JSON.stringify(block) === open.get(id)) oldest.set(id, read);
      else {
        open.delete(id);
        if (newer !== null) found.set(id, changeBy(file, newer, block));
      }
    }
  }
  if (since !== null) return found;
  for (const id of open.keys()) {
    const authors = oldest.get(id)?.authors ?? {};
    if (!Object.hasOwn(authors, id)) continue;
    const { userId, at } = authors[id]!;
    found.set(id, { userId, at, previous: null, exact: false });
  }
  return found;
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
  const unchanged = [...blockIds].filter((id) => !changed.has(id));
  const current = new Map(unchanged.map((id) => [id, start.get(id) ?? null]));
  for (const [id, change] of versionChanges(file, docId, current, since))
    found.set(id, change);
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
