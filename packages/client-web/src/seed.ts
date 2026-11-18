// The demo's reseed: a new seed on the server makes every person's local copy stale.
import { StoreError } from "@manent/sync-client";
import { localDatabaseName } from "./idb-store.ts";

// every person's database name starts with this
const PREFIX = localDatabaseName("");

function deleteDatabase(indexedDb: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(name);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () =>
      reject(new StoreError("unavailable", { cause: request.error })),
    );
  });
}

/**
 * When the remembered seed is neither null nor `seedId`, deletes every person's
 * database; then remembers `seedId`. Answers whether it deleted. Called before any
 * store is opened; rejects StoreError("unavailable") when a database cannot be deleted.
 */
export async function forgetOnNewSeed(options: {
  indexedDb: IDBFactory;
  seedId: string;
  remembered: { read(): string | null; write(seedId: string): void };
}): Promise<boolean> {
  const { indexedDb, seedId, remembered } = options;
  const previous = remembered.read();
  const forget = previous !== null && previous !== seedId;
  if (forget) {
    const names = (await indexedDb.databases()).flatMap(({ name }) =>
      name?.startsWith(PREFIX) ? [name] : [],
    );
    await Promise.all(names.map((name) => deleteDatabase(indexedDb, name)));
  }
  remembered.write(seedId);
  return forget;
}
