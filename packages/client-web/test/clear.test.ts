import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import {
  clearManentData,
  hasLocalDatabase,
  openIdbStore,
} from "../src/index.ts";

/** Creates a database of another application with raw IndexedDB calls, and leaves it open. */
function rawOpen(indexedDb: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = indexedDb.open(name);
  return new Promise((resolve) =>
    request.addEventListener("success", () => resolve(request.result)),
  );
}

/** A browser that refuses to list its databases. */
function refusingListing(): IDBFactory {
  return Object.assign(new IDBFactory(), {
    databases: () => Promise.reject(new DOMException("", "UnknownError")),
  });
}

/** A Web Storage area held in memory. */
class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  get length(): number {
    return this.#items.size;
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
  clear(): void {
    this.#items.clear();
  }
}

/** A Web Storage area the browser refuses to open, as with storage blocked for the site. */
class RefusingStorage extends MemoryStorage {
  override get length(): number {
    throw new DOMException("storage is blocked", "SecurityError");
  }
}

test("everything Manent kept in this browser is cleared but the device's identity, and nothing else", async () => {
  const indexedDb = new IDBFactory();
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  await openIdbStore({ userId: "dana", indexedDb });
  await rawOpen(indexedDb, "other-app");
  local.setItem("manent.seed", "s1");
  local.setItem("theirs", "x");
  local.setItem("manent.device.id", "d1");
  session.setItem("manent.demo.session", "{}");
  await clearManentData({ indexedDb, local, session });
  expect([
    (await indexedDb.databases()).map((d) => d.name),
    local.getItem("manent.seed"),
    local.getItem("theirs"),
    local.getItem("manent.device.id"),
    session.getItem("manent.demo.session"),
  ]).toEqual([["other-app"], null, "x", "d1", null]);
});

test("clearing passes over a store that is missing or refuses", async () => {
  const indexedDb = new IDBFactory();
  const session = new MemoryStorage();
  await openIdbStore({ userId: "dana", indexedDb });
  session.setItem("manent.demo.session", "{}");
  await clearManentData({
    indexedDb: null,
    local: new RefusingStorage(),
    session,
  });
  await clearManentData({
    indexedDb: refusingListing(),
    local: null,
    session: null,
  });
  expect([
    (await indexedDb.databases()).map((d) => d.name),
    session.getItem("manent.demo.session"),
  ]).toEqual([["manent:dana"], null]);
});

test("whether a person's store exists is told without creating it", async () => {
  const indexedDb = new IDBFactory();
  expect(await hasLocalDatabase(indexedDb, "dana")).toBe(false);
  expect((await indexedDb.databases()).map((d) => d.name)).toEqual([]);
  await openIdbStore({ userId: "dana", indexedDb });
  expect(await hasLocalDatabase(indexedDb, "dana")).toBe(true);
  expect(await hasLocalDatabase(indexedDb, "sam")).toBe(false);
  const unlisted = Object.assign(new IDBFactory(), { databases: undefined });
  expect(await hasLocalDatabase(unlisted, "dana")).toBeNull();
  expect(await hasLocalDatabase(refusingListing(), "dana")).toBeNull();
  expect(await hasLocalDatabase(null, "dana")).toBeNull();
});
