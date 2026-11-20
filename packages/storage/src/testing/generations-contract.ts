// The contract's tests of closed generations, replay keys, adoptions, measures and the checkpoint a replay starts from.
import { expect, test } from "bun:test";
import type { DocFile, FreezeItem, Storage } from "../ports.ts";
import { StorageError } from "../ports.ts";
import { DOC, DOC2, HOME, bytes, item } from "./contract-fixtures.ts";

/** The running contract's current file and clock, its driver's reopen, and its ways of damaging a row and a checkpoint. */
interface ContractRun {
  file(): DocFile;
  now(): number;
  reopen(): Promise<Storage>;
  corruptRow(docId: string, seq: number): void;
  corruptCheckpoint(docId: string): void;
}

const KEY = "0193b1f4-2c1e-7a00-8000-00000000000a";

const FREEZE: FreezeItem = {
  docId: DOC,
  finalSeq: 3,
  finalState: bytes(9, 9),
  frozenAt: 100,
  purgeAfter: 900,
  reason: "client_ids",
  initialUpdate: bytes(1, 2, 3, 4),
  rebuiltByClientId: 1,
  userId: "_system",
};

function appendThree(f: DocFile): void {
  f.log.registerClients(DOC, "sam", [7]);
  for (const n of [1, 2, 3]) f.log.append(item(n));
}

/** Registers the tests inside `storageContract`, whose hooks give each a fresh file holding DOC. */
export function generationsContract(run: ContractRun): void {
  test("freezing a generation moves the document to the next one in one write", () => {
    const f = run.file();
    appendThree(f);
    const generation = f.transaction(() => f.generations.freeze(FREEZE));
    expect(generation).toBe(2);
    expect(f.log.get(DOC)).toMatchObject({ generation: 2, headSeq: 1 });
    expect(f.log.tail(DOC, 2, 0).rows).toEqual([
      {
        seq: 1,
        update: bytes(1, 2, 3, 4),
        userId: "_system",
        origin: "system",
        createdAt: run.now(),
      },
    ]);
    // the old log stays
    expect(f.log.tail(DOC, 1, 0).rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(f.generations.get(DOC, 1)).toEqual({
      docId: DOC,
      generation: 1,
      finalSeq: 3,
      finalState: bytes(9, 9),
      frozenAt: 100,
      purgeAfter: 900,
      reason: "client_ids",
      nextInitialBytes: 4,
      rebuiltByClientId: 1,
    });
    expect([...f.log.ledger(DOC)]).toEqual([
      [1, { userId: "_system", ackedClock: 0 }],
      [7, { userId: "sam", ackedClock: 0 }],
    ]);
    // the system is given no colour
    expect([...f.log.colors(DOC)]).toEqual([["sam", 0]]);
    // generation 1 is closed
    expect(() => f.log.append(item(4))).toThrow(RangeError);
  });

  test("a freeze that does not start from the head writes nothing", () => {
    const f = run.file();
    appendThree(f);
    expect(() => f.generations.freeze({ ...FREEZE, finalSeq: 2 })).toThrow(
      RangeError,
    );
    // nor does one of a document that does not exist
    expect(() => f.generations.freeze({ ...FREEZE, docId: DOC2 })).toThrow(
      RangeError,
    );
    expect(f.log.get(DOC)).toMatchObject({ generation: 1, headSeq: 3 });
    expect(f.generations.list(DOC)).toEqual([]);
    expect(f.log.get(DOC2)).toBeNull();
  });

  test("a freeze whose commit fails leaves the generation as it was", () => {
    const f = run.file();
    appendThree(f);
    expect(() =>
      f.transaction(() => {
        f.generations.freeze(FREEZE);
        throw new Error("stop");
      }),
    ).toThrow(StorageError);
    expect(f.log.get(DOC)).toMatchObject({ generation: 1, headSeq: 3 });
    expect(f.generations.list(DOC)).toEqual([]);
    expect(f.log.tail(DOC, 2, 0).rows).toEqual([]);
    expect([...f.log.ledger(DOC)]).toEqual([
      [7, { userId: "sam", ackedClock: 3 }],
    ]);
  });

  test("a damaged row is found in every generation that holds its sequence", () => {
    const f = run.file();
    appendThree(f);
    f.generations.freeze(FREEZE);
    run.corruptRow(DOC, 1);
    expect(f.log.tail(DOC, 1, 0, { quarantine: false }).corrupt).toEqual([1]);
    expect(f.log.tail(DOC, 2, 0)).toMatchObject({ rows: [], corrupt: [1] });
  });

  test("a replay key is stored once", () => {
    const f = run.file();
    const r = {
      docId: DOC,
      key: "0123456789abcdef0123456789abcdef",
      userId: "sam",
      fromGeneration: 1,
      generation: 2,
      seq: 5,
      result: "{}",
      createdAt: 7,
    };
    f.replays.put(r);
    expect(f.replays.get(DOC, r.key)).toEqual(r);
    expect(() => f.replays.put({ ...r, seq: 6 })).toThrow(RangeError);
    // the first stays
    expect(f.replays.get(DOC, r.key)).toEqual(r);
    expect(f.replays.get(DOC, "f".repeat(32))).toBeNull();
  });

  test("an adoption is kept with its document and never replaced", async () => {
    const file = run.file();
    const adoption = {
      docId: DOC,
      key: KEY,
      userId: "you",
      seq: 1,
      adoptedAt: 5,
    };
    file.transaction(() => file.adoptions.put(adoption));
    file.adoptions.put({
      docId: DOC,
      key: "other",
      userId: "sam",
      seq: 9,
      adoptedAt: 6,
    });
    const reopened = (await run.reopen()).open(HOME);
    expect(reopened.adoptions.get(DOC)).toEqual(adoption);
    expect(reopened.adoptions.get(DOC2)).toBeNull();
  });

  test("an adoption written in a transaction that throws is not kept", () => {
    const file = run.file();
    expect(() =>
      file.transaction(() => {
        file.adoptions.put({
          docId: DOC,
          key: KEY,
          userId: "you",
          seq: 1,
          adoptedAt: 5,
        });
        throw new Error("stop");
      }),
    ).toThrow(StorageError);
    expect(file.adoptions.get(DOC)).toBeNull();
  });

  test("a measure is kept per generation and replaced by the next", () => {
    const f = run.file();
    const m1 = {
      seq: 3,
      liveBytes: 900,
      plainBytes: 40,
      clientIds: 2,
      largestSection: 12,
    };
    const m2 = { ...m1, seq: 8, liveBytes: 1_200, clientIds: 3 };
    f.measures.put(DOC, 1, m1);
    f.measures.put(DOC, 1, m2);
    expect(f.measures.get(DOC, 1)).toEqual(m2);
    expect(f.measures.get(DOC, 2)).toBeNull();
  });

  test("the checkpoint at or before a sequence is found", () => {
    const f = run.file();
    for (const seq of [10, 20, 30]) f.checkpoints.put(DOC, 1, seq, bytes(seq));
    expect(f.checkpoints.atOrBefore(DOC, 1, 25)).toEqual({
      seq: 20,
      state: bytes(20),
    });
    expect(f.checkpoints.atOrBefore(DOC, 1, 9)).toBeNull();
    // the first damages 30, which is past the sequence; the second damages 20
    run.corruptCheckpoint(DOC);
    expect(f.checkpoints.atOrBefore(DOC, 1, 25)).toEqual({
      seq: 20,
      state: bytes(20),
    });
    run.corruptCheckpoint(DOC);
    expect(f.checkpoints.atOrBefore(DOC, 1, 25)).toEqual({
      seq: 10,
      state: bytes(10),
    });
  });
}
