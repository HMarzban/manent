// A version stored as its content: a manifest naming its scene chunks, read back only when every
// chunk verifies, and the chunks that remaining manifests still name.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
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
type Manifest = Omit<VersionContent, "blocks"> & { chunks: string[] };

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

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

/** Stores `content` as chunks and returns its manifest's hash, in lower-case hex. Writes inside the caller's transaction, if any. */
export function writeSnapshot(file: DocFile, content: VersionContent): string {
  const blocks = content.blocks.map(canonicalBlock);
  const chunks = sceneChunks(blocks).map((chunk) =>
    writeChunk(file, { blocks: chunk }),
  );
  const manifest: Manifest = {
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
function readEach<T>(
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

function readLock(value: unknown): LockAnchorRecord | null {
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

function readManifest(value: unknown): Manifest | null {
  if (!isFields(value) || value.v !== 1 || !isFields(value.settings))
    return null;
  const { schemaVersion, engineVersion } = value;
  const chunks = readEach(value.chunks, (hash) =>
    isString(hash) ? hash : null,
  );
  const locks = value.locks === null ? null : readEach(value.locks, readLock);
  if (locks === null && value.locks !== null) return null;
  const authors = readAuthors(value.authors);
  if (!isCount(schemaVersion)) return null;
  if (engineVersion !== null && !isCount(engineVersion)) return null;
  if (chunks === null || authors === null) return null;
  const { settings } = value;
  return {
    v: 1,
    chunks,
    settings,
    schemaVersion,
    engineVersion,
    locks,
    authors,
  };
}

const readChunkBlocks = (value: unknown): BlockJSON[] | null =>
  isFields(value) ? readEach(value.blocks, readBlock) : null;

/** The content whose manifest is `ref`. Throws StorageError("corrupt") (`corruptError`) when a chunk is missing, its hash does not verify, or it is not what this module writes. */
export function readSnapshot(file: DocFile, ref: string): VersionContent {
  const { chunks, ...manifest } = readChunk(file, ref, readManifest);
  const blocks = chunks.flatMap((hash) =>
    readChunk(file, hash, readChunkBlocks),
  );
  return { ...manifest, blocks };
}

/** Every chunk a remaining manifest of the document names, its manifest's own included, in lower-case hex. */
export function liveChunkHashes(file: DocFile, docId: string): Set<string> {
  const live = new Set<string>();
  for (const { id } of file.versions.list(docId)) {
    const ref = file.history.snapshotOf(id)?.ref;
    if (ref === undefined) continue;
    live.add(ref);
    for (const hash of readChunk(file, ref, readManifest).chunks)
      live.add(hash);
  }
  return live;
}
