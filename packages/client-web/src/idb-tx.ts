// Low-level IndexedDB layout, transactions, bounded entry cursor and metadata helpers for the local store.
import { StoreError } from "@manent/sync-client";
import type { DocMeta, StoredEntry } from "@manent/sync-client";

/** The IndexedDB database version. A later one adds stores or indexes by `oldVersion`, and never deletes or rekeys one of these. */
export const LOCAL_STORE_VERSION = 1;

/** Keyed by user as well as by origin, so that two people on one origin never share a database. */
export function localDatabaseName(userId: string): string {
  return `manent:${userId}`;
}

/** The stores that hold a document's own records, which a load reads and a reset replaces. */
export const DOC_STORES = ["meta", "entries", "checkpoints", "bases"] as const;
export type StoreName =
  (typeof DOC_STORES)[number] | "versions" | "recovered" | "lease";
export type Durability = "strict" | "relaxed";

export type EntryRecord = StoredEntry & { docId: string };

/** `highestLocalSeq`: highest `localSeq` held; `waitingCount`: persisted waiting-change count (absent on older records). */
export interface MetaRecord extends Omit<DocMeta, "recovering" | "create"> {
  highestLocalSeq: number;
  waitingCount?: number;
  recovering: { versionId: string; heal: boolean; replaying?: boolean } | null;
  create: { kind: string; home: string; workspaceId?: string | null } | null;
}

export function docMetaOf({
  highestLocalSeq: _mark,
  waitingCount: _waiting,
  ...meta
}: MetaRecord): DocMeta {
  const { moving = null, recovering: old, create: made } = meta;
  const recovering = old && { replaying: false, ...old };
  const create = made && { ...made, workspaceId: made.workspaceId ?? null };
  return { ...meta, moving, recovering, create };
}

const STRICT: IDBTransactionOptions = Object.freeze({ durability: "strict" });
const RELAXED: IDBTransactionOptions = Object.freeze({ durability: "relaxed" });

function createLayout(db: IDBDatabase): void {
  db.createObjectStore("meta", { keyPath: "docId" });
  db.createObjectStore("entries", { keyPath: ["docId", "localSeq"] });
  db.createObjectStore("checkpoints", { keyPath: "docId" });
  db.createObjectStore("bases", { keyPath: "docId" });
  for (const name of ["versions", "recovered"])
    db.createObjectStore(name, { keyPath: "id" }).createIndex("byDoc", "docId");
  db.createObjectStore("lease", { keyPath: "name" });
}

/** Rejects StoreError("unavailable") when the database cannot be opened, as when a newer build wrote it (a VersionError, which leaves it untouched). The connection closes itself when another asks to delete or upgrade the database. */
export function openLocalDatabase(
  indexedDb: IDBFactory,
  userId: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(localDatabaseName(userId), LOCAL_STORE_VERSION);
    } catch (cause) {
      reject(new StoreError("unavailable", { cause }));
      return;
    }
    request.addEventListener("upgradeneeded", (event) => {
      if (event.oldVersion < 1) createLayout(request.result);
    });
    request.addEventListener("success", () => {
      const db = request.result;
      db.addEventListener("versionchange", () => db.close());
      resolve(db);
    });
    request.addEventListener("error", () =>
      reject(new StoreError("unavailable", { cause: request.error })),
    );
  });
}

function abortError(mode: IDBTransactionMode, error: DOMException | null) {
  if (mode === "readonly")
    return new StoreError("unavailable", { cause: error });
  const quota = error?.name === "QuotaExceededError";
  return new StoreError(quota ? "quota" : "write_failed", { cause: error });
}

/** Settles on the transaction's `complete`, with what `body`'s returned function reads then, or on its `abort`; never on a request's success. `fail` aborts with that error. */
export function transact<T>(
  db: IDBDatabase,
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction, fail: (error: Error) => void) => () => T,
  durability: Durability = "strict",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const options =
      mode === "readwrite" ? (durability === "strict" ? STRICT : RELAXED) : {};
    let tx: IDBTransaction;
    try {
      tx = db.transaction([...stores], mode, options);
    } catch (cause) {
      // a closed connection: the database was deleted or upgraded under this store
      reject(new StoreError("unavailable", { cause }));
      return;
    }
    let failure: Error | null = null;
    const result = body(tx, (error) => {
      failure = error;
      tx.abort();
    });
    tx.addEventListener("complete", () => resolve(result()));
    tx.addEventListener("abort", () =>
      reject(failure ?? abortError(mode, tx.error)),
    );
  });
}

/** Opens a cursor bounded to `docId`'s entries when the global IDBKeyRange works with this factory. */
function openEntryCursor(
  store: IDBObjectStore,
  docId: string,
): IDBRequest<IDBCursorWithValue | null> {
  if (typeof IDBKeyRange === "function") {
    try {
      return store.openCursor(
        IDBKeyRange.bound(
          [docId, Number.NEGATIVE_INFINITY],
          [docId, Number.POSITIVE_INFINITY],
        ),
      );
    } catch {
      // an injected factory may not accept the global IDBKeyRange
    }
  }
  return store.openCursor();
}

/** Visits one document's entries in `localSeq` order, then runs `end`. */
export function eachEntry(
  tx: IDBTransaction,
  docId: string,
  visit: (record: EntryRecord, cursor: IDBCursorWithValue) => void,
  end?: () => void,
): void {
  const request = openEntryCursor(tx.objectStore("entries"), docId);
  request.addEventListener("success", () => {
    const cursor = request.result;
    const record: EntryRecord | null = cursor?.value ?? null;
    if (cursor === null || record === null || record.docId > docId) end?.();
    else if (record.docId < docId) cursor.continue([docId]);
    else {
      visit(record, cursor);
      cursor.continue();
    }
  });
}

/** Reads one record of `store` and hands it, or null, to `then`. */
export function readRecord<T>(
  tx: IDBTransaction,
  store: StoreName,
  key: IDBValidKey,
  then: (record: T | null) => void,
): void {
  const request: IDBRequest<T | undefined> = tx.objectStore(store).get(key);
  request.addEventListener("success", () => then(request.result ?? null));
}

/** Collects every entry of `docId` into `then` using the bounded cursor. */
export function collectEntries(
  tx: IDBTransaction,
  docId: string,
  then: (entries: StoredEntry[]) => void,
): void {
  const entries: StoredEntry[] = [];
  eachEntry(
    tx,
    docId,
    ({ docId: _id, ...entry }) => entries.push(entry),
    () => then(entries),
  );
}

/** Counts recovered items per `docId` through the `byDoc` key cursor without loading values. */
export function countRecoveredByDoc(tx: IDBTransaction): Map<string, number> {
  const counts = new Map<string, number>();
  const keyCursor = tx.objectStore("recovered").index("byDoc").openKeyCursor();
  keyCursor.addEventListener("success", () => {
    const cursor = keyCursor.result;
    if (cursor === null) return;
    if (typeof cursor.key === "string")
      counts.set(cursor.key, (counts.get(cursor.key) ?? 0) + 1);
    cursor.continue();
  });
  return counts;
}

/** Reads every record of `store`, or those for `docId` through its `byDoc` index. */
export function readAllRecords<T>(
  db: IDBDatabase,
  store: "meta" | "versions" | "recovered",
  docId: string | null,
): Promise<T[]> {
  return transact(db, [store], "readonly", (tx) => {
    const records = tx.objectStore(store);
    const source = docId === null ? records : records.index("byDoc");
    const found: IDBRequest<T[]> = source.getAll(docId);
    return () => found.result;
  });
}

/** Merges `patch` into the stored meta record; aborts with RangeError when `docId` is absent. */
export function patchMetaRecord(
  tx: IDBTransaction,
  docId: string,
  fail: (error: Error) => void,
  patch: (found: MetaRecord) => Partial<MetaRecord>,
): void {
  readRecord<MetaRecord>(tx, "meta", docId, (found) => {
    if (found === null)
      fail(new RangeError(`the store holds no document ${docId}`));
    else tx.objectStore("meta").put({ ...found, ...patch(found) });
  });
}
