import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  CrdtUpdateError,
  blockIds,
  createDoc,
  discardPending,
  readStateVector,
  scriptBody,
  scriptDocFromJSON,
} from "../src/index.ts";
import {
  FIRST_ID,
  SAMPLE,
  SECOND_ID,
  THIRD_ID,
  capture,
  twoDependentUpdates,
} from "./helpers.ts";

test("a state vector reads as client id → next clock", () => {
  const a = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  expect(readStateVector(createDoc().encodeStateVector())).toEqual(new Map());
  expect(readStateVector(a.encodeStateVector()).get(1)).toBeGreaterThan(0);
  expect(() => readStateVector(new Uint8Array([200]))).toThrow(CrdtUpdateError);
});

test("a state vector holds each client's clock as written", () => {
  // two clients: 1 at clock 5, 300 at clock 2
  expect(readStateVector(new Uint8Array([2, 1, 5, 172, 2, 2]))).toEqual(
    new Map([
      [1, 5],
      [300, 2],
    ]),
  );
});

test("any bytes read as a state vector or are refused", () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 24 }), (bytes) => {
      let vector: Map<number, number>;
      try {
        vector = readStateVector(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(CrdtUpdateError);
        return;
      }
      for (const [client, clock] of vector) {
        expect(Number.isSafeInteger(client) && client >= 0).toBe(true);
        expect(Number.isSafeInteger(clock) && clock >= 0).toBe(true);
      }
    }),
    { numRuns: 1000 },
  );
});

test("pending structs can be discarded, and the document is whole again", () => {
  const {
    source,
    updates: [u1, u2],
  } = twoDependentUpdates();
  const c = createDoc();
  c.applyUpdate(u2);
  expect([discardPending(c), c.hasPendingStructs(), discardPending(c)]).toEqual(
    [true, false, false],
  );
  c.applyUpdate(u1);
  c.applyUpdate(u2);
  expect(scriptBody(c).materialize()).toEqual(scriptBody(source).materialize());
});

test("a waiting delete is discarded too", () => {
  const a = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  const deletes = capture(a, (w) => w.deleteText(FIRST_ID, 0, 3));
  const c = createDoc();
  c.applyUpdate(deletes);
  expect([discardPending(c), c.hasPendingStructs()]).toEqual([true, false]);
});

test("block ids come in document order", () => {
  expect(blockIds(scriptDocFromJSON(SAMPLE))).toEqual([
    FIRST_ID,
    SECOND_ID,
    THIRD_ID,
    "s000000000000004",
    "s000000000000005",
    "s000000000000006",
  ]);
});
