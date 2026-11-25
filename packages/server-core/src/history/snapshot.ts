// A version stored as its content: a manifest naming its scene chunks (and optional rundown chunk),
// read back only when every chunk verifies, and the chunks that remaining manifests still name.
import { STORED_RUNDOWN_COLUMNS, sortRundownRows } from "@manent/revisions";
import { ROW_KINDS, RUNDOWN_COLUMN_IDS, canonicalBlock } from "@manent/schema";
import type {
  BlockJSON,
  MarkJSON,
  PrompterStateJSON,
  RowKind,
  RundownCellJSON,
  RundownColumnId,
  RundownFieldsJSON,
  RundownJSON,
  RundownRowJSON,
  TextJSON,
} from "@manent/schema";
import type { DocFile } from "@manent/storage";
import { LOCK_SOURCES } from "@manent/sync-protocol";
import type {
  LockAnchorRecord,
  LockSource,
  VersionAuthor,
  VersionContent,
} from "@manent/sync-protocol";
import { readChunk, sceneChunks, writeChunk } from "./chunks.ts";

/** What the manifest holds besides the chunk hashes. */
type Manifest = Omit<VersionContent, "blocks" | "rundown"> & {
  chunks: string[];
  rundownChunk?: string;
};

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isCount = (value: unknown): value is number =>
  isSafeInt(value) && value >= 0;

/** `value`'s entries with the keys ascending, so one content has one manifest. */
function sortedKeys<T>(value: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : 1)),
  );
}

// records and authors are rebuilt with their keys in declared order, for the same reason
const lockRecord = (a: LockAnchorRecord): LockAnchorRecord => ({
  level: a.level,
  order: a.order,
  label: a.label,
  blockId: a.blockId,
  offset: a.offset,
  quote: a.quote,
  fallbackIds: [...a.fallbackIds],
  source: a.source,
});

function canonicalCell(cell: RundownCellJSON): RundownCellJSON {
  return {
    value: cell.value,
    userId: cell.userId,
    setAt: cell.setAt,
    previous:
      cell.previous === null
        ? null
        : {
            value: cell.previous.value,
            userId: cell.previous.userId,
            setAt: cell.previous.setAt,
          },
  };
}

function canonicalRundown(rundown: RundownJSON): RundownJSON {
  const fields: RundownFieldsJSON = {
    airDate: rundown.rundown.airDate,
    airAt: rundown.rundown.airAt,
    windowLeadMs: rundown.rundown.windowLeadMs,
    targetMs: rundown.rundown.targetMs,
  };
  const rows: RundownRowJSON[] = sortRundownRows(rundown.rows).map((row) => {
    const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
    for (const col of STORED_RUNDOWN_COLUMNS) {
      const cell = row.cells[col];
      if (cell !== undefined) cells[col] = canonicalCell(cell);
    }
    const prompter: PrompterStateJSON | null =
      row.prompter === null
        ? null
        : {
            state: row.prompter.state,
            versionId: row.prompter.versionId,
            sentAt: row.prompter.sentAt,
            sentByUserId: row.prompter.sentByUserId,
          };
    return {
      id: row.id,
      order: row.order,
      kind: row.kind,
      cells,
      docId: row.docId,
      blockId: row.blockId,
      durationMs: row.durationMs,
      prompter,
      unnumbered: row.unnumbered,
    };
  });
  return { rundown: fields, columns: [...rundown.columns], rows };
}

/** Stores `content` as chunks and returns its manifest's hash, in lower-case hex. Writes inside the caller's transaction, if any. */
export function writeSnapshot(file: DocFile, content: VersionContent): string {
  const blocks = content.blocks.map(canonicalBlock);
  const chunks = sceneChunks(blocks).map((chunk) =>
    writeChunk(file, { blocks: chunk }),
  );
  const base: Manifest = {
    v: 1,
    chunks,
    settings: sortedKeys(content.settings),
    schemaVersion: content.schemaVersion,
    engineVersion: content.engineVersion,
    locks: content.locks?.map(lockRecord) ?? null,
    authors: sortedKeys(
      Object.fromEntries(
        Object.entries(content.authors).map(([id, { userId, at }]) => [
          id,
          { userId, at },
        ]),
      ),
    ),
  };
  const manifest: Manifest =
    content.rundown === undefined
      ? base
      : {
          ...base,
          rundownChunk: writeChunk(file, {
            rundown: canonicalRundown(content.rundown),
          }),
        };
  return writeChunk(file, manifest);
}

function readMark(value: unknown): MarkJSON | null {
  if (!isFields(value) || !isString(value.type)) return null;
  if (value.attrs === undefined) return { type: value.type };
  return isFields(value.attrs)
    ? { type: value.type, attrs: value.attrs }
    : null;
}

function readRun(value: unknown): TextJSON | null {
  if (!isFields(value) || value.type !== "text" || !isString(value.text))
    return null;
  if (value.marks === undefined) return { type: "text", text: value.text };
  const marks = readEach(value.marks, readMark);
  return marks === null ? null : { type: "text", text: value.text, marks };
}

function readBlock(value: unknown): BlockJSON | null {
  if (!isFields(value) || value.type !== "block") return null;
  if (value.attrs !== undefined && !isFields(value.attrs)) return null;
  const block: BlockJSON = isFields(value.attrs)
    ? { type: "block", attrs: value.attrs }
    : { type: "block" };
  if (value.content === undefined) return block;
  const content = readEach(value.content, readRun);
  return content === null ? null : { ...block, content };
}

/** Null unless `value` is an array whose every item `read` accepts. */
export function readEach<T>(
  value: unknown,
  read: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const raw of value) {
    const item = read(raw);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

const isLockSource = (value: unknown): value is LockSource =>
  LOCK_SOURCES.some((source) => source === value);

const isRowKind = (value: unknown): value is RowKind =>
  ROW_KINDS.some((kind) => kind === value);

const isColumnId = (value: unknown): value is RundownColumnId =>
  RUNDOWN_COLUMN_IDS.some((col) => col === value);

const isStoredCol = (value: unknown): value is RundownColumnId =>
  STORED_RUNDOWN_COLUMNS.some((col) => col === value);

const isCellVal = (value: unknown): value is string | number | null =>
  value === null ||
  typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value));

function readCellEntry(
  value: unknown,
): { value: string | number | null; userId: string; setAt: number } | null {
  if (!isFields(value)) return null;
  if (
    !isCellVal(value.value) ||
    !isString(value.userId) ||
    !isSafeInt(value.setAt)
  )
    return null;
  return { value: value.value, userId: value.userId, setAt: value.setAt };
}

function readRundownCell(value: unknown): RundownCellJSON | null {
  const base = readCellEntry(value);
  if (base === null || !isFields(value)) return null;
  if (value.previous === null) return { ...base, previous: null };
  const previous = readCellEntry(value.previous);
  return previous === null ? null : { ...base, previous };
}

function readPrompter(value: unknown): PrompterStateJSON | null {
  if (!isFields(value)) return null;
  const { state, versionId, sentAt, sentByUserId } = value;
  if (state !== "on" && state !== "changed") return null;
  if (versionId !== null && !isString(versionId)) return null;
  if (!isSafeInt(sentAt)) return null;
  if (sentByUserId !== null && !isString(sentByUserId)) return null;
  return { state, versionId, sentAt, sentByUserId };
}

function readRundownRow(value: unknown): RundownRowJSON | null {
  if (!isFields(value)) return null;
  const { id, order, kind, docId, blockId, durationMs, unnumbered } = value;
  if (!isString(id) || !isString(order) || !isRowKind(kind)) return null;
  if (docId !== null && !isString(docId)) return null;
  if (blockId !== null && !isString(blockId)) return null;
  if (durationMs !== null && !isCount(durationMs)) return null;
  if (typeof unnumbered !== "boolean" || !isFields(value.cells)) return null;
  const prompter =
    value.prompter === null ? null : readPrompter(value.prompter);
  if (prompter === null && value.prompter !== null) return null;
  const cells: Partial<Record<RundownColumnId, RundownCellJSON>> = {};
  for (const [col, raw] of Object.entries(value.cells)) {
    if (!isStoredCol(col)) return null;
    const cell = readRundownCell(raw);
    if (cell === null) return null;
    cells[col] = cell;
  }
  return {
    id,
    order,
    kind,
    cells,
    docId,
    blockId,
    durationMs,
    prompter,
    unnumbered,
  };
}

function readRundownJSON(value: unknown): RundownJSON | null {
  if (!isFields(value) || !isFields(value.rundown)) return null;
  const { airDate, airAt, windowLeadMs, targetMs } = value.rundown;
  if (!isString(airDate)) return null;
  if (airAt !== null && !isSafeInt(airAt)) return null;
  if (!isCount(windowLeadMs)) return null;
  if (targetMs !== null && !isCount(targetMs)) return null;
  const columns = readEach(value.columns, (col) =>
    isColumnId(col) ? col : null,
  );
  const rows = readEach(value.rows, readRundownRow);
  if (columns === null || rows === null) return null;
  return {
    rundown: { airDate, airAt, windowLeadMs, targetMs },
    columns,
    rows,
  };
}

/** One anchor of a lock table, each field of the kind the authority writes; null otherwise. */
export function readLock(value: unknown): LockAnchorRecord | null {
  if (!isFields(value)) return null;
  const { level, order, label, blockId, offset, quote, source } = value;
  const fallbackIds = readEach(value.fallbackIds, (id) =>
    isString(id) ? id : null,
  );
  if (!isCount(level) || !isCount(order) || !isCount(offset)) return null;
  if (!isString(label) || !isString(blockId) || !isString(quote)) return null;
  if (fallbackIds === null || !isLockSource(source)) return null;
  return { level, order, label, blockId, offset, quote, fallbackIds, source };
}

function readAuthors(value: unknown): Record<string, VersionAuthor> | null {
  if (!isFields(value)) return null;
  const authors: [string, VersionAuthor][] = [];
  for (const [id, author] of Object.entries(value)) {
    if (!isFields(author) || !isString(author.userId) || !isCount(author.at))
      return null;
    authors.push([id, { userId: author.userId, at: author.at }]);
  }
  // own entries only: a block id may be "__proto__"
  return Object.fromEntries(authors);
}

/** Everything of a content but its blocks and rundown, each field of the kind this module writes; null otherwise. */
function readFields(
  value: unknown,
): Omit<VersionContent, "blocks" | "rundown"> | null {
  if (!isFields(value) || value.v !== 1 || !isFields(value.settings))
    return null;
  const { schemaVersion, engineVersion } = value;
  const locks = value.locks === null ? null : readEach(value.locks, readLock);
  if (locks === null && value.locks !== null) return null;
  const authors = readAuthors(value.authors);
  if (!isCount(schemaVersion)) return null;
  if (engineVersion !== null && !isCount(engineVersion)) return null;
  if (authors === null) return null;
  const { settings } = value;
  return { v: 1, settings, schemaVersion, engineVersion, locks, authors };
}

function readManifest(value: unknown): Manifest | null {
  const fields = readFields(value);
  if (fields === null || !isFields(value)) return null;
  const chunks = readEach(value.chunks, (hash) =>
    isString(hash) ? hash : null,
  );
  if (chunks === null) return null;
  if (value.rundownChunk === undefined) return { ...fields, chunks };
  if (!isString(value.rundownChunk)) return null;
  return { ...fields, chunks, rundownChunk: value.rundownChunk };
}

/** A version's content as it travels, each field of the kind a snapshot holds; null otherwise. */
export function readContent(value: unknown): VersionContent | null {
  const fields = readFields(value);
  if (fields === null || !isFields(value)) return null;
  const blocks = readEach(value.blocks, readBlock);
  if (blocks === null) return null;
  if (value.rundown === undefined) return { ...fields, blocks };
  const rundown = readRundownJSON(value.rundown);
  return rundown === null ? null : { ...fields, blocks, rundown };
}

const readChunkBlocks = (value: unknown): BlockJSON[] | null =>
  isFields(value) ? readEach(value.blocks, readBlock) : null;

const readChunkRundown = (value: unknown): RundownJSON | null =>
  isFields(value) ? readRundownJSON(value.rundown) : null;

/** The content whose manifest is `ref`. Throws StorageError("corrupt") (`corruptError`) when a chunk is missing, its hash does not verify, or it is not what this module writes. */
export function readSnapshot(file: DocFile, ref: string): VersionContent {
  const { chunks, rundownChunk, ...manifest } = readChunk(
    file,
    ref,
    readManifest,
  );
  const blocks = chunks.flatMap((hash) =>
    readChunk(file, hash, readChunkBlocks),
  );
  if (rundownChunk === undefined) return { ...manifest, blocks };
  const rundown = readChunk(file, rundownChunk, readChunkRundown);
  return { ...manifest, blocks, rundown };
}

/** Every chunk a remaining manifest of the document names, its manifest's own and any rundown chunk included, in lower-case hex. */
export function liveChunkHashes(file: DocFile, docId: string): Set<string> {
  const live = new Set<string>();
  for (const { id } of file.versions.list(docId)) {
    const ref = file.history.snapshotOf(id)?.ref;
    if (ref === undefined) continue;
    live.add(ref);
    const manifest = readChunk(file, ref, readManifest);
    for (const hash of manifest.chunks) live.add(hash);
    if (manifest.rundownChunk !== undefined) live.add(manifest.rundownChunk);
  }
  return live;
}
