import { beforeEach, expect, test } from "bun:test";
import type { AppendItem, DocFile, Home } from "../src/index.ts";
import { StorageError } from "../src/index.ts";
import type { MemoryStorage } from "../src/testing/index.ts";
import {
  createMemoryStorage,
  SimulatedCrash,
  storageContract,
} from "../src/testing/index.ts";

storageContract(async (now) => {
  const storage = createMemoryStorage({ now });
  return {
    storage,
    reopen: async () => storage,
    dispose: async () => {},
    corruptRow: (d, q) => storage.corruptRow(d, q),
    corruptCheckpoint: (d) => storage.corruptCheckpoint(d),
  };
});

const HOME: Home = {
  kind: "project",
  id: "0b9f3c1e-6d2a-4e8b-9f1a-2c3d4e5f6a7b",
};
const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const item = (n: number): AppendItem => ({
  docId: DOC,
  generation: 1,
  update: new Uint8Array([n]),
  userId: "sam",
  origin: "edit",
  clocks: [{ clientId: 7, clock: n }],
});

let s: MemoryStorage;
let f: DocFile;

beforeEach(() => {
  s = createMemoryStorage({ now: () => 1_000 });
  f = s.open(HOME);
  f.log.create({
    id: DOC,
    kind: "script",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: 0,
  });
});

test("a commit can be made to fail, or to crash on either side of the write", () => {
  s.failNextCommit();
  expect(() => f.transaction(() => f.log.append(item(1)))).toThrow(
    StorageError,
  );
  expect(f.log.get(DOC)!.headSeq).toBe(0);
  s.crashOnCommit("before");
  expect(() => f.transaction(() => f.log.append(item(1)))).toThrow(
    SimulatedCrash,
  );
  expect(f.log.get(DOC)!.headSeq).toBe(0);
  s.crashOnCommit("after");
  expect(() => f.transaction(() => f.log.append(item(1)))).toThrow(
    SimulatedCrash,
  );
  expect(f.log.get(DOC)!.headSeq).toBe(1);
  // each arms one commit only
  expect(f.transaction(() => f.log.append(item(2)))).toBe(2);
});

test("a snapshot can be put back, and commits are counted", () => {
  f.log.registerClients(DOC, "sam", [7]);
  f.log.append({
    ...item(1),
    setRequest: { deviceId: "device-1", clientSeq: 4 },
  });
  const snapshot = s.snapshot();
  const start = s.commits();
  f.log.append({
    ...item(2),
    userId: "dana",
    clocks: [{ clientId: 8, clock: 2 }],
    setRequest: { deviceId: "device-1", clientSeq: 9 },
  });
  f.log.append({
    ...item(3),
    setRequest: { deviceId: "device-1", clientSeq: 6 },
  });
  expect(s.commits()).toBe(start + 2);
  f.transaction(() => [4, 5, 6].map((n) => f.log.append(item(n))));
  expect(s.commits()).toBe(start + 3);
  s.restore(snapshot);
  expect({
    headSeq: f.log.get(DOC)!.headSeq,
    ledger: f.log.ledger(DOC),
    colors: f.log.colors(DOC),
    setRequests: [
      f.log.lastSetRequest(DOC, "sam", "device-1"),
      f.log.lastSetRequest(DOC, "dana", "device-1"),
    ],
  }).toEqual({
    headSeq: 1,
    ledger: new Map([[7, { userId: "sam", ackedClock: 1 }]]),
    colors: new Map([["sam", 0]]),
    setRequests: [4, 0],
  });
});
