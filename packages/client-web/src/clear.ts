// What Manent keeps in this browser: telling whether a person's store exists, and clearing it all.
import { localDatabaseName } from "./idb-store.ts";

// every person's database name starts with this
const DATABASE_PREFIX = localDatabaseName("");

const KEY_PREFIX = "manent.";

// the device's identity outlives a clear, so the device can still be told what it held
const DEVICE_ID_KEY = "manent.device.id";

/** Answers null when there is no IndexedDB or the browser cannot list its databases; never opens one. */
export async function hasLocalDatabase(
  indexedDb: IDBFactory | null,
  userId: string,
): Promise<boolean | null> {
  if (typeof indexedDb?.databases !== "function") return null;
  const name = localDatabaseName(userId);
  try {
    return (await indexedDb.databases()).some((info) => info.name === name);
  } catch {
    // a browser that refuses the listing cannot say, which is what null means
    return null;
  }
}

function deleteDatabase(indexedDb: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(name);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
}

async function clearDatabases(indexedDb: IDBFactory): Promise<void> {
  const names = (await indexedDb.databases()).flatMap(({ name }) =>
    name?.startsWith(DATABASE_PREFIX) ? [name] : [],
  );
  // a database that cannot be deleted is passed over; the others are still deleted
  await Promise.allSettled(
    names.map((name) => deleteDatabase(indexedDb, name)),
  );
}

function clearKeys(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const key of keys)
    if (key?.startsWith(KEY_PREFIX) && key !== DEVICE_ID_KEY)
      storage.removeItem(key);
}

/**
 * Deletes every person's database and every `manent.` key of both storages but the
 * device's identity. A store that is null or throws is passed over, so the call never rejects.
 */
export async function clearManentData(options: {
  indexedDb: IDBFactory | null;
  local: Storage | null;
  session: Storage | null;
}): Promise<void> {
  const { indexedDb, local, session } = options;
  for (const storage of [local, session]) {
    try {
      if (storage) clearKeys(storage);
    } catch {
      // a storage the browser blocks holds nothing Manent can clear
    }
  }
  try {
    if (indexedDb) await clearDatabases(indexedDb);
  } catch {
    // a browser that cannot list its databases leaves none that can be found
  }
}
