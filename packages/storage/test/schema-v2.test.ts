import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import {
  crc32,
  openSqliteStorage,
  STORAGE_SCHEMA_VERSION,
} from "../src/index.ts";
// the entry does not export the migrations: no other workspace reads them
import { MIGRATIONS } from "../src/sqlite/migrations.ts";
import {
  DOC,
  HOME,
  checkpointsPath,
  createTempTrees,
  docPath,
  rawSql,
  userVersion,
} from "./raw.ts";

const trees = createTempTrees("manent storage-");
afterAll(() => trees.removeAll());

// A file as the first schema left it: that migration's statements alone, and its version.
async function firstSchemaFile(
  path: string,
  statements: readonly string[],
): Promise<void> {
  await Bun.write(path, "");
  for (const statement of statements) rawSql(path, statement);
  rawSql(path, "PRAGMA user_version = 1");
}

test("the second migration appends one entry to each list", () => {
  expect(MIGRATIONS.control[1]).toEqual([]);
});

test("a file written by the first schema opens, keeps its rows and gains the new tables", async () => {
  const dir = await trees.tree();
  const files = {
    control: join(dir, "control.sqlite"),
    documents: docPath(dir, HOME),
    checkpoints: checkpointsPath(dir, HOME),
  };
  for (const kind of ["control", "documents", "checkpoints"] as const)
    await firstSchemaFile(files[kind], MIGRATIONS[kind][0] ?? []);
  rawSql(
    files.documents,
    "INSERT INTO documents (id, kind, schema_version, created_at) VALUES (?1, 'script', 1, 500)",
    DOC,
  );
  for (const seq of [1, 2])
    rawSql(
      files.documents,
      `INSERT INTO doc_updates (doc_id, generation, seq, update_blob, crc32, user_id, created_at)
       VALUES (?1, 1, ?2, CAST(char(?2) AS BLOB), ?3, 'sam', 500)`,
      DOC,
      seq,
      crc32(new Uint8Array([seq])),
    );
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  const file = storage.open(HOME);
  const opened = {
    tail: file.log.tail(DOC, 1, 0).rows,
    generations: file.generations.list(DOC),
    measure: file.measures.get(DOC, 1),
  };
  storage.close();
  expect(opened).toEqual({
    tail: [1, 2].map((seq) => ({
      seq,
      update: new Uint8Array([seq]),
      userId: "sam",
      origin: "edit",
      createdAt: 500,
    })),
    generations: [],
    measure: null,
  });
  expect(Object.values(files).map(userVersion)).toEqual([
    STORAGE_SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
  ]);
});
