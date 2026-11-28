import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import type { Storage, VersionRow } from "../src/index.ts";
import { openSqliteStorage, StorageError } from "../src/index.ts";
import { connectionOf } from "../src/sqlite/doc-file.ts";
import { openDatabase } from "../src/sqlite/files.ts";
import { createMemoryStorage } from "../src/testing/index.ts";
import {
  DOC,
  DOC2,
  HOME,
  checkpointsPath,
  createTempTrees,
  doc,
  docPath,
  dataVersion,
  item,
  rawConnection,
  rawRows,
  rawSql,
} from "./raw.ts";

const trees = createTempTrees("manent-queries-");
afterAll(() => trees.removeAll());

const now = () => 1_000;

const versionRow = (
  id: string,
  seq: number,
  createdAt: number,
): VersionRow => ({
  id,
  docId: DOC,
  generation: 1,
  seq,
  kind: "auto",
  name: null,
  createdByUserId: "sam",
  createdAt,
  deviceId: null,
});

test("storage connections default to full durability and set cache and temporary store pragmas", async () => {
  const dirDefault = await trees.tree();
  const sDefault = openSqliteStorage({ dir: dirDefault, now });
  const fDefault = sDefault.open(HOME);
  fDefault.log.create(doc(DOC));
  fDefault.checkpoints.newest(DOC, 1);

  const primaryDb = connectionOf(fDefault)!;
  expect(
    primaryDb.query<{ synchronous: number }, []>("PRAGMA synchronous").get()
      ?.synchronous,
  ).toBe(2);
  expect(
    primaryDb.query<{ cache_size: number }, []>("PRAGMA cache_size").get()
      ?.cache_size,
  ).toBe(-16000);
  expect(
    primaryDb.query<{ temp_store: number }, []>("PRAGMA temp_store").get()
      ?.temp_store,
  ).toBe(2);
  if (process.platform === "darwin") {
    expect(
      primaryDb.query<{ fullfsync: number }, []>("PRAGMA fullfsync").get()
        ?.fullfsync,
    ).toBe(1);
  }

  expect(
    rawRows(
      join(dirDefault, "control.sqlite"),
      "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
    ),
  ).toEqual([
    { name: "doc_directory_by_home" },
    { name: "doc_directory_by_home_kind" },
    { name: "draft_links_by_send" },
    { name: "draft_links_by_token" },
    { name: "share_links_by_doc" },
    { name: "share_links_by_token" },
  ]);
  expect(
    rawRows(
      docPath(dirDefault, HOME),
      "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
    ),
  ).toEqual([
    { name: "doc_versions_by_doc" },
    { name: "doc_versions_page" },
    { name: "draft_opens_by_send_user" },
    { name: "draft_sends_by_doc" },
    { name: "private_copies_open" },
    { name: "revision_issues_by_doc" },
  ]);
  expect(
    rawRows(
      checkpointsPath(dirDefault, HOME),
      "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
    ),
  ).toEqual([{ name: "checkpoint_pins_by_doc" }]);
  sDefault.close();

  const expectedSync = { full: 2, normal: 1, off: 0 } as const;
  for (const durability of ["full", "normal", "off"] as const) {
    const dir = await trees.tree();
    const s = openSqliteStorage({ dir, now, durability });
    const f = s.open(HOME);
    const db = connectionOf(f)!;
    expect(
      db.query<{ synchronous: number }, []>("PRAGMA synchronous").get()
        ?.synchronous,
    ).toBe(expectedSync[durability]);
    f.log.create(doc(DOC));
    f.log.append(item(1));
    f.checkpoints.put(DOC, 1, 1, new Uint8Array([1, 2]));
    expect(f.checkpoints.newest(DOC, 1)).toEqual({
      seq: 1,
      state: new Uint8Array([1, 2]),
    });
    s.close();

    const direct = openDatabase(join(dir, `direct-${durability}.sqlite`), {
      durability,
    });
    expect(
      direct.query<{ synchronous: number }, []>("PRAGMA synchronous").get()
        ?.synchronous,
    ).toBe(expectedSync[durability]);
    expect(
      direct.query<{ cache_size: number }, []>("PRAGMA cache_size").get()
        ?.cache_size,
    ).toBe(-16000);
    expect(
      direct.query<{ temp_store: number }, []>("PRAGMA temp_store").get()
        ?.temp_store,
    ).toBe(2);
    direct.close();
  }
});

test("a bounded log read stops at the requested sequence and ignores later damaged rows", async () => {
  const drivers: [string, () => Promise<Storage>][] = [
    ["sqlite", async () => openSqliteStorage({ dir: await trees.tree(), now })],
    ["memory", async () => createMemoryStorage({ now })],
  ];
  for (const [, make] of drivers) {
    const s = await make();
    const f = s.open(HOME);
    f.log.create(doc(DOC));
    for (let n = 1; n <= 5; n++) f.log.append(item(n));
    expect(
      f.log.tail(DOC, 1, 1, { throughSeq: 3 }).rows.map((r) => r.seq),
    ).toEqual([2, 3]);
    expect(
      f.log.tail(DOC, 1, 0, { throughSeq: 0 }).rows.map((r) => r.seq),
    ).toEqual([]);
    s.close();
  }

  // On SQLite, corrupt row 5 does not poison a bounded tail through seq 3
  const dir = await trees.tree();
  const s = openSqliteStorage({ dir, now });
  const f = s.open(HOME);
  f.log.create(doc(DOC));
  for (let n = 1; n <= 5; n++) f.log.append(item(n));
  rawSql(
    docPath(dir, HOME),
    "UPDATE doc_updates SET update_blob = CAST(x'ff' || substr(update_blob, 2) AS BLOB) WHERE doc_id = ?1 AND seq = 5",
    DOC,
  );
  const bounded = f.log.tail(DOC, 1, 0, { quarantine: false, throughSeq: 3 });
  expect(bounded.rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  expect(bounded.corrupt).toEqual([]);
  s.close();
});

test("history page details and latest snapshot lookup match across drivers", async () => {
  const drivers: (() => Promise<Storage>)[] = [
    async () => openSqliteStorage({ dir: await trees.tree(), now }),
    async () => createMemoryStorage({ now }),
  ];
  for (const make of drivers) {
    const s = await make();
    const f = s.open(HOME);
    f.log.create(doc(DOC));
    f.versions.add(versionRow("v1", 2, 100));
    f.history.setSnapshot("v1", "ref-1", 1);
    f.history.setSummary("v1", {
      authorIds: ["sam"],
      blockIds: ["b1"],
      sceneIds: ["s1"],
    });
    f.versions.add(versionRow("v2", 5, 200));
    f.history.setSummary("v2", {
      authorIds: ["dana"],
      blockIds: ["b1", "b2"],
      sceneIds: [],
    });
    f.versions.add(versionRow("v3", 8, 300));
    f.history.setSnapshot("v3", "ref-3", 2);

    const details = f.history.pageDetails(DOC, null, 2);
    expect(details).toEqual([
      {
        ...versionRow("v3", 8, 300),
        snapshotRef: "ref-3",
        engineVersion: 2,
        summary: null,
      },
      {
        ...versionRow("v2", 5, 200),
        snapshotRef: null,
        engineVersion: null,
        summary: {
          authorIds: ["dana"],
          blockIds: ["b1", "b2"],
          sceneIds: [],
        },
      },
    ]);
    const next = f.history.pageDetails(DOC, { createdAt: 200, id: "v2" }, 2);
    expect(next).toEqual([
      {
        ...versionRow("v1", 2, 100),
        snapshotRef: "ref-1",
        engineVersion: 1,
        summary: {
          authorIds: ["sam"],
          blockIds: ["b1"],
          sceneIds: ["s1"],
        },
      },
    ]);
    expect(
      f.history.latestSnapshotAtOrBefore(DOC, { generation: 1, seq: 6 }),
    ).toEqual({
      ref: "ref-1",
      engineVersion: 1,
    });
    expect(
      f.history.latestSnapshotAtOrBefore(DOC, { generation: 1, seq: 8 }),
    ).toEqual({
      ref: "ref-3",
      engineVersion: 2,
    });
    expect(
      f.history.latestSnapshotAtOrBefore(DOC, { generation: 1, seq: 1 }),
    ).toBeNull();
    s.close();
  }
});

test("batched draft open counts and revision block reads match across drivers", async () => {
  const drivers: (() => Promise<Storage>)[] = [
    async () => openSqliteStorage({ dir: await trees.tree(), now }),
    async () => createMemoryStorage({ now }),
  ];
  for (const make of drivers) {
    const s = await make();
    const f = s.open(HOME);
    f.log.create(doc(DOC));
    f.sharing.addOpen({ sendId: "s1", userId: "sam", openedAt: 10 });
    f.sharing.addOpen({ sendId: "s1", userId: "dana", openedAt: 20 });
    f.sharing.addOpen({ sendId: "s1", userId: "sam", openedAt: 30 });
    f.sharing.addOpen({ sendId: "s1", userId: null, openedAt: 40 });
    f.sharing.addOpen({ sendId: "s2", userId: null, openedAt: 50 });

    const stats = f.sharing.openStatsOf(["s1", "s1", "s2", "s3"]);
    expect(stats.get("s1")).toEqual({
      openers: ["dana", "sam"],
      totalOpens: 4,
    });
    expect(stats.get("s2")).toEqual({ openers: [], totalOpens: 1 });
    expect(stats.get("s3")).toBeUndefined();
    expect(f.sharing.openStatsOf([]).size).toBe(0);

    f.production.putSetBlocks("set-a", [
      {
        setId: "set-a",
        blockId: "b2",
        pageLabel: "2",
        change: "changed",
        hash: "h2",
        inserted: [[0, 3]],
        deletedAt: [],
      },
      {
        setId: "set-a",
        blockId: "b1",
        pageLabel: "1",
        change: "added",
        hash: "h1",
        inserted: [],
        deletedAt: [1],
      },
    ]);
    f.production.putSetBlocks("set-b", [
      {
        setId: "set-b",
        blockId: "b9",
        pageLabel: "9",
        change: "changed",
        hash: "h9",
        inserted: [],
        deletedAt: [],
      },
    ]);
    const batched = f.production.setBlocksFor([
      "set-a",
      "set-a",
      "set-b",
      "set-c",
    ]);
    expect(batched.get("set-a")?.map((b) => b.blockId)).toEqual(["b1", "b2"]);
    expect(batched.get("set-b")?.map((b) => b.blockId)).toEqual(["b9"]);
    expect(batched.get("set-c")).toBeUndefined();
    expect(f.production.setBlocksFor([]).size).toBe(0);
    s.close();
  }
});

test("a storage transaction commits several directory writes in one control transaction", async () => {
  const dir = await trees.tree();
  const s = openSqliteStorage({ dir, now });
  const watcher = rawConnection(join(dir, "control.sqlite"));
  let last = dataVersion(watcher);
  let commits = 0;
  const check = () => {
    const v = dataVersion(watcher);
    if (v !== last) commits += 1;
    last = v;
  };
  s.transaction(() => {
    s.directory.place(DOC, HOME, "script", "sam");
    s.directory.setRole(DOC, "sam", "owner", []);
    s.directory.setRole(DOC, "dana", "edit", []);
    s.directory.place(DOC2, HOME, "script", "sam");
    check();
  });
  check();
  expect(commits).toBe(1);
  expect(s.directory.rolesOf(DOC).map((r) => r.userId)).toEqual([
    "dana",
    "sam",
  ]);
  watcher.close();
  s.close();
});

test("an aborted storage transaction rolls back every control write across drivers", async () => {
  const drivers: (() => Promise<Storage>)[] = [
    async () => openSqliteStorage({ dir: await trees.tree(), now }),
    async () => createMemoryStorage({ now }),
  ];
  for (const make of drivers) {
    const s = await make();
    s.directory.place(DOC, HOME, "script", "sam");
    s.directory.setRole(DOC, "sam", "owner", []);

    expect(() =>
      s.transaction(() => {
        s.directory.place(DOC2, HOME, "script", "sam");
        s.directory.setRole(DOC, "dana", "edit", []);
        throw new RangeError("abort transaction");
      }),
    ).toThrow(RangeError);
    expect(s.directory.placeOf(DOC2)).toBeNull();
    expect(s.directory.rolesOf(DOC).map((r) => r.userId)).toEqual(["sam"]);

    expect(() =>
      s.transaction(() => {
        s.directory.place(DOC2, HOME, "script", "sam");
        throw new Error("unexpected");
      }),
    ).toThrow(StorageError);
    expect(s.directory.placeOf(DOC2)).toBeNull();
    s.close();
  }
});

test("directory.documentsIn filters by document kind across drivers", async () => {
  const drivers: (() => Promise<Storage>)[] = [
    async () => openSqliteStorage({ dir: await trees.tree(), now }),
    async () => createMemoryStorage({ now }),
  ];
  const DOC3 = "33333333-3333-7333-8333-333333333333";
  for (const make of drivers) {
    const s = await make();
    s.directory.place(DOC, HOME, "script", "sam");
    s.directory.place(DOC2, HOME, "rundown", "sam");
    s.directory.place(DOC3, HOME, "script", "sam");
    expect(s.directory.documentsIn(HOME)).toEqual([DOC, DOC2, DOC3].toSorted());
    expect(s.directory.documentsIn(HOME, "rundown")).toEqual([DOC2]);
    expect(s.directory.documentsIn(HOME, "script")).toEqual(
      [DOC, DOC3].toSorted(),
    );
    expect(s.directory.documentsIn(HOME, "notes")).toEqual([]);
    s.close();
  }
});
