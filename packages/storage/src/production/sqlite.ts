// The production tables of one document file: the store over its connection, and the checks on what it reads back.
import type { Database } from "bun:sqlite";
import { StorageError } from "../ports.ts";
import { readStrings } from "../sqlite/directory.ts";
import { transact } from "../sqlite/files.ts";
import type {
  AnchorRow,
  IssueRow,
  ProductionRow,
  ProductionStore,
  RequestRow,
  RevisionSetRow,
  SceneNumberRow,
  SetBlockRow,
} from "./ports.ts";

type SetPatch = Parameters<ProductionStore["updateSet"]>[1];

// The column each patchable field of a revision is stored in; a field added to the row fails typecheck here.
const SET_COLUMNS = {
  name: "name",
  colour: "color",
  mark: "mark",
  baselineVersionId: "baseline_version_id",
  issuedVersionId: "issued_version_id",
  issuedAt: "issued_at",
  issuedOn: "issued_on",
  issuedByUserId: "issued_by",
  recalledAt: "recalled_at",
  fullDraft: "is_full_draft",
  startedAt: "started_at",
  engineVersion: "engine_version",
} satisfies Record<keyof SetPatch, string>;

const isSetField = (field: string): field is keyof SetPatch =>
  Object.hasOwn(SET_COLUMNS, field);

const ISSUE_KINDS = {
  issue: true,
  correction: true,
} satisfies Record<IssueRow["kind"], true>;

const isIssueKind = (kind: string): kind is IssueRow["kind"] =>
  Object.hasOwn(ISSUE_KINDS, kind);

const isOffset = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isPair = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(isOffset);

/** Stored `{ inserted, deletedAt }` of UTF-16 offsets; StorageError("corrupt") for anything else. */
function readRanges(text: string): Pick<SetBlockRow, "inserted" | "deletedAt"> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new StorageError("corrupt", { cause: error });
  }
  if (typeof value !== "object" || value === null)
    throw new StorageError("corrupt");
  const inserted = "inserted" in value ? value.inserted : null;
  const deletedAt = "deletedAt" in value ? value.deletedAt : null;
  if (
    Array.isArray(inserted) &&
    inserted.every(isPair) &&
    Array.isArray(deletedAt) &&
    deletedAt.every(isOffset)
  )
    return { inserted, deletedAt };
  throw new StorageError("corrupt");
}

type StoredAnchor = Omit<AnchorRow, "fallbackIds"> & { fallbackIds: string };
type OpenedAnchor = StoredAnchor & {
  docId: string;
  fromGeneration: number;
  fromSeq: number;
};
type StoredRange = StoredAnchor & {
  fromGeneration: number;
  fromSeq: number;
  toGeneration: number | null;
  toSeq: number | null;
};

const ANCHOR = `lock_level AS level, page_order AS "order", label, block_id AS blockId, "offset", quote,
  fallback_ids AS fallbackIds, source`;

function prepareAnchors(db: Database) {
  return {
    open: db.query<StoredAnchor, [string]>(
      `SELECT ${ANCHOR} FROM page_locks WHERE doc_id = ?1 AND to_seq IS NULL ORDER BY lock_level, page_order`,
    ),
    // a row holds a position from its start up to, not including, its end, across generations
    at: db.query<StoredAnchor, [string, number, number]>(
      `SELECT ${ANCHOR} FROM page_locks WHERE doc_id = ?1 AND (from_generation, from_seq) <= (?2, ?3)
       AND (to_seq IS NULL OR (?2, ?3) < (to_generation, to_seq)) ORDER BY lock_level, page_order`,
    ),
    history: db.query<StoredRange, [string]>(
      `SELECT ${ANCHOR}, from_generation AS fromGeneration, from_seq AS fromSeq, to_generation AS toGeneration,
       to_seq AS toSeq FROM page_locks WHERE doc_id = ?1 ORDER BY from_generation, from_seq, lock_level, page_order`,
    ),
    // a table opened at the position it is replaced at never held one
    dropOpenedAt: db.query<never, [string, number, number]>(
      "DELETE FROM page_locks WHERE doc_id = ?1 AND to_seq IS NULL AND from_generation = ?2 AND from_seq = ?3",
    ),
    close: db.query<never, [string, number, number]>(
      "UPDATE page_locks SET to_generation = ?2, to_seq = ?3 WHERE doc_id = ?1 AND to_seq IS NULL",
    ),
    insert: db.query<never, OpenedAnchor>(
      `INSERT INTO page_locks (doc_id, lock_level, page_order, label, block_id, "offset", quote, fallback_ids, source,
       from_generation, from_seq) VALUES ($docId, $level, $order, $label, $blockId, $offset, $quote, $fallbackIds, $source,
       $fromGeneration, $fromSeq)`,
    ),
  };
}

type StoredSet = Omit<RevisionSetRow, "fullDraft"> & { fullDraft: number };
type StoredBlock = Omit<SetBlockRow, "inserted" | "deletedAt"> & {
  ranges: string;
};
type StoredIssue = Omit<
  IssueRow,
  "kind" | "recipientUserIds" | "pages" | "files" | "tint"
> & {
  kind: string;
  recipientUserIds: string;
  pages: string;
  files: string;
  tint: number;
};

function prepareRevisions(db: Database) {
  return {
    sets: db.query<StoredSet, [string]>(
      `SELECT id, doc_id AS docId, ordinal, name, color AS colour, mark, baseline_version_id AS baselineVersionId,
       issued_version_id AS issuedVersionId, issued_at AS issuedAt, issued_on AS issuedOn, issued_by AS issuedByUserId,
       recalled_at AS recalledAt, is_full_draft AS fullDraft, started_at AS startedAt, engine_version AS engineVersion
       FROM revision_sets WHERE doc_id = ?1 ORDER BY ordinal`,
    ),
    addSet: db.query<never, StoredSet>(
      `INSERT INTO revision_sets (id, doc_id, ordinal, name, color, mark, baseline_version_id, issued_version_id, issued_at,
       issued_on, issued_by, recalled_at, is_full_draft, started_at, engine_version)
       VALUES ($id, $docId, $ordinal, $name, $colour, $mark, $baselineVersionId, $issuedVersionId, $issuedAt,
       $issuedOn, $issuedByUserId, $recalledAt, $fullDraft, $startedAt, $engineVersion)`,
    ),
    blocks: db.query<StoredBlock, [string]>(
      `SELECT set_id AS setId, block_id AS blockId, page_label AS pageLabel, change, hash, ranges
       FROM revision_set_blocks WHERE set_id = ?1 ORDER BY block_id`,
    ),
    dropBlocks: db.query<never, [string]>(
      "DELETE FROM revision_set_blocks WHERE set_id = ?1",
    ),
    putBlock: db.query<never, StoredBlock>(
      `INSERT INTO revision_set_blocks (set_id, block_id, page_label, change, hash, ranges)
       VALUES ($setId, $blockId, $pageLabel, $change, $hash, $ranges)`,
    ),
    issues: db.query<StoredIssue, [string]>(
      `SELECT id, doc_id AS docId, set_id AS setId, kind, version_id AS versionId, issued_by AS issuedByUserId,
       issued_at AS issuedAt, issued_on AS issuedOn, recipients AS recipientUserIds, pages, memo, files, tint, what
       FROM revision_issues WHERE doc_id = ?1 ORDER BY issued_at DESC, rowid DESC`,
    ),
    addIssue: db.query<never, StoredIssue>(
      `INSERT INTO revision_issues (id, doc_id, set_id, kind, version_id, issued_by, issued_at, issued_on, recipients, pages,
       memo, files, tint, what) VALUES ($id, $docId, $setId, $kind, $versionId, $issuedByUserId, $issuedAt, $issuedOn,
       $recipientUserIds, $pages, $memo, $files, $tint, $what)`,
    ),
  };
}

type StoredProduction = Omit<ProductionRow, "colourOrder"> & {
  colourOrder: string;
};
type StoredNumber = Omit<SceneNumberRow, "reserved"> & { reserved: number };

function prepareRest(db: Database) {
  return {
    get: db.query<StoredProduction, [string]>(
      `SELECT doc_id AS docId, numbering, colour_order AS colourOrder, locked_at AS lockedAt, locked_on AS lockedOn,
       locked_by AS lockedByUserId, ended_at AS endedAt FROM production WHERE doc_id = ?1`,
    ),
    put: db.query<never, StoredProduction>(
      `INSERT INTO production (doc_id, numbering, colour_order, locked_at, locked_on, locked_by, ended_at)
       VALUES ($docId, $numbering, $colourOrder, $lockedAt, $lockedOn, $lockedByUserId, $endedAt) ON CONFLICT (doc_id) DO UPDATE SET numbering = excluded.numbering,
       colour_order = excluded.colour_order, locked_at = excluded.locked_at, locked_on = excluded.locked_on,
       locked_by = excluded.locked_by, ended_at = excluded.ended_at`,
    ),
    setLocked: db.query<never, [string, number]>(
      "UPDATE documents SET locked = ?2 WHERE id = ?1",
    ),
    numbers: db.query<StoredNumber, [string]>(
      "SELECT block_id AS blockId, num, reserved FROM issued_scene_numbers WHERE doc_id = ?1 ORDER BY block_id",
    ),
    putNumber: db.query<never, [string, string, string, number]>(
      `INSERT INTO issued_scene_numbers (doc_id, block_id, num, reserved) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (doc_id, block_id) DO UPDATE SET num = excluded.num, reserved = excluded.reserved`,
    ),
    clearNumbers: db.query<never, [string]>(
      "DELETE FROM issued_scene_numbers WHERE doc_id = ?1",
    ),
    request: db.query<RequestRow, [string, string]>(
      `SELECT doc_id AS docId, request_key AS "key", user_id AS userId, status, result, created_at AS createdAt
       FROM production_requests WHERE doc_id = ?1 AND request_key = ?2`,
    ),
    putRequest: db.query<
      never,
      [string, string, string, number, string, number]
    >(
      `INSERT INTO production_requests (doc_id, request_key, user_id, status, result, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (doc_id, request_key) DO NOTHING`,
    ),
  };
}

type Statements = ReturnType<typeof prepareAnchors> &
  ReturnType<typeof prepareRevisions> &
  ReturnType<typeof prepareRest>;

const readAnchor = <T extends StoredAnchor>({ fallbackIds, ...row }: T) => ({
  ...row,
  fallbackIds: readStrings(fallbackIds),
});

function readIssue(row: StoredIssue): IssueRow {
  const { kind, recipientUserIds, pages, files, tint } = row;
  if (!isIssueKind(kind)) throw new StorageError("corrupt");
  return {
    ...row,
    kind,
    recipientUserIds: readStrings(recipientUserIds),
    pages: readStrings(pages),
    files: readStrings(files),
    tint: tint === 1,
  };
}

// Closes the open table at `at` and opens `rows` from it, inside the caller's transaction.
function replaceAnchors(
  sql: Statements,
  docId: string,
  rows: readonly AnchorRow[],
  at: { generation: number; seq: number },
): void {
  const { generation, seq } = at;
  sql.dropOpenedAt.run(docId, generation, seq);
  sql.close.run(docId, generation, seq);
  for (const r of rows)
    sql.insert.run({
      ...r,
      docId,
      fallbackIds: JSON.stringify(r.fallbackIds),
      fromGeneration: generation,
      fromSeq: seq,
    });
}

function updateSet(db: Database, setId: string, patch: SetPatch): void {
  for (const [field, value] of Object.entries(patch)) {
    if (!isSetField(field) || value === undefined) continue;
    const stored = typeof value === "boolean" ? Number(value) : value;
    db.query<never, [string, string | number | null]>(
      `UPDATE revision_sets SET ${SET_COLUMNS[field]} = ?2 WHERE id = ?1`,
    ).run(setId, stored);
  }
}

/** The production tables of the document file `db`. */
export function createSqliteProduction(db: Database): ProductionStore {
  const sql: Statements = {
    ...prepareAnchors(db),
    ...prepareRevisions(db),
    ...prepareRest(db),
  };
  const write = (fn: () => void) => transact(db, fn);
  return {
    get(docId) {
      const row = sql.get.get(docId);
      return row === null
        ? null
        : { ...row, colourOrder: readStrings(row.colourOrder) };
    },
    put: (r) =>
      write(() =>
        sql.put.run({ ...r, colourOrder: JSON.stringify(r.colourOrder) }),
      ),
    setLocked: (docId, locked) =>
      write(() => sql.setLocked.run(docId, Number(locked))),
    anchors: (docId) => sql.open.all(docId).map(readAnchor),
    anchorsAt: (docId, at) =>
      sql.at.all(docId, at.generation, at.seq).map(readAnchor),
    replaceAnchors: (docId, rows, at) =>
      write(() => replaceAnchors(sql, docId, rows, at)),
    anchorHistory: (docId) => sql.history.all(docId).map(readAnchor),
    sets: (docId) =>
      sql.sets
        .all(docId)
        .map((row) => ({ ...row, fullDraft: row.fullDraft === 1 })),
    addSet: (r) =>
      write(() => sql.addSet.run({ ...r, fullDraft: Number(r.fullDraft) })),
    updateSet: (setId, patch) => write(() => updateSet(db, setId, patch)),
    setBlocks: (setId) =>
      sql.blocks
        .all(setId)
        .map(({ ranges, ...row }) => ({ ...row, ...readRanges(ranges) })),
    putSetBlocks: (setId, rows) =>
      write(() => {
        sql.dropBlocks.run(setId);
        for (const r of rows)
          sql.putBlock.run({
            setId,
            blockId: r.blockId,
            pageLabel: r.pageLabel,
            change: r.change,
            hash: r.hash,
            ranges: JSON.stringify({
              inserted: r.inserted,
              deletedAt: r.deletedAt,
            }),
          });
      }),
    issues: (docId) => sql.issues.all(docId).map(readIssue),
    addIssue: (r) =>
      write(() =>
        sql.addIssue.run({
          ...r,
          recipientUserIds: JSON.stringify(r.recipientUserIds),
          pages: JSON.stringify(r.pages),
          files: JSON.stringify(r.files),
          tint: Number(r.tint),
        }),
      ),
    sceneNumbers: (docId) =>
      sql.numbers
        .all(docId)
        .map((row) => ({ ...row, reserved: row.reserved === 1 })),
    putSceneNumbers: (docId, rows) =>
      write(() => {
        for (const r of rows)
          sql.putNumber.run(docId, r.blockId, r.num, Number(r.reserved));
      }),
    clearSceneNumbers: (docId) => write(() => sql.clearNumbers.run(docId)),
    request: (docId, key) => sql.request.get(docId, key),
    putRequest: (r) =>
      write(() => {
        const { docId, key, userId, status, result, createdAt } = r;
        const written = sql.putRequest.run(
          docId,
          key,
          userId,
          status,
          result,
          createdAt,
        );
        if (written.changes === 0)
          throw new RangeError(
            `production request key ${r.key} is already stored`,
          );
      }),
  };
}
