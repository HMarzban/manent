// What the SQLite tests read and write behind the driver's back, through connections of their own.
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppendItem, Home } from "../src/index.ts";
import { sha256, StorageError } from "../src/index.ts";

export const PROJECT = "0b9f3c1e-6d2a-4e8b-9f1a-2c3d4e5f6a7b";
export const HOME: Home = { kind: "project", id: PROJECT };
export const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
export const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";

/** Fresh directories under the system's temporary directory, each removed by `removeAll`. */
export function createTempTrees(prefix: string): {
  tree(): Promise<string>;
  removeAll(): Promise<void>;
} {
  const made: string[] = [];
  return {
    async tree() {
      const dir = await mkdtemp(join(tmpdir(), prefix));
      made.push(dir);
      return dir;
    },
    async removeAll() {
      const dirs = made.splice(0);
      await Promise.all(
        dirs.map((dir) => rm(dir, { recursive: true, force: true })),
      );
    },
  };
}

export const docPath = (dir: string, home: Home): string =>
  join(dir, `${home.kind}-${home.id}.sqlite`);

export const checkpointsPath = (dir: string, home: Home): string =>
  join(dir, `${home.kind}-${home.id}.checkpoints.sqlite`);

/** A connection of the test's own to a file that must already exist. */
export const rawConnection = (path: string): Database =>
  new Database(path, { readwrite: true, create: false });

export function rawRows(path: string, sql: string): unknown[] {
  const db = rawConnection(path);
  try {
    return db.query(sql).all();
  } finally {
    db.close();
  }
}

export function rawSql(
  path: string,
  sql: string,
  ...params: (string | number)[]
): void {
  const db = rawConnection(path);
  try {
    db.run(sql, params);
  } finally {
    db.close();
  }
}

/** Rises by one for each commit another connection makes to the file. */
export const dataVersion = (db: Database): number =>
  db.query<{ data_version: number }, []>("PRAGMA data_version").get()
    ?.data_version ?? 0;

export function userVersion(path: string): number {
  const db = rawConnection(path);
  try {
    const row = db
      .query<{ user_version: number }, []>("PRAGMA user_version")
      .get();
    return row?.user_version ?? 0;
  } finally {
    db.close();
  }
}

/** Every table of the file, each as its columns written "<name> <type>". */
export function tableColumns(path: string): Record<string, string[]> {
  const db = rawConnection(path);
  try {
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all();
    return Object.fromEntries(
      tables.map(({ name }) => [
        name,
        db
          .query<{ name: string; type: string }, [string]>(
            "SELECT name, type FROM pragma_table_info(?1)",
          )
          .all(name)
          .map((column) => `${column.name} ${column.type}`),
      ]),
    );
  } finally {
    db.close();
  }
}

export const tableNames = (path: string): string[] =>
  Object.keys(tableColumns(path));

export function integrityCheck(path: string): string | null {
  const db = rawConnection(path);
  try {
    const query = "PRAGMA integrity_check";
    const row = db.query<{ integrity_check: string }, []>(query).get();
    return row?.integrity_check ?? null;
  } finally {
    db.close();
  }
}

/** Flips the first byte of the newest checkpoint of `docId` whose sha256 still matches its state. */
export function corruptNewestCheckpoint(path: string, docId: string): void {
  const db = rawConnection(path);
  try {
    const rows = db
      .query<
        { generation: number; seq: number; state: Uint8Array; sha: Uint8Array },
        [string]
      >(
        "SELECT generation, seq, state, sha256 AS sha FROM doc_checkpoints WHERE doc_id = ?1 ORDER BY generation DESC, seq DESC",
      )
      .all(docId);
    const newest = rows.find(
      (row) => sha256(row.state).toHex() === row.sha.toHex(),
    );
    if (newest === undefined) return;
    const state = newest.state.map((byte, i) => (i === 0 ? byte ^ 0xff : byte));
    db.run(
      "UPDATE doc_checkpoints SET state = ?1 WHERE doc_id = ?2 AND generation = ?3 AND seq = ?4",
      [state, docId, newest.generation, newest.seq],
    );
  } finally {
    db.close();
  }
}

/** The sequences a crash child reports as committed within `ms` of its first report, or until it exits. */
export async function readLinesFor(
  child: { stdout: ReadableStream<Uint8Array> },
  ms: number,
): Promise<number[]> {
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  const reported: number[] = [];
  let text = "";
  let deadline: Promise<"over"> | null = null;
  for (;;) {
    const next = reader.read();
    const read = await (deadline === null
      ? next
      : Promise.race([next, deadline]));
    if (read === "over" || read.done) break;
    text += decoder.decode(read.value, { stream: true });
    const lines = text.split("\n");
    text = lines.pop() ?? "";
    for (const line of lines)
      reported.push(Number(line.slice("committed ".length)));
    deadline ??= new Promise((resolve) =>
      setTimeout(() => resolve("over"), ms),
    );
  }
  reader.releaseLock();
  return reported;
}

export const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The code of the StorageError `fn` throws; null when it throws nothing. Any other error is thrown on. */
export function codeOf(fn: () => unknown): StorageError["code"] | null {
  try {
    fn();
  } catch (error) {
    if (error instanceof StorageError) return error.code;
    throw error;
  }
  return null;
}

export const item = (n: number): AppendItem => ({
  docId: DOC,
  generation: 1,
  update: new Uint8Array([n]),
  userId: "sam",
  origin: "edit",
  clocks: [{ clientId: 7, clock: n }],
});

export const doc = (id: string) => ({
  id,
  kind: "script",
  ownerUserId: null,
  schemaVersion: 1,
  engineVersion: 0,
});
