import { afterAll, expect, test } from "bun:test";
import {
  crc32,
  openSqliteStorage,
  STORAGE_SCHEMA_VERSION,
  StorageError,
} from "../src/index.ts";
// the entry does not export the migrations: no other workspace reads them
import { MIGRATIONS } from "../src/sqlite/migrations.ts";
import {
  DOC,
  HOME,
  createTempTrees,
  doc,
  docPath,
  item,
  rawRows,
  rawSql,
  userVersion,
} from "./raw.ts";

const trees = createTempTrees("manent storage-");
afterAll(() => trees.removeAll());

const ADOPTIONS_TABLE =
  "CREATE TABLE doc_adoptions (doc_id TEXT PRIMARY KEY, key TEXT NOT NULL, user_id TEXT NOT NULL, seq INTEGER NOT NULL, adopted_at INTEGER NOT NULL) STRICT, WITHOUT ROWID";

const collapse = (sql: string): string => sql.replace(/\s+/g, " ").trim();

test("the third migration adds the adoption table and nothing else", async () => {
  expect([MIGRATIONS.control[2], MIGRATIONS.checkpoints[2]]).toEqual([[], []]);
  expect(MIGRATIONS.documents[2]?.map(collapse)).toEqual([ADOPTIONS_TABLE]);
  const dir = await trees.tree();
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  storage.open(HOME);
  storage.close();
  expect(
    rawRows(
      docPath(dir, HOME),
      "SELECT sql FROM sqlite_master WHERE name = 'doc_adoptions'",
    ).map((row) => collapse((row as { sql: string }).sql)),
  ).toEqual([ADOPTIONS_TABLE]);
});

test("a file written at version 2 is carried to 3 and keeps its rows", async () => {
  const dir = await trees.tree();
  const path = docPath(dir, HOME);
  await Bun.write(path, "");
  for (const statement of [
    ...(MIGRATIONS.documents[0] ?? []),
    ...(MIGRATIONS.documents[1] ?? []),
  ])
    rawSql(path, statement);
  rawSql(path, "PRAGMA user_version = 2");
  rawSql(
    path,
    "INSERT INTO documents (id, kind, schema_version, created_at) VALUES (?1, 'script', 1, 500)",
    DOC,
  );
  rawSql(
    path,
    `INSERT INTO doc_updates (doc_id, generation, seq, update_blob, crc32, user_id, created_at)
     VALUES (?1, 1, 1, x'01', ?2, 'sam', 500)`,
    DOC,
    crc32(new Uint8Array([1])),
  );
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  const file = storage.open(HOME);
  const opened = {
    tail: file.log.tail(DOC, 1, 0).rows,
    adoption: file.adoptions.get(DOC),
  };
  storage.close();
  expect(opened).toEqual({
    tail: [
      {
        seq: 1,
        update: new Uint8Array([1]),
        userId: "sam",
        origin: "edit",
        createdAt: 500,
      },
    ],
    adoption: null,
  });
  expect(userVersion(path)).toBe(STORAGE_SCHEMA_VERSION);
  expect(rawRows(path, "SELECT * FROM doc_adoptions")).toEqual([]);
});

test("a file from a newer version is refused unchanged", async () => {
  const dir = await trees.tree();
  const path = docPath(dir, HOME);
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  storage.open(HOME).log.create(doc(DOC));
  storage.open(HOME).log.append(item(1));
  storage.close();
  rawSql(path, `PRAGMA user_version = ${STORAGE_SCHEMA_VERSION + 1}`);
  const before = await Bun.file(path).bytes();
  const again = openSqliteStorage({ dir, now: () => 1_000 });
  let refused: unknown = null;
  try {
    again.open(HOME);
  } catch (error) {
    refused = error;
  } finally {
    again.close();
  }
  expect(refused).toBeInstanceOf(StorageError);
  expect((refused as StorageError).code).toBe("corrupt");
  expect(await Bun.file(path).bytes()).toEqual(before);
  expect(userVersion(path)).toBe(STORAGE_SCHEMA_VERSION + 1);
});
