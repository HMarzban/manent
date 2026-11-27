// The production cache on IndexedDB: one database per user, one store keyed by document, a
// connection opened for each call and closed after it, so a new seed can always delete it.
import { StoreError, isVersionContent } from "@manent/sync-client";
import type { CachedProduction, ProductionCache } from "@manent/sync-client";
import { isProductionState } from "@manent/sync-protocol";
import { listenIdbRelease, nudgeIdbRelease } from "./idb-tx.ts";
import type { IdbLifecycleOptions } from "./idb-tx.ts";

/** The IndexedDB database version. A later one adds stores by `oldVersion`, and never deletes or rekeys this one. */
const PRODUCTION_CACHE_VERSION = 1;
const STORE = "production";

const RELAXED: IDBTransactionOptions = Object.freeze({ durability: "relaxed" });

function open(
  indexedDb: IDBFactory,
  userId: string,
  lifecycle?: IdbLifecycleOptions,
): Promise<{ db: IDBDatabase; cleanup: () => void }> {
  // named under manent: so that a new seed forgets it with every other database
  const name = `manent:production:${userId}`;
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(name, PRODUCTION_CACHE_VERSION);
    request.addEventListener("blocked", (event) => {
      nudgeIdbRelease(indexedDb, name, lifecycle?.createChannel);
      lifecycle?.onBlocked?.(event);
    });
    request.addEventListener("upgradeneeded", (event) => {
      if (event.oldVersion < 1) request.result.createObjectStore(STORE);
    });
    request.addEventListener("success", () => {
      const db = request.result;
      let stopRelease: (() => void) | null = null;
      const cleanup = (): void => {
        stopRelease?.();
        stopRelease = null;
      };
      stopRelease = listenIdbRelease(
        indexedDb,
        name,
        () => {
          cleanup();
          db.close();
        },
        lifecycle?.createChannel,
      );
      db.addEventListener("versionchange", (event) => {
        cleanup();
        db.close();
        lifecycle?.onVersionChange?.(event);
      });
      db.addEventListener("close", cleanup);
      resolve({ db, cleanup });
    });
    request.addEventListener("error", () =>
      reject(new StoreError("unavailable", { cause: request.error })),
    );
  });
}

/** Settles on the transaction's `complete` with what the request read, or rejects StoreError on its `abort`. */
async function transact<T>(
  indexedDb: IDBFactory,
  userId: string,
  mode: IDBTransactionMode,
  ask: (store: IDBObjectStore) => IDBRequest<T>,
  lifecycle?: IdbLifecycleOptions,
): Promise<T> {
  const { db, cleanup } = await open(indexedDb, userId, lifecycle);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(
        STORE,
        mode,
        mode === "readwrite" ? RELAXED : {},
      );
      const request = ask(tx.objectStore(STORE));
      tx.addEventListener("complete", () => resolve(request.result));
      tx.addEventListener("abort", () => {
        const code =
          mode === "readonly"
            ? "unavailable"
            : tx.error?.name === "QuotaExceededError"
              ? "quota"
              : "write_failed";
        reject(new StoreError(code, { cause: tx.error }));
      });
    });
  } finally {
    cleanup();
    db.close();
  }
}

/** Null for an entry this build cannot read, as one a newer build or a damaged disk left. */
function readEntry(value: unknown): CachedProduction | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("state" in value) || !("baseline" in value)) return null;
  const { state, baseline } = value;
  if (!isProductionState(state)) return null;
  if (baseline === null) return { state, baseline };
  if (typeof baseline !== "object" || !("versionId" in baseline)) return null;
  if (!("content" in baseline)) return null;
  const { versionId, content } = baseline;
  return typeof versionId === "string" && isVersionContent(content)
    ? { state, baseline: { versionId, content } }
    : null;
}

/** Rejects StoreError when the database cannot be opened or a write does not complete. */
export function createIdbProductionCache(
  options: {
    userId: string;
    indexedDb: IDBFactory;
  } & IdbLifecycleOptions,
): ProductionCache {
  const { userId, indexedDb, onVersionChange, onBlocked, createChannel } =
    options;
  const lifecycle: IdbLifecycleOptions = {
    onVersionChange,
    onBlocked,
    createChannel,
  };
  return {
    read: async (docId) =>
      readEntry(
        await transact(
          indexedDb,
          userId,
          "readonly",
          (s) => s.get(docId),
          lifecycle,
        ),
      ),
    write: async (docId, value) => {
      await transact(
        indexedDb,
        userId,
        "readwrite",
        (s) => s.put(value, docId),
        lifecycle,
      );
    },
    clear: async (docId) => {
      await transact(
        indexedDb,
        userId,
        "readwrite",
        (s) => s.delete(docId),
        lifecycle,
      );
    },
  };
}
