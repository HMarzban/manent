// The tests every storage driver passes, registered by each driver's test file.
import { afterEach, beforeEach, expect, test } from "bun:test";
import type { DocFile, Home, Storage, VersionRow } from "../ports.ts";
import { COLOR_COUNT, StorageError } from "../ports.ts";
import { DOC, DOC2, DOC3, HOME, item } from "./contract-fixtures.ts";
import { generationsContract } from "./generations-contract.ts";
import { historyContract } from "./history-contract.ts";

/** A driver as its contract drives it: `corruptRow` and `corruptCheckpoint` damage stored bytes and leave their checksum. */
export interface StorageUnderTest {
  storage: Storage;
  reopen(): Promise<Storage>;
  dispose(): Promise<void>;
  corruptRow(docId: string, seq: number): void;
  corruptCheckpoint(docId: string): void;
}

/** Registers the shared tests. Each runs on a fresh storage from `make`, whose clock starts at 1,000, holding DOC in HOME. */
export function storageContract(
  make: (now: () => number) => Promise<StorageUnderTest>,
): void {
  let time = 1_000;
  const clock = {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
  let under: StorageUnderTest;
  let s: Storage;
  let f: DocFile;
  const version = (id: string): VersionRow => ({
    id,
    docId: DOC,
    generation: 1,
    seq: 0,
    kind: "named",
    name: id,
    createdByUserId: "sam",
    createdAt: clock.now(),
    deviceId: null,
  });

  beforeEach(async () => {
    time = 1_000;
    under = await make(clock.now);
    s = under.storage;
    f = s.open(HOME);
    f.log.create({
      id: DOC,
      kind: "script",
      ownerUserId: null,
      schemaVersion: 1,
      engineVersion: 0,
    });
  });
  afterEach(() => under.dispose());

  test("a document is created once", () => {
    const row = f.log.create({
      id: DOC,
      kind: "script",
      ownerUserId: null,
      schemaVersion: 1,
      engineVersion: 0,
    });
    expect(row).toEqual({
      id: DOC,
      kind: "script",
      ownerUserId: null,
      generation: 1,
      headSeq: 0,
      schemaVersion: 1,
      engineVersion: 0,
      locked: 0,
      createdAt: 1_000,
      deletedAt: null,
    });
    clock.advance(5);
    expect(
      f.log.create({
        id: DOC,
        kind: "ink",
        ownerUserId: "sam",
        schemaVersion: 9,
        engineVersion: 9,
      }),
    ).toEqual(row);
    expect(f.log.get(DOC2)).toBeNull();
  });

  test("appends get dense sequences, advance the head and keep their order", () => {
    expect([item(1), item(2), item(3)].map((i) => f.log.append(i))).toEqual([
      1, 2, 3,
    ]);
    expect(f.log.get(DOC)!.headSeq).toBe(3);
    expect(
      f.log
        .tail(DOC, 1, 1)
        .rows.map((r) => [r.seq, [...r.update], r.userId, r.origin]),
    ).toEqual([
      [2, [2], "sam", "edit"],
      [3, [3], "sam", "edit"],
    ]);
    // no such document; another generation
    expect(() => f.log.append({ ...item(4), docId: DOC2 })).toThrow(RangeError);
    expect(() => f.log.append({ ...item(4), generation: 2 })).toThrow(
      RangeError,
    );
  });

  test("a transaction commits all or nothing", () => {
    expect(() =>
      f.transaction(() => {
        f.log.append(item(1));
        f.versions.add(version("v1"));
        throw new Error("stop");
      }),
    ).toThrow(StorageError);
    expect(f.log.get(DOC)!.headSeq).toBe(0);
    expect(f.versions.list(DOC)).toEqual([]);
    expect(
      f.transaction(() => [f.log.append(item(1)), f.log.append(item(2))]),
    ).toEqual([1, 2]);
    try {
      f.transaction(() => {
        throw new Error("x");
      });
    } catch (e) {
      expect((e as StorageError).code).toBe("commit_failed");
    }
  });

  test("the ledger keeps the highest acknowledged clock per client id", () => {
    f.log.registerClients(DOC, "sam", [7]);
    f.log.append({ ...item(1), clocks: [{ clientId: 7, clock: 12 }] });
    f.log.append({
      ...item(2),
      clocks: [
        { clientId: 7, clock: 9 },
        { clientId: 8, clock: 4 },
      ],
    });
    // a clock for an id nobody registered registers it to the item's user
    expect(f.log.ledger(DOC)).toEqual(
      new Map([
        [7, { userId: "sam", ackedClock: 12 }],
        [8, { userId: "sam", ackedClock: 4 }],
      ]),
    );
  });

  test("a client id belongs to the first user who lists it", () => {
    expect(f.log.registerClients(DOC, "sam", [7, 8])).toEqual([]);
    // 8 is sam's; 9 is now dana's
    expect(f.log.registerClients(DOC, "dana", [8, 9])).toEqual([8]);
    // listing one's own again is fine
    expect(f.log.registerClients(DOC, "sam", [7])).toEqual([]);
  });

  test("people get colours in the order they first register, and the eleventh shares the first's", () => {
    const people = [
      "sam",
      "dana",
      "priya",
      "leo",
      "ana",
      "you",
      "p7",
      "p8",
      "p9",
      "p10",
      "p11",
    ];
    // a second id changes nothing
    people.forEach((userId, n) => {
      f.log.registerClients(DOC, userId, [100 + n]);
      f.log.registerClients(DOC, userId, [200 + n]);
    });
    // compared as a map: the colour each person holds is the contract, not the order of the entries
    expect(f.log.colors(DOC)).toEqual(
      new Map(people.map((userId, n) => [userId, n % COLOR_COUNT])),
    );
    // registered through the ledger
    f.log.append({
      ...item(1),
      userId: "p12",
      clocks: [{ clientId: 300, clock: 1 }],
    });
    expect(f.log.colors(DOC).get("p12")).toBe(1);
    expect(f.log.colors(DOC2).size).toBe(0);
  });

  test("a setting request is remembered per person and device, and only rises", () => {
    expect(f.log.lastSetRequest(DOC, "sam", "device-1")).toBe(0);
    f.log.append({
      ...item(1),
      setRequest: { deviceId: "device-1", clientSeq: 4 },
    });
    f.log.append({
      ...item(2),
      setRequest: { deviceId: "device-1", clientSeq: 3 },
    });
    expect([
      f.log.lastSetRequest(DOC, "sam", "device-1"),
      f.log.lastSetRequest(DOC, "sam", "device-2"),
      f.log.lastSetRequest(DOC, "dana", "device-1"),
    ]).toEqual([4, 0, 0]);
    expect(() =>
      f.transaction(() => {
        f.log.append({
          ...item(3),
          setRequest: { deviceId: "device-1", clientSeq: 9 },
        });
        throw new Error("stop");
      }),
    ).toThrow(StorageError);
    // it commits with its update or not at all
    expect(f.log.lastSetRequest(DOC, "sam", "device-1")).toBe(4);
  });

  test("a row whose checksum fails is quarantined, the rest still loads, and the document is flagged", () => {
    for (const n of [1, 2, 3]) f.log.append(item(n));
    under.corruptRow(DOC, 2);
    // looked at, not moved
    expect(f.log.tail(DOC, 1, 0, { quarantine: false })).toMatchObject({
      corrupt: [2],
    });
    expect(f.log.healing(DOC)).toBeNull();
    const tail = f.log.tail(DOC, 1, 0);
    expect(tail.rows.map((r) => r.seq)).toEqual([1, 3]);
    expect(tail.corrupt).toEqual([2]);
    expect(f.log.healing(DOC)).toEqual({
      reason: "quarantine",
      verifiedSeq: 1,
      flaggedAt: clock.now(),
      preHealVersionId: null,
    });
    // it is gone from the log, and sequences are never reused
    expect(f.log.tail(DOC, 1, 0)).toMatchObject({ corrupt: [] });
    expect(f.log.get(DOC)!.headSeq).toBe(3);
    // the lower one is kept
    f.log.flagHealing(DOC, "behind", 3);
    expect(f.log.healing(DOC)!.verifiedSeq).toBe(1);
  });

  test("the newest checkpoint that verifies wins, a damaged one is dropped, and only three are kept", () => {
    for (const seq of [10, 20, 30, 40])
      f.checkpoints.put(DOC, 1, seq, new Uint8Array([seq]));
    expect(f.checkpoints.newest(DOC, 1)).toEqual({
      seq: 40,
      state: new Uint8Array([40]),
    });
    under.corruptCheckpoint(DOC);
    expect(f.checkpoints.newest(DOC, 1)).toEqual({
      seq: 30,
      state: new Uint8Array([30]),
    });
    // 30, then 20: seq 10 was dropped when 40 was put
    under.corruptCheckpoint(DOC);
    under.corruptCheckpoint(DOC);
    expect(f.checkpoints.newest(DOC, 1)).toBeNull();
    expect(f.checkpoints.newest(DOC, 2)).toBeNull();
  });

  test("the directory places a document once, and keeps roles and tombstones", () => {
    const d = s.directory;
    expect(d.place(DOC, HOME, "script", "sam")).toEqual({
      home: HOME,
      kind: "script",
      created: true,
    });
    expect(
      d.place(DOC, { kind: "user", id: "sam" }, "private", "dana"),
    ).toEqual({ home: HOME, kind: "script", created: false });
    expect(d.documentsIn(HOME)).toEqual([DOC]);
    expect(d.placeOf(DOC2)).toBeNull();
    d.setRole(DOC, "sam", "owner", ["delete"]);
    d.setRole(DOC, "leo", "view", []);
    expect(d.roleOf(DOC, "sam")).toEqual({
      role: "owner",
      capabilities: ["delete"],
    });
    d.removeRole(DOC, "leo");
    expect(d.roleOf(DOC, "leo")).toBeNull();
    d.tombstone(DOC, "sam");
    clock.advance(9);
    d.tombstone(DOC, "dana");
    // the first one wins
    expect(d.tombstoneOf(DOC)).toEqual({
      deletedByUserId: "sam",
      deletedAt: 1_000,
    });
  });

  test("the directory lists everyone holding a role on a document, by user", () => {
    const d = s.directory;
    d.setRole(DOC, "sam", "edit", ["comment"]);
    d.setRole(DOC, "dana", "owner", ["delete"]);
    d.setRole(DOC2, "ana", "view", []);
    d.setRole(DOC, "leo", "comment", []);
    expect(d.rolesOf(DOC)).toEqual([
      { userId: "dana", role: "owner", capabilities: ["delete"] },
      { userId: "leo", role: "comment", capabilities: [] },
      { userId: "sam", role: "edit", capabilities: ["comment"] },
    ]);
    expect(d.rolesOf(DOC3)).toEqual([]);
  });

  test("the directory names each home that holds a document once, in key order", () => {
    const d = s.directory;
    const sams: Home = { kind: "user", id: "sam" };
    expect(d.homes()).toEqual([]);
    d.place(DOC2, sams, "private", "sam");
    d.place(DOC, HOME, "script", "sam");
    d.place(DOC3, HOME, "script", "dana");
    expect(d.homes()).toEqual([HOME, sams]);
  });

  test("versions are listed newest first; a pre-heal version is noted on the flag", () => {
    const v1 = version("v1");
    clock.advance(1);
    const v2: VersionRow = {
      ...version("v2"),
      generation: null,
      seq: null,
      kind: "pre_heal",
      name: null,
      deviceId: "device-1",
    };
    f.versions.add(v1);
    f.versions.add(v2);
    expect(f.versions.list(DOC)).toEqual([v2, v1]);
    expect(f.versions.list(DOC2)).toEqual([]);
    f.log.flagHealing(DOC, "restore", 0);
    f.log.notePreHeal(DOC, "v2");
    expect(f.log.healing(DOC)).toEqual({
      reason: "restore",
      verifiedSeq: 0,
      flaggedAt: 1_001,
      preHealVersionId: "v2",
    });
  });

  test("the schema minimum only rises", () => {
    f.log.raiseSchema(DOC, 3);
    f.log.raiseSchema(DOC, 2);
    expect(f.log.get(DOC)!.schemaVersion).toBe(3);
  });

  test("what was committed is there after a reopen", async () => {
    f.log.registerClients(DOC, "sam", [7]);
    f.log.append({
      ...item(1),
      setRequest: { deviceId: "device-1", clientSeq: 4 },
    });
    f.log.append({
      ...item(2),
      userId: "dana",
      clocks: [{ clientId: 8, clock: 2 }],
    });
    f.versions.add(version("v1"));
    f.log.flagHealing(DOC, "behind", 2);
    f.checkpoints.put(DOC, 1, 2, new Uint8Array([5, 6]));
    s.directory.place(DOC, HOME, "script", "sam");
    s.directory.setRole(DOC, "dana", "edit", ["comment"]);
    s.directory.tombstone(DOC, "sam");
    const everything = () => ({
      doc: f.log.get(DOC),
      tail: f.log.tail(DOC, 1, 0),
      ledger: f.log.ledger(DOC),
      colors: [...f.log.colors(DOC)],
      setRequest: f.log.lastSetRequest(DOC, "sam", "device-1"),
      healing: f.log.healing(DOC),
      versions: f.versions.list(DOC),
      checkpoint: f.checkpoints.newest(DOC, 1),
      place: s.directory.placeOf(DOC),
      role: s.directory.roleOf(DOC, "dana"),
      tombstone: s.directory.tombstoneOf(DOC),
    });
    const before = everything();
    s = await under.reopen();
    f = s.open(HOME);
    expect(everything()).toEqual(before);
  });

  test("a home that is not well formed is a caller's mistake", () => {
    expect(() => s.open({ kind: "user", id: "../x" })).toThrow(RangeError);
  });

  generationsContract({
    file: () => f,
    now: clock.now,
    reopen: () => under.reopen(),
    corruptRow: (docId, seq) => under.corruptRow(docId, seq),
    corruptCheckpoint: (docId) => under.corruptCheckpoint(docId),
  });
  historyContract({ file: () => f, storage: () => s });
}
