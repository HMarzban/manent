import { expect, test } from "bun:test";
import type { CachedProduction } from "@manent/sync-client";
import type { ProductionState } from "@manent/sync-protocol";
import { IDBFactory } from "fake-indexeddb";
import { createIdbProductionCache, forgetOnNewSeed } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const OTHER = "7c1e2a90-4b5d-4f3e-8a21-93d0c6b5e4f2";

function state(docId: string, headSeq: number): ProductionState {
  return {
    v: 1,
    docId,
    headSeq,
    locked: true,
    lockLevel: 1,
    lockedOn: "2026-11-16",
    numbering: "suffix",
    colourOrder: ["white", "blue"],
    anchors: [],
    sceneNumbers: [{ blockId: "block-one-000001", num: "1", reserved: false }],
    sets: [],
    issues: [],
  };
}

const LOCKED: CachedProduction = {
  state: state(DOC, 3),
  baseline: {
    versionId: "version-white",
    content: {
      v: 1,
      blocks: [
        { type: "block", attrs: { id: "block-one-000001", type: "action" } },
      ],
      settings: { "script.numbering": "suffix" },
      schemaVersion: 1,
      engineVersion: 1,
      locks: [],
      authors: {},
    },
  },
};

/** Writes `value` under `key` into the cache's store with raw IndexedDB calls, as another build might have. */
async function rawPut(
  indexedDb: IDBFactory,
  key: string,
  value: unknown,
): Promise<void> {
  const opened = indexedDb.open("manent:production:sam");
  const db = await new Promise<IDBDatabase>((resolve) =>
    opened.addEventListener("success", () => resolve(opened.result)),
  );
  const tx = db.transaction("production", "readwrite");
  tx.objectStore("production").put(value, key);
  await new Promise((resolve) => tx.addEventListener("complete", resolve));
  db.close();
}

test("the production cache keeps one entry per document and survives a reopen", async () => {
  const indexedDb = new IDBFactory();
  const first = createIdbProductionCache({ userId: "sam", indexedDb });
  await first.write(DOC, { state: state(DOC, 2), baseline: null });
  await first.write(DOC, LOCKED);
  await first.write(OTHER, { state: state(OTHER, 1), baseline: null });
  const reopened = createIdbProductionCache({ userId: "sam", indexedDb });
  const kept = [await reopened.read(DOC), await reopened.read(OTHER)];
  const names = (await indexedDb.databases()).map((d) => d.name);
  await reopened.clear(OTHER);
  const cleared = await reopened.read(OTHER);
  await rawPut(indexedDb, OTHER, {
    state: { ...state(OTHER, 1), v: 2 },
    baseline: null,
  });
  const damaged = await reopened.read(OTHER);
  const memory = {
    seedId: "s1",
    read: () => memory.seedId,
    write: (id: string) => void (memory.seedId = id),
  };
  await forgetOnNewSeed({ indexedDb, seedId: "s2", remembered: memory });
  expect([
    kept,
    names,
    cleared,
    damaged,
    (await indexedDb.databases()).map((d) => d.name),
    await reopened.read(DOC),
  ]).toEqual([
    [LOCKED, { state: state(OTHER, 1), baseline: null }],
    ["manent:production:sam"],
    null,
    null,
    [],
    null,
  ]);
});
