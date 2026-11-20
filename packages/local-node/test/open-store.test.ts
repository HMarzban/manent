import { afterAll, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { STORAGE_SCHEMA_VERSION } from "@manent/storage";
import { createTempTrees } from "@manent/testkit";
import {
  RECORDS_VERSION,
  STORE_MIGRATIONS,
  STORE_VERSION,
  openStore,
  storeVersion,
} from "../src/index.ts";

const trees = createTempTrees("manent-store-");
let root: string;

beforeEach(async () => {
  root = await trees.tree({});
});
afterAll(() => trees.removeAll());

const openFiles = (): void => {};
const NOW = 1_700_000_000_000;

function writeSqlite(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("CREATE TABLE IF NOT EXISTS t (v TEXT NOT NULL)");
  db.run("DELETE FROM t");
  db.run("INSERT INTO t (v) VALUES (?1)", [value]);
  db.close();
}

function readSqlite(path: string): string | null {
  const db = new Database(path, { readonly: true });
  const row = db.query<{ v: string }, []>("SELECT v FROM t").get();
  db.close();
  return row?.v ?? null;
}

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, "utf8"));

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => statSync(join(dir, path)).isFile())
    .toSorted();
}

// The -shm file is SQLite's shared-memory index, which any reader rewrites; it holds no data.
function digestOf(dir: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  for (const path of filesUnder(dir).filter((p) => !p.endsWith("-shm"))) {
    hash.update(relative(dir, join(dir, path)));
    hash.update(readFileSync(join(dir, path)));
  }
  return hash.digest("hex");
}

const dirs = (): string[] => readdirSync(root).toSorted();

const killed = (): never => {
  throw new RangeError("the migration was stopped");
};

function migrateToTwo(): void {
  openStore(root, { openFiles, version: 1 });
  writeSqlite(join(root, "store-1", "node", "a.sqlite"), "one");
  openStore(root, {
    openFiles,
    version: 2,
    migrations: {
      2: (dir) => writeSqlite(join(dir, "node", "a.sqlite"), "two"),
    },
  });
}

test("the store version moves with every file version inside it", () => {
  expect([storeVersion(3, 1, 1), STORE_VERSION]).toEqual([
    30101,
    storeVersion(STORAGE_SCHEMA_VERSION, RECORDS_VERSION, 1),
  ]);
  expect(() => storeVersion(100, 1, 1)).toThrow(RangeError);
  expect(() => storeVersion(3, 0, 1)).toThrow(RangeError);
  expect(() => storeVersion(3, 1, 1.5)).toThrow(RangeError);
  expect(STORE_MIGRATIONS).toEqual({});
});

test("a first launch makes store-1", () => {
  expect(openStore(root, { openFiles, version: 1 })).toEqual({
    ok: true,
    dir: join(root, "store-1"),
    version: 1,
    migratedFrom: null,
  });
  expect(readJson(join(root, "store.json"))).toEqual({ current: 1 });
  expect(dirs()).toEqual(["store-1", "store.json"]);
});

test("a newer version copies the store before it migrates it, and leaves the old one as it was", () => {
  openStore(root, { openFiles, version: 1 });
  writeSqlite(join(root, "store-1", "node", "a.sqlite"), "one");
  writeFileSync(join(root, "store-1", "notes.txt"), "not a database");
  const before = digestOf(join(root, "store-1"));
  const opened: string[] = [];
  const migrations = {
    2: (dir: string) => writeSqlite(join(dir, "node", "a.sqlite"), "two"),
  };
  expect(
    openStore(root, {
      openFiles: (dir) => opened.push(dir),
      version: 2,
      migrations,
    }),
  ).toEqual({
    ok: true,
    dir: join(root, "store-2"),
    version: 2,
    migratedFrom: 1,
  });
  expect(opened).toEqual([join(root, "store-2.partial")]);
  expect(digestOf(join(root, "store-1"))).toBe(before);
  expect(readSqlite(join(root, "store-2", "node", "a.sqlite"))).toBe("two");
  expect(existsSync(join(root, "store-2", "notes.txt"))).toBe(false);
  expect(readJson(join(root, "store.json"))).toEqual({ current: 2 });
});

test("rolling back opens the old copy", () => {
  migrateToTwo();
  const newer = digestOf(join(root, "store-2"));
  expect(openStore(root, { openFiles, version: 1 })).toEqual({
    ok: true,
    dir: join(root, "store-1"),
    version: 1,
    migratedFrom: null,
  });
  expect(readJson(join(root, "store.json"))).toEqual({ current: 1 });
  expect(digestOf(join(root, "store-2"))).toBe(newer);
});

test("moving forward again replaces the stale copy and keeps it aside", () => {
  migrateToTwo();
  openStore(root, { openFiles, version: 1 });
  writeSqlite(join(root, "store-1", "node", "a.sqlite"), "one, again");
  const stale = digestOf(join(root, "store-2"));
  expect(openStore(root, { openFiles, version: 2, now: () => NOW })).toEqual({
    ok: true,
    dir: join(root, "store-2"),
    version: 2,
    migratedFrom: 1,
  });
  expect(readSqlite(join(root, "store-2", "node", "a.sqlite"))).toBe(
    "one, again",
  );
  expect(digestOf(join(root, `store-2.superseded-${NOW}`))).toBe(stale);
  expect(dirs()).toEqual([
    "store-1",
    "store-2",
    `store-2.superseded-${NOW}`,
    "store.json",
  ]);
});

test("a store newer than this build, with no copy of its own, is refused", () => {
  writeFileSync(join(root, "store.json"), JSON.stringify({ current: 3 }));
  writeSqlite(join(root, "store-3", "node", "a.sqlite"), "three");
  expect(openStore(root, { openFiles, version: 2 })).toEqual({
    ok: false,
    reason: "newer_store",
  });
});

test("a migration that was killed leaves the old store and is started again", () => {
  openStore(root, { openFiles, version: 1 });
  writeSqlite(join(root, "store-1", "node", "a.sqlite"), "one");
  expect(() =>
    openStore(root, { openFiles, version: 2, migrations: { 2: killed } }),
  ).toThrow(RangeError);
  expect(existsSync(join(root, "store-2.partial"))).toBe(true);
  expect(readJson(join(root, "store.json"))).toEqual({ current: 1 });
  writeFileSync(join(root, "store-2.partial", "left.txt"), "from the crash");
  expect(openStore(root, { openFiles, version: 2 })).toEqual({
    ok: true,
    dir: join(root, "store-2"),
    version: 2,
    migratedFrom: 1,
  });
  expect(filesUnder(join(root, "store-2"))).toEqual(["node/a.sqlite"]);
  expect(dirs()).toEqual(["store-1", "store-2", "store.json"]);
});

test("a store found without its store.json is the newest this build can open", () => {
  writeSqlite(join(root, "store-1", "node", "a.sqlite"), "one");
  writeSqlite(join(root, "store-3", "node", "a.sqlite"), "three");
  expect(openStore(root, { openFiles, version: 2 })).toEqual({
    ok: true,
    dir: join(root, "store-2"),
    version: 2,
    migratedFrom: 1,
  });
  expect(readSqlite(join(root, "store-2", "node", "a.sqlite"))).toBe("one");
  writeFileSync(join(root, "store.json"), "{ damaged");
  expect(openStore(root, { openFiles, version: 1 })).toEqual({
    ok: true,
    dir: join(root, "store-1"),
    version: 1,
    migratedFrom: null,
  });
  expect(readJson(join(root, "store.json"))).toEqual({ current: 1 });
});

test("a refused newer store is left exactly as it was", () => {
  writeFileSync(join(root, "store.json"), JSON.stringify({ current: 3 }));
  writeSqlite(join(root, "store-3", "node", "a.sqlite"), "three");
  mkdirSync(join(root, "store-2.partial"));
  const before = [digestOf(root), dirs()];
  openStore(root, { openFiles, version: 2 });
  expect([digestOf(root), dirs()]).toEqual(before);
});
