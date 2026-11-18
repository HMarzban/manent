import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Home, Storage } from "../src/index.ts";
import { openSqliteStorage } from "../src/index.ts";
import { storageContract } from "../src/testing/index.ts";
import {
  DOC,
  DOC2,
  HOME,
  PROJECT,
  checkpointsPath,
  corruptNewestCheckpoint,
  createTempTrees,
  dataVersion,
  doc,
  docPath,
  item,
  rawConnection,
  rawRows,
  rawSql,
} from "./raw.ts";

// every directory's path contains a space
const trees = createTempTrees("manent storage-");
const now = () => 1_000;
let dir: string;
let s: Storage;

storageContract(async (clock) => {
  const home = await trees.tree();
  let storage = openSqliteStorage({ dir: home, now: clock });
  return {
    storage,
    reopen: async () => {
      storage.close();
      storage = openSqliteStorage({ dir: home, now: clock });
      return storage;
    },
    dispose: async () => {
      storage.close();
    },
    corruptRow: (docId, seq) =>
      rawSql(
        docPath(home, HOME),
        "UPDATE doc_updates SET update_blob = CAST(x'ff' || substr(update_blob, 2) AS BLOB) WHERE doc_id = ?1 AND seq = ?2",
        docId,
        seq,
      ),
    // the newest row whose sha256 still matches its state
    corruptCheckpoint: (docId) =>
      corruptNewestCheckpoint(checkpointsPath(home, HOME), docId),
  };
});

beforeEach(async () => {
  dir = await trees.tree();
  s = openSqliteStorage({ dir, now });
  s.open(HOME);
});
afterEach(() => s.close());
afterAll(() => trees.removeAll());

test(
  "each kind of file gets its own name, beside the others",
  async () => {
    s.directory.place(DOC, HOME, "script", "sam");
    s.open(HOME).log.create(doc(DOC));
    s.open({ kind: "user", id: "dana" }).log.create(doc(DOC2));
    expect(
      (await readdir(dir)).filter((n) => n.endsWith(".sqlite")).toSorted(),
    ).toEqual([
      "control.sqlite",
      `project-${PROJECT}.sqlite`,
      "user-dana.sqlite",
    ]);
  },
  { timeout: 20_000 },
);

test(
  "every file is in write-ahead mode",
  () => {
    for (const file of ["control.sqlite", `project-${PROJECT}.sqlite`])
      expect(rawRows(join(dir, file), "PRAGMA journal_mode")).toEqual([
        { journal_mode: "wal" },
      ]);
  },
  { timeout: 20_000 },
);

test(
  "pushes of one turn share one durable commit",
  () => {
    const f = s.open(HOME);
    f.log.create(doc(DOC));
    // PRAGMA data_version changes when another connection has committed since this one last asked, so it is asked after every write
    const watcher = rawConnection(docPath(dir, HOME));
    let last = dataVersion(watcher);
    let commits = 0;
    const look = () => {
      const version = dataVersion(watcher);
      if (version !== last) commits += 1;
      last = version;
    };
    f.transaction(() => {
      for (let n = 1; n <= 50; n++) {
        f.log.append(item(n));
        look();
      }
    });
    look();
    expect(f.log.get(DOC)!.headSeq).toBe(50);
    expect(commits).toBe(1);
    // a lone write is its own commit
    for (let n = 51; n <= 53; n++) {
      f.log.append(item(n));
      look();
    }
    expect(commits).toBe(4);
    watcher.close();
  },
  { timeout: 20_000 },
);

test(
  "a path is never built from a name that could leave the directory",
  () => {
    for (const home of [
      { kind: "user", id: "../../etc" },
      { kind: "project", id: "x/../y" },
    ] as Home[])
      expect(() => s.open(home)).toThrow(RangeError);
    expect(
      readdirSync(dir).every(
        (n) =>
          n.startsWith("control.") ||
          n.startsWith("project-") ||
          n.startsWith("user-"),
      ),
    ).toBe(true);
  },
  { timeout: 20_000 },
);
