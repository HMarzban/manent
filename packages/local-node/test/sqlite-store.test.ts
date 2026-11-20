import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { localStoreContract } from "@manent/sync-client/testing";
import type {
  DeviceVersion,
  DocMeta,
  RecoveredItem,
  StoredUpdate,
} from "@manent/sync-client";
import { createTempTrees } from "@manent/testkit";
import fc from "fast-check";
import { SQLITE_STORE_VERSION, openSqliteLocalStore } from "../src/index.ts";

const trees = createTempTrees("manent-outbox-");
afterAll(() => trees.removeAll());

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const now = () => 1_700_000_000_000;

localStoreContract({ test, expect }, async () => {
  const dir = await trees.tree({});
  const opened: { close(): Promise<void> }[] = [];
  return {
    async open(userId) {
      const store = openSqliteLocalStore({
        path: join(dir, `${userId}.sqlite`),
        userId,
        now,
      });
      opened.push(store);
      return store;
    },
    async dispose() {
      await Promise.all(opened.map((store) => store.close()));
      await rm(dir, { recursive: true, force: true });
    },
  };
});

const META: DocMeta = {
  docId: DOC,
  generation: 1,
  lastServerSeq: 0,
  clientIds: [7],
  ackedClocks: {},
  neverSynced: false,
  create: null,
  parked: null,
  recovering: null,
  lastDeviceVersionAt: 0,
  lastSyncedAt: null,
  moving: null,
};

const own = (localSeq: number): StoredUpdate => ({
  kind: "update",
  localSeq,
  update: new Uint8Array([localSeq, 1, 2]),
  own: true,
  acked: false,
  applied: true,
  elements: [`b${localSeq}`],
});

test("what the store said it wrote survives a reopen", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  const first = openSqliteLocalStore({ path, userId: "sam", now });
  await first.create(META);
  for (const n of [1, 2, 3]) await first.append(DOC, own(n));
  await first.acknowledge(DOC, 2, { lastServerSeq: 9 });
  await first.close();
  const again = openSqliteLocalStore({ path, userId: "sam", now });
  expect(await again.load(DOC)).toEqual({
    meta: { ...META, lastServerSeq: 9 },
    checkpoint: null,
    syncedBase: null,
    entries: [{ ...own(1), acked: true }, { ...own(2), acked: true }, own(3)],
  });
  await again.close();
});

test("an outbox file from a newer version is refused unchanged", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  const db = new Database(path, { create: true });
  db.run(`PRAGMA user_version = ${SQLITE_STORE_VERSION + 1}`);
  db.close();
  const before = readFileSync(path);
  expect(() => openSqliteLocalStore({ path, userId: "sam", now })).toThrow(
    new RangeError("an upstream outbox from a newer version"),
  );
  expect(readFileSync(path)).toEqual(before);
});

const text = fc.string({ maxLength: 6 });
const int = fc.nat({ max: 2 ** 40 });
const nullable = <T>(value: fc.Arbitrary<T>) => fc.option(value, { nil: null });
const ATTRS = ["element", "align", "id"] as const;
const attrs = fc.dictionary(
  fc.constantFrom(...ATTRS),
  fc.oneof(text, int, fc.constant(null)),
  { maxKeys: 2, noNullPrototype: true },
);
const block = fc.record(
  {
    type: fc.constant("block" as const),
    attrs,
    content: fc.array(
      fc.record(
        {
          type: fc.constant("text" as const),
          text,
          marks: fc.array(
            fc.record({ type: text, attrs }, { requiredKeys: ["type"] }),
            { maxLength: 2 },
          ),
        },
        { requiredKeys: ["type", "text"] },
      ),
      { maxLength: 2 },
    ),
  },
  { requiredKeys: ["type"] },
);
const content = fc.record(
  {
    type: fc.constant("doc" as const),
    content: fc.array(
      fc.record(
        {
          type: fc.constant("section" as const),
          content: fc.array(block, { maxLength: 2 }),
        },
        { requiredKeys: ["type"] },
      ),
      { maxLength: 2 },
    ),
  },
  { requiredKeys: ["type"] },
);
const meta = fc.record({
  generation: int,
  lastServerSeq: int,
  clientIds: fc.array(int, { maxLength: 3 }),
  ackedClocks: fc.dictionary(text, int, { maxKeys: 3, noNullPrototype: true }),
  neverSynced: fc.boolean(),
  create: nullable(
    fc.record({ kind: text, home: text, workspaceId: nullable(text) }),
  ),
  parked: nullable(
    fc.record({
      reason: fc.constantFrom("access_removed", "deleted"),
      parkedAt: int,
    }),
  ),
  recovering: nullable(
    fc.record({ versionId: text, heal: fc.boolean(), replaying: fc.boolean() }),
  ),
  lastDeviceVersionAt: int,
  lastSyncedAt: nullable(int),
  moving: nullable(
    fc.record({
      from: int,
      to: int,
      key: nullable(text),
      throughLocalSeq: int,
    }),
  ),
});
const version = fc.record({
  kind: fc.constantFrom("device", "recovered"),
  label: fc.constantFrom(
    "session_end",
    "hourly",
    "before_reconnect",
    "manual",
    "rejected",
    "past_window",
  ),
  createdAt: int,
  content,
});
const item = fc.record({
  blockId: nullable(text),
  nearBlockId: nullable(text),
  text,
  recoveredAt: int,
  cause: fc.constantFrom("merge", "rejected", "overlap"),
  mine: nullable(block),
  theirs: nullable(block),
  otherClientIds: fc.array(int, { maxLength: 2 }),
});

test("what the outbox holds as JSON reads back as it was written, whatever its fields hold", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  const store = openSqliteLocalStore({ path, userId: "sam", now });
  let n = 0;
  await fc.assert(
    fc.asyncProperty(meta, version, item, async (fields, kept, set) => {
      n += 1;
      const docId = `doc-${n}`;
      const written: DocMeta = { docId, ...fields };
      const saved: DeviceVersion = {
        id: `version-${n}`,
        docId,
        uploaded: false,
        ...kept,
      };
      const aside: RecoveredItem = { id: `item-${n}`, docId, ...set };
      await store.create(written);
      await store.addVersion(saved);
      await store.markApplied(docId, 0, [aside]);
      expect([
        (await store.load(docId))?.meta,
        await store.versions(docId),
        await store.recovered(docId),
      ]).toEqual([written, [saved], [aside]]);
    }),
    { numRuns: 200 },
  );
  await store.close();
});

/** Every place inside a value that holds a field, nested objects and lists included. */
function slots(value: unknown, path: readonly string[] = []): string[][] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    [...path, key],
    ...slots(inner, [...path, key]),
  ]);
}

test("stored meta with any field changed is read as written or refused as unreadable", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  await openSqliteLocalStore({ path, userId: "sam", now }).close();
  const db = new Database(path, { strict: true });
  const store = openSqliteLocalStore({ path, userId: "sam", now });
  const near = fc
    .tuple(meta, fc.nat(), fc.jsonValue())
    .map(([fields, pick, value]) => {
      const stored: unknown = JSON.parse(
        JSON.stringify({ docId: DOC, ...fields }),
      );
      const places = slots(stored);
      const place = places[pick % places.length]!;
      let parent = stored as Record<string, unknown>;
      for (const key of place.slice(0, -1))
        parent = parent[key] as Record<string, unknown>;
      parent[place.at(-1)!] = value;
      return JSON.stringify(stored);
    });
  await fc.assert(
    fc.asyncProperty(near, async (stored) => {
      db.run("DELETE FROM meta");
      db.run(
        "INSERT INTO meta (doc_id, meta, highest_local_seq) VALUES (?1, ?2, 0)",
        [DOC, stored],
      );
      const read = await store.load(DOC).then(
        (loaded) => loaded?.meta,
        (error: unknown) => error,
      );
      if (read instanceof TypeError)
        expect(read.message).toBe(
          "an outbox file holds a document meta it cannot read",
        );
      else expect(read).toEqual(JSON.parse(stored));
    }),
    { numRuns: 500 },
  );
  db.close();
  await store.close();
});

test("a recovered item stored before overlaps carried wordings reads with none", async () => {
  const path = join(await trees.tree({}), "sam.sqlite");
  const store = openSqliteLocalStore({ path, userId: "sam", now });
  const stored = {
    id: "item-1",
    docId: DOC,
    blockId: "b1",
    nearBlockId: null,
    text: "A lamp.",
    recoveredAt: 5,
    cause: "merge" as const,
  };
  const db = new Database(path, { strict: true });
  db.run("INSERT INTO recovered (id, doc_id, item) VALUES (?1, ?2, ?3)", [
    stored.id,
    DOC,
    JSON.stringify(stored),
  ]);
  db.close();
  expect(await store.recovered(DOC)).toEqual([
    { ...stored, mine: null, theirs: null, otherClientIds: [] },
  ]);
  await store.close();
});
