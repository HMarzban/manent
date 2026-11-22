// The local store on IndexedDB: one database per user, every write one strict transaction
// that settles only when the browser has completed or aborted it.
import { StoreError, toRecoveredItem } from "@manent/sync-client";
import type {
  DeviceVersion,
  DocMeta,
  LoadedDocument,
  LocalStore,
  RecoveredItem,
  StoredDeviceVersion,
  StoredEntry,
  StoredRecoveredItem,
} from "@manent/sync-client";

/** The IndexedDB database version. A later one adds stores or indexes by `oldVersion`, and never deletes or rekeys one of these. */
export const LOCAL_STORE_VERSION = 1;

/** Keyed by user as well as by origin, so that two people on one origin never share a database. */
export function localDatabaseName(userId: string): string {
  return `manent:${userId}`;
}

/** The stores that hold a document's own records, which a load reads and a reset replaces. */
const DOC_STORES = ["meta", "entries", "checkpoints", "bases"] as const;
type StoreName =
  (typeof DOC_STORES)[number] | "versions" | "recovered" | "lease";

type EntryRecord = StoredEntry & { docId: string };

/** `highestLocalSeq`: the highest `localSeq` the document has held that its checkpoint and entries may no longer show. A record stored before moves existed lacks `moving`, its `recovering` lacks `replaying`, and one stored before creates named a workspace lacks `workspaceId`. */
interface MetaRecord extends Omit<DocMeta, "recovering" | "create"> {
  highestLocalSeq: number;
  recovering: { versionId: string; heal: boolean; replaying?: boolean } | null;
  create: { kind: string; home: string; workspaceId?: string | null } | null;
}

function docMetaOf({ highestLocalSeq: _mark, ...meta }: MetaRecord): DocMeta {
  const { moving = null, recovering: old, create: made } = meta;
  const recovering = old && { replaying: false, ...old };
  const create = made && { ...made, workspaceId: made.workspaceId ?? null };
  return { ...meta, moving, recovering, create };
}

interface CheckpointRecord extends NonNullable<LoadedDocument["checkpoint"]> {
  docId: string;
}

const STRICT: IDBTransactionOptions = Object.freeze({ durability: "strict" });

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
function transact<T>(
  db: IDBDatabase,
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction, fail: (error: Error) => void) => () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const options = mode === "readwrite" ? STRICT : {};
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

/** Visits one document's entries in `localSeq` order, then runs `end`. Keys alone bound the walk: a key range needs the global IDBKeyRange, which the injected factory need not share. */
function eachEntry(
  tx: IDBTransaction,
  docId: string,
  visit: (record: EntryRecord, cursor: IDBCursorWithValue) => void,
  end?: () => void,
): void {
  const request = tx.objectStore("entries").openCursor();
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
function read<T>(
  tx: IDBTransaction,
  store: StoreName,
  key: IDBValidKey,
  then: (record: T | null) => void,
): void {
  const request: IDBRequest<T | undefined> = tx.objectStore(store).get(key);
  request.addEventListener("success", () => then(request.result ?? null));
}

/** Every write takes a copy of what it is given when it is called. */
class IdbStore implements LocalStore {
  /** `leaseTabId`: the tab whose lease fences every write; null where Web Locks elect the leader. */
  constructor(
    readonly userId: string,
    private readonly db: IDBDatabase,
    private readonly leaseTabId: string | null,
  ) {}

  load(docId: string): Promise<LoadedDocument | null> {
    return transact(this.db, DOC_STORES, "readonly", (tx) => {
      let meta: MetaRecord | null = null;
      let checkpoint: CheckpointRecord | null = null;
      let base: { state: Uint8Array } | null = null;
      read<MetaRecord>(tx, "meta", docId, (record) => (meta = record));
      read<CheckpointRecord>(tx, "checkpoints", docId, (r) => (checkpoint = r));
      read<{ state: Uint8Array }>(tx, "bases", docId, (r) => (base = r));
      const entries: StoredEntry[] = [];
      eachEntry(tx, docId, ({ docId: _id, ...entry }) => entries.push(entry));
      return () => {
        if (meta === null) return null;
        const through = checkpoint?.throughLocalSeq ?? -Infinity;
        return {
          meta: docMetaOf(meta),
          checkpoint: checkpoint && {
            state: checkpoint.state,
            throughLocalSeq: checkpoint.throughLocalSeq,
          },
          syncedBase: base?.state ?? null,
          entries: entries.filter((e) => e.localSeq > through || !e.acked),
        };
      };
    });
  }

  create(meta: DocMeta): Promise<void> {
    const stored: MetaRecord = { ...structuredClone(meta), highestLocalSeq: 0 };
    return this.write(["meta"], (tx) =>
      read(tx, "meta", stored.docId, (existing) => {
        // an existing document is kept as it is
        if (existing === null) tx.objectStore("meta").put(stored);
      }),
    );
  }

  append(docId: string, entry: StoredEntry): Promise<void> {
    const stored: EntryRecord = { docId, ...structuredClone(entry) };
    return this.write(["entries"], (tx) => {
      tx.objectStore("entries").put(stored);
    });
  }

  acknowledge(
    docId: string,
    throughLocalSeq: number,
    patch: Partial<DocMeta>,
  ): Promise<void> {
    const stored = structuredClone(patch);
    return this.write(["meta", "entries"], (tx, fail) => {
      this.patchMetaIn(tx, docId, fail, () => stored);
      eachEntry(tx, docId, (record, cursor) => {
        if (!record.acked && record.localSeq <= throughLocalSeq)
          cursor.update({ ...record, acked: true });
      });
    });
  }

  refuse(docId: string, localSeq: number): Promise<void> {
    return this.write(["meta", "entries"], (tx, fail) => {
      this.patchMetaIn(tx, docId, fail, (found) => ({
        highestLocalSeq: Math.max(found.highestLocalSeq, localSeq),
      }));
      tx.objectStore("entries").delete([docId, localSeq]);
    });
  }

  markApplied(
    docId: string,
    throughLocalSeq: number,
    setAside: readonly RecoveredItem[],
  ): Promise<void> {
    const items = structuredClone(setAside);
    return this.write(["entries", "recovered"], (tx) => {
      eachEntry(tx, docId, (record, cursor) => {
        const waiting = record.kind === "update" && !record.applied;
        if (waiting && record.localSeq <= throughLocalSeq)
          cursor.update({ ...record, applied: true });
      });
      for (const item of items) tx.objectStore("recovered").put(item);
    });
  }

  checkpoint(
    docId: string,
    state: Uint8Array,
    throughLocalSeq: number,
    synced: boolean,
  ): Promise<void> {
    const copy = new Uint8Array(state);
    const stores: StoreName[] = ["entries", "checkpoints"];
    if (synced) stores.push("bases");
    return this.write(stores, (tx) => {
      const point = { docId, state: copy, throughLocalSeq };
      tx.objectStore("checkpoints").put(point);
      if (synced) tx.objectStore("bases").put({ docId, state: copy });
      eachEntry(tx, docId, (entry, cursor) => {
        const settled = entry.acked && (entry.kind === "set" || entry.applied);
        if (settled && entry.localSeq <= throughLocalSeq) cursor.delete();
      });
    });
  }

  patchMeta(docId: string, patch: Partial<DocMeta>): Promise<void> {
    const stored = structuredClone(patch);
    return this.write(["meta"], (tx, fail) =>
      this.patchMetaIn(tx, docId, fail, () => stored),
    );
  }

  /** The highest `localSeq` ever held is the most of the checkpoint's, the meta record's mark and the entries'. */
  reset(docId: string, state: Uint8Array, meta: DocMeta): Promise<void> {
    const storedState = new Uint8Array(state);
    const storedMeta = structuredClone(meta);
    return this.write(DOC_STORES, (tx) => {
      let highest = 0;
      const raise = (seq = 0) => (highest = Math.max(highest, seq));
      read<CheckpointRecord>(tx, "checkpoints", docId, (r) =>
        raise(r?.throughLocalSeq),
      );
      read<MetaRecord>(tx, "meta", docId, (r) => raise(r?.highestLocalSeq));
      eachEntry(
        tx,
        docId,
        (entry, cursor) => {
          raise(entry.localSeq);
          if (entry.kind !== "set" || entry.acked) cursor.delete();
        },
        () => {
          const point = { docId, state: storedState, throughLocalSeq: highest };
          tx.objectStore("checkpoints").put(point);
          tx.objectStore("bases").put({ docId, state: storedState });
          const next: MetaRecord = { ...storedMeta, highestLocalSeq: highest };
          tx.objectStore("meta").put(next);
        },
      );
    });
  }

  addVersion(version: DeviceVersion): Promise<void> {
    const stored = structuredClone(version);
    return this.write(["versions"], (tx) => {
      tx.objectStore("versions").put(stored);
    });
  }

  async versions(docId: string): Promise<DeviceVersion[]> {
    const stored = await this.readAll<StoredDeviceVersion>("versions", docId);
    return stored.map((version) => ({ name: null, ...version }));
  }

  markUploaded(versionId: string): Promise<void> {
    return this.write(["versions"], (tx) =>
      read<DeviceVersion>(tx, "versions", versionId, (found) => {
        if (found !== null)
          tx.objectStore("versions").put({ ...found, uploaded: true });
      }),
    );
  }

  async recovered(docId: string): Promise<RecoveredItem[]> {
    const items = await this.readAll<StoredRecoveredItem>("recovered", docId);
    return items.map(toRecoveredItem);
  }

  dismissRecovered(itemId: string): Promise<void> {
    return this.write(["recovered"], (tx) => {
      tx.objectStore("recovered").delete(itemId);
    });
  }

  async documents(): Promise<DocMeta[]> {
    return (await this.readAll<MetaRecord>("meta", null)).map(docMetaOf);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  /** Merges `patch` of the stored meta into it; RangeError for a document this store does not hold. */
  private patchMetaIn(
    tx: IDBTransaction,
    docId: string,
    fail: (error: Error) => void,
    patch: (found: MetaRecord) => Partial<MetaRecord>,
  ): void {
    read<MetaRecord>(tx, "meta", docId, (found) => {
      if (found === null)
        fail(new RangeError(`the store holds no document ${docId}`));
      else tx.objectStore("meta").put({ ...found, ...patch(found) });
    });
  }

  /** Every record of `store`, or, with a `docId`, those of that document through its `byDoc` index. */
  private readAll<T>(
    store: "meta" | "versions" | "recovered",
    docId: string | null,
  ): Promise<T[]> {
    return transact(this.db, [store], "readonly", (tx) => {
      const records = tx.objectStore(store);
      const source = docId === null ? records : records.index("byDoc");
      const found: IDBRequest<T[]> = source.getAll(docId);
      return () => found.result;
    });
  }

  /**
   * With a lease, the transaction reads it first and aborts with StoreError("lost_lead")
   * unless this tab holds it, so a deposed tab never writes over the new leader.
   */
  private write(
    stores: readonly StoreName[],
    body: (tx: IDBTransaction, fail: (error: Error) => void) => void,
  ): Promise<void> {
    const { leaseTabId } = this;
    const fenced: readonly StoreName[] =
      leaseTabId === null ? stores : [...stores, "lease"];
    return transact(this.db, fenced, "readwrite", (tx, fail) => {
      if (leaseTabId === null) body(tx, fail);
      else
        read<{ tabId: string }>(tx, "lease", "leader", (lease) => {
          if (lease?.tabId === leaseTabId) body(tx, fail);
          else fail(new StoreError("lost_lead"));
        });
      return () => undefined;
    });
  }
}

/** Rejects StoreError("unavailable") when the database cannot be opened. */
export async function openIdbStore(options: {
  userId: string;
  indexedDb: IDBFactory;
  leaseTabId?: string;
}): Promise<LocalStore> {
  const db = await openLocalDatabase(options.indexedDb, options.userId);
  return new IdbStore(options.userId, db, options.leaseTabId ?? null);
}
