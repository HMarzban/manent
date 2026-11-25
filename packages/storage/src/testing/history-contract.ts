// The contract's tests of version pages, snapshot chunks, summaries, history requests, checkpoint pins and the purge of a frozen log.
import { expect, test } from "bun:test";
import { sha256 } from "../checksum.ts";
import type {
  DocFile,
  HistoryRequestRow,
  Storage,
  VersionRow,
} from "../ports/index.ts";
import { StorageError } from "../ports/index.ts";
import { DOC, DOC2, bytes, item } from "./contract-fixtures.ts";

/** The running contract's current storage, and its file holding DOC. */
interface HistoryRun {
  file(): DocFile;
  storage(): Storage;
}

const KEY = "0123456789abcdef0123456789abcdef";

const version = (id: string, createdAt: number, docId = DOC): VersionRow => ({
  id,
  docId,
  generation: 1,
  seq: 0,
  kind: "auto",
  name: null,
  createdByUserId: "sam",
  createdAt,
  deviceId: null,
});

const request = (result: string): HistoryRequestRow => ({
  docId: DOC,
  key: KEY,
  userId: "sam",
  result,
  createdAt: 1_000,
});

const state = (seq: number): Uint8Array => bytes(seq);
const ids = (page: VersionRow[]): string[] => page.map((row) => row.id);

/** Registers the tests inside `storageContract`, whose hooks give each a fresh file holding DOC. */
export function historyContract(run: HistoryRun): void {
  test("a page of versions is newest first and continues after its cursor", () => {
    const f = run.file();
    const rows = [
      version("b", 200),
      version("f", 300),
      version("a", 100),
      version("g", 200),
      version("c", 300),
      version("e", 200),
      version("d", 100),
    ];
    for (const row of rows) f.versions.add(row);
    f.versions.add(version("z", 300, DOC2));
    expect(ids(f.history.page(DOC, null, 3))).toEqual(["f", "c", "g"]);
    expect(ids(f.history.page(DOC, { createdAt: 200, id: "g" }, 3))).toEqual([
      "e",
      "b",
      "d",
    ]);
    expect(f.history.page(DOC, { createdAt: 100, id: "d" }, 3)).toEqual([
      version("a", 100),
    ]);
    expect(f.history.page(DOC, { createdAt: 100, id: "a" }, 3)).toEqual([]);
    expect([f.history.get("c"), f.history.get("y")]).toEqual([
      version("c", 300),
      null,
    ]);
  });

  test("a chunk is stored once whoever puts it", () => {
    const f = run.file();
    const body = bytes(1, 2, 3);
    const other = bytes(4, 5);
    f.history.putChunk(sha256(body), body);
    f.history.putChunk(sha256(body), body);
    expect(f.history.chunkHashes()).toEqual([sha256(body)]);
    expect(f.history.chunk(sha256(body))).toEqual(body);
    f.history.putChunk(sha256(other), other);
    f.history.removeChunks([sha256(body)]);
    expect(f.history.chunkHashes()).toEqual([sha256(other)]);
    expect(f.history.chunk(sha256(body))).toBeNull();
  });

  test("removing a version removes its summary", () => {
    const f = run.file();
    const summary = { authorIds: ["sam"], blockIds: ["b1"], sceneIds: [] };
    for (const id of ["v1", "v2"]) {
      f.versions.add(version(id, 1_000));
      f.history.setSummary(id, summary);
      f.history.setSnapshot(id, "ab12", 2);
    }
    f.history.setSummary("v1", { ...summary, sceneIds: ["s1"] });
    expect(f.history.summary("v1")).toEqual({ ...summary, sceneIds: ["s1"] });
    expect(f.history.snapshotOf("v1")).toEqual({
      ref: "ab12",
      engineVersion: 2,
    });
    f.history.remove(["v1"]);
    expect([
      f.history.get("v1"),
      f.history.summary("v1"),
      f.history.snapshotOf("v1"),
    ]).toEqual([null, null, null]);
    expect(f.history.summary("v2")).toEqual(summary);
    expect(f.versions.list(DOC).map((row) => row.id)).toEqual(["v2"]);
    // a version without a snapshot
    f.versions.add(version("v3", 1_000));
    expect(f.history.snapshotOf("v3")).toBeNull();
  });

  test("a history request commits with the rest of its transaction, or not at all", () => {
    const f = run.file();
    expect(() =>
      f.transaction(() => {
        f.versions.add(version("v1", 1_000));
        f.history.putRequest(request("{}"));
        throw new Error("stop");
      }),
    ).toThrow(StorageError);
    expect([f.history.get("v1"), f.history.request(DOC, KEY)]).toEqual([
      null,
      null,
    ]);
    f.transaction(() => {
      f.versions.add(version("v1", 1_000));
      f.history.putRequest(request("{}"));
    });
    expect([f.history.get("v1"), f.history.request(DOC, KEY)]).toEqual([
      version("v1", 1_000),
      request("{}"),
    ]);
  });

  test("a key is stored once", () => {
    const f = run.file();
    f.history.putRequest(request("{}"));
    expect(() => f.history.putRequest(request('{"again":true}'))).toThrow(
      RangeError,
    );
    expect(f.history.request(DOC, KEY)).toEqual(request("{}"));
    expect(f.history.request(DOC2, KEY)).toBeNull();
  });

  test("a pinned checkpoint outlives the newest three", () => {
    const cps = run.file().checkpoints;
    for (const seq of [10, 20, 30]) cps.put(DOC, 1, seq, state(seq));
    cps.pin("v1", DOC, 1, 15);
    for (const seq of [40, 50, 60]) cps.put(DOC, 1, seq, state(seq));
    expect(cps.atOrBefore(DOC, 1, 15)!.seq).toBe(10);
    cps.unpin(["v1"]);
    cps.put(DOC, 1, 70, state(70));
    expect(cps.atOrBefore(DOC, 1, 15)).toBeNull();
  });

  test("a pin older than every checkpoint holds none back", () => {
    const cps = run.file().checkpoints;
    cps.pin("v1", DOC, 1, 5);
    for (const seq of [10, 20, 30, 40]) cps.put(DOC, 1, seq, state(seq));
    expect(cps.atOrBefore(DOC, 1, 15)).toBeNull();
    expect(cps.newest(DOC, 1)).toEqual({ seq: 40, state: state(40) });
  });

  test("purging a frozen generation drops its log, its final state and its checkpoints, and refuses the current one", () => {
    const f = run.file();
    for (const n of [1, 2, 3]) f.log.append(item(n));
    f.checkpoints.put(DOC, 1, 2, state(2));
    f.checkpoints.pin("v1", DOC, 1, 2);
    f.generations.freeze({
      docId: DOC,
      finalSeq: 3,
      finalState: bytes(9, 9),
      frozenAt: 100,
      purgeAfter: 900,
      reason: "client_ids",
      initialUpdate: bytes(1, 2),
      rebuiltByClientId: 1,
      userId: "_system",
    });
    f.checkpoints.put(DOC, 2, 1, state(1));
    expect(f.history.purgeLog(DOC, 1)).toBe(3);
    expect(f.log.tail(DOC, 1, 0)).toEqual({ rows: [], corrupt: [] });
    expect(f.generations.get(DOC, 1)).toMatchObject({
      finalSeq: 3,
      finalState: null,
    });
    f.checkpoints.purge(DOC, 1);
    expect(f.checkpoints.newest(DOC, 1)).toBeNull();
    // the pin went with its generation, so five new checkpoints keep only the newest three
    for (const seq of [1, 2, 3, 4, 5])
      f.checkpoints.put(DOC, 1, seq, state(seq));
    expect(f.checkpoints.atOrBefore(DOC, 1, 2)).toBeNull();
    expect(f.checkpoints.newest(DOC, 2)).toEqual({ seq: 1, state: state(1) });
    expect(() => f.history.purgeLog(DOC, 2)).toThrow(RangeError);
    expect(f.log.tail(DOC, 2, 0).rows.map((row) => row.seq)).toEqual([1]);
  });

  test("another person's role is seen, the asker's own is not", () => {
    const d = run.storage().directory;
    d.setRole(DOC, "dana", "owner", []);
    expect(d.hasRoleBesides(DOC, "dana")).toBe(false);
    d.setRole(DOC, "sam", "editor", []);
    expect([
      d.hasRoleBesides(DOC, "dana"),
      d.hasRoleBesides(DOC, "sam"),
      d.hasRoleBesides(DOC2, "sam"),
    ]).toEqual([true, true, false]);
  });
}
