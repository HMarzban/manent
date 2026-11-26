// IndexedDB binary asset store ("assets", LOCAL_STORE_VERSION 2): strict durability for pending uploads,
// relaxed durability for cached downloads, and LRU eviction that pins pending blobs.
import { openLocalDatabase, readRecord, transact } from "./idb-tx.ts";

export type AssetUploadState = "pending" | "uploaded";

export interface StoredAssetRecord {
  readonly assetId: string;
  readonly projectId: string;
  readonly mime: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly uploadState: AssetUploadState;
  readonly createdAt: number;
  readonly lastUsedAt: number;
}

export interface PutAssetInput {
  readonly assetId: string;
  readonly projectId: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly createdAt?: number;
}

export interface IdbAssetStore {
  /** Persists a locally added blob with strict durability so it survives a crash before upload completes. */
  putPendingAsset(input: PutAssetInput): Promise<StoredAssetRecord>;
  /** Caches a server-stored blob with relaxed durability. */
  putUploadedAsset(input: PutAssetInput): Promise<StoredAssetRecord>;
  /** Marks a stored asset as uploaded; returns false when the asset is absent. */
  markAssetUploaded(assetId: string): Promise<boolean>;
  /** Reads an asset and updates its `lastUsedAt` timestamp unless `touch` is false. */
  getAsset(
    assetId: string,
    options?: { readonly touch?: boolean },
  ): Promise<StoredAssetRecord | null>;
  /** Lists pending assets (optionally filtered to one project), oldest first. */
  listPendingAssets(projectId?: string): Promise<StoredAssetRecord[]>;
  /** Lists all cached assets for one project, oldest first. */
  listProjectAssets(projectId: string): Promise<StoredAssetRecord[]>;
  /**
   * Evicts least-recently-used `"uploaded"` assets until total stored bytes
   * across all assets are at or below `maxTotalBytes` (or no uploaded assets
   * remain). `"pending"` assets are pinned and never evicted.
   */
  evictUploadedLru(maxTotalBytes: number): Promise<string[]>;
  close(): Promise<void>;
}

function copyRecord(record: StoredAssetRecord): StoredAssetRecord {
  return {
    assetId: record.assetId,
    projectId: record.projectId,
    mime: record.mime,
    byteLength: record.byteLength,
    width: record.width,
    height: record.height,
    bytes: new Uint8Array(record.bytes),
    uploadState: record.uploadState,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
  };
}

const byCreatedThenId = (a: StoredAssetRecord, b: StoredAssetRecord): number =>
  a.createdAt - b.createdAt ||
  (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);

const byLruOrder = (a: StoredAssetRecord, b: StoredAssetRecord): number =>
  a.lastUsedAt - b.lastUsedAt ||
  a.createdAt - b.createdAt ||
  (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);

class IndexedDbAssetStore implements IdbAssetStore {
  constructor(
    private readonly db: IDBDatabase,
    private readonly now: () => number,
    private readonly ownsDb: boolean,
  ) {}

  putPendingAsset(input: PutAssetInput): Promise<StoredAssetRecord> {
    const bytes = new Uint8Array(input.bytes);
    const at = this.now();
    const createdAt = input.createdAt ?? at;
    return transact(
      this.db,
      ["assets"],
      "readwrite",
      (tx) => {
        let written: StoredAssetRecord | null = null;
        readRecord<StoredAssetRecord>(tx, "assets", input.assetId, (found) => {
          const alreadyUploadedHere =
            found !== null &&
            found.projectId === input.projectId &&
            found.uploadState === "uploaded";
          const next: StoredAssetRecord = alreadyUploadedHere
            ? { ...found, lastUsedAt: at }
            : {
                assetId: input.assetId,
                projectId: input.projectId,
                mime: input.mime,
                byteLength: bytes.byteLength,
                width: input.width,
                height: input.height,
                bytes,
                uploadState: "pending",
                createdAt,
                lastUsedAt: at,
              };
          tx.objectStore("assets").put(next);
          written = next;
        });
        return () => copyRecord(written!);
      },
      "strict",
    );
  }

  putUploadedAsset(input: PutAssetInput): Promise<StoredAssetRecord> {
    const bytes = new Uint8Array(input.bytes);
    const at = this.now();
    const next: StoredAssetRecord = {
      assetId: input.assetId,
      projectId: input.projectId,
      mime: input.mime,
      byteLength: bytes.byteLength,
      width: input.width,
      height: input.height,
      bytes,
      uploadState: "uploaded",
      createdAt: input.createdAt ?? at,
      lastUsedAt: at,
    };
    return transact(
      this.db,
      ["assets"],
      "readwrite",
      (tx) => {
        tx.objectStore("assets").put(next);
        return () => copyRecord(next);
      },
      "relaxed",
    );
  }

  markAssetUploaded(assetId: string): Promise<boolean> {
    const at = this.now();
    return transact(
      this.db,
      ["assets"],
      "readwrite",
      (tx) => {
        let updated = false;
        readRecord<StoredAssetRecord>(tx, "assets", assetId, (found) => {
          if (found === null) return;
          tx.objectStore("assets").put({
            ...found,
            uploadState: "uploaded",
            lastUsedAt: at,
          });
          updated = true;
        });
        return () => updated;
      },
      "relaxed",
    );
  }

  getAsset(
    assetId: string,
    options?: { readonly touch?: boolean },
  ): Promise<StoredAssetRecord | null> {
    if (options?.touch === false) {
      return transact(this.db, ["assets"], "readonly", (tx) => {
        let found: StoredAssetRecord | null = null;
        readRecord<StoredAssetRecord>(tx, "assets", assetId, (record) => {
          found = record;
        });
        return () => (found === null ? null : copyRecord(found));
      });
    }
    const at = this.now();
    return transact(
      this.db,
      ["assets"],
      "readwrite",
      (tx) => {
        let result: StoredAssetRecord | null = null;
        readRecord<StoredAssetRecord>(tx, "assets", assetId, (record) => {
          if (record === null) return;
          const touched: StoredAssetRecord = { ...record, lastUsedAt: at };
          tx.objectStore("assets").put(touched);
          result = touched;
        });
        return () => (result === null ? null : copyRecord(result));
      },
      "relaxed",
    );
  }

  listPendingAssets(projectId?: string): Promise<StoredAssetRecord[]> {
    return transact(this.db, ["assets"], "readonly", (tx) => {
      const request: IDBRequest<StoredAssetRecord[]> = tx
        .objectStore("assets")
        .index("byUploadState")
        .getAll("pending");
      return () => {
        const rows =
          projectId === undefined
            ? request.result
            : request.result.filter((row) => row.projectId === projectId);
        return rows.map(copyRecord).toSorted(byCreatedThenId);
      };
    });
  }

  listProjectAssets(projectId: string): Promise<StoredAssetRecord[]> {
    return transact(this.db, ["assets"], "readonly", (tx) => {
      const request: IDBRequest<StoredAssetRecord[]> = tx
        .objectStore("assets")
        .index("byProject")
        .getAll(projectId);
      return () => request.result.map(copyRecord).toSorted(byCreatedThenId);
    });
  }

  evictUploadedLru(maxTotalBytes: number): Promise<string[]> {
    const cap = Math.max(0, maxTotalBytes);
    return transact(
      this.db,
      ["assets"],
      "readwrite",
      (tx) => {
        const evicted: string[] = [];
        const store = tx.objectStore("assets");
        const request: IDBRequest<StoredAssetRecord[]> = store.getAll();
        request.addEventListener("success", () => {
          const all = request.result;
          let total = 0;
          for (const row of all) total += row.byteLength;
          if (total <= cap) return;
          const uploaded = all
            .filter((row) => row.uploadState === "uploaded")
            .toSorted(byLruOrder);
          for (const candidate of uploaded) {
            if (total <= cap) break;
            store.delete(candidate.assetId);
            evicted.push(candidate.assetId);
            total -= candidate.byteLength;
          }
        });
        return () => evicted;
      },
      "relaxed",
    );
  }

  async close(): Promise<void> {
    if (this.ownsDb) this.db.close();
  }
}

/** Wraps an already-open local IndexedDB connection for binary asset operations. */
export function createIdbAssetStore(
  db: IDBDatabase,
  options?: { readonly now?: () => number },
): IdbAssetStore {
  return new IndexedDbAssetStore(db, options?.now ?? Date.now, false);
}

/** Opens the user's local IndexedDB database and returns an `IdbAssetStore` over its `"assets"` store. */
export async function openIdbAssetStore(options: {
  readonly userId: string;
  readonly indexedDb: IDBFactory;
  readonly now?: () => number;
}): Promise<IdbAssetStore> {
  const db = await openLocalDatabase(options.indexedDb, options.userId);
  return new IndexedDbAssetStore(db, options.now ?? Date.now, true);
}
