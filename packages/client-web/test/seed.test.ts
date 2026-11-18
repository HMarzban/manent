import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { forgetOnNewSeed, openIdbStore } from "../src/index.ts";

/** Creates a database of another application with raw IndexedDB calls, and leaves it open. */
function rawOpen(indexedDb: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = indexedDb.open(name);
  return new Promise((resolve) =>
    request.addEventListener("success", () => resolve(request.result)),
  );
}

test("a new seed forgets everything stored for every person; the same seed forgets nothing", async () => {
  const indexedDb = new IDBFactory();
  await openIdbStore({ userId: "dana", indexedDb });
  await openIdbStore({ userId: "you", indexedDb });
  await rawOpen(indexedDb, "other-app");
  const kept: { seedId: string | null } = { seedId: null };
  const memory = {
    read: () => kept.seedId,
    write: (id: string) => {
      kept.seedId = id;
    },
  };
  // nothing remembered yet: only write it down
  expect(
    await forgetOnNewSeed({ indexedDb, seedId: "s1", remembered: memory }),
  ).toBe(false);
  expect(kept.seedId).toBe("s1");
  expect(
    await forgetOnNewSeed({ indexedDb, seedId: "s1", remembered: memory }),
  ).toBe(false);
  expect((await indexedDb.databases()).map((d) => d.name).toSorted()).toEqual([
    "manent:dana",
    "manent:you",
    "other-app",
  ]);
  expect(
    await forgetOnNewSeed({ indexedDb, seedId: "s2", remembered: memory }),
  ).toBe(true);
  expect((await indexedDb.databases()).map((d) => d.name)).toEqual([
    "other-app",
  ]);
  expect(kept.seedId).toBe("s2");
});
