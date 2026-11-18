import { afterEach, expect, test } from "bun:test";
import fc from "fast-check";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  CrdtUpdateError,
  decodeAwareness,
  encodeAwareness,
} from "../src/index.ts";
import type { AwarenessEntry } from "../src/index.ts";

const made: { awareness: Awareness; doc: Y.Doc }[] = [];

/** y-protocols' own Awareness on a document with this client id. */
function realAwareness(clientId: number): { awareness: Awareness; doc: Y.Doc } {
  const doc = new Y.Doc();
  doc.clientID = clientId;
  const real = { awareness: new Awareness(doc), doc };
  made.push(real);
  return real;
}

afterEach(() => {
  for (const { awareness, doc } of made.splice(0)) {
    awareness.destroy();
    doc.destroy();
  }
});

test("the bytes are y-protocols' own", () => {
  const { awareness } = realAwareness(7);
  awareness.setLocalState({
    cursor: { blockId: "b1", offset: 2 },
    user: { name: "x" },
  });
  const wire = encodeAwarenessUpdate(awareness, [7]);
  expect(decodeAwareness(wire)).toEqual([
    {
      clientId: 7,
      clock: 1,
      state: { cursor: { blockId: "b1", offset: 2 }, user: { name: "x" } },
    },
  ]);
  expect(encodeAwareness(decodeAwareness(wire))).toEqual(wire);
  awareness.setLocalState(null);
  expect(decodeAwareness(encodeAwarenessUpdate(awareness, [7]))).toEqual([
    { clientId: 7, clock: 2, state: null },
  ]);
});

test("an update of two clients has fixed bytes", () => {
  // count 2; client 7, clock 1, "{}"; client 300, clock 2, "null"
  const wire = new Uint8Array([
    2, 7, 1, 2, 123, 125, 172, 2, 2, 4, 110, 117, 108, 108,
  ]);
  const entries: AwarenessEntry[] = [
    { clientId: 7, clock: 1, state: {} },
    { clientId: 300, clock: 2, state: null },
  ];
  expect(encodeAwareness(entries)).toEqual(wire);
  expect(decodeAwareness(wire)).toEqual(entries);
});

test("anything else is refused", () => {
  for (const bad of [
    new Uint8Array([1]), // cut short
    new Uint8Array([1, 7, 1, 3, 123, 125, 125]), // not JSON
    new Uint8Array([1, 7, 1, 2, 91, 93]), // an array, not an object
    new Uint8Array([1, 7, 1, 1, 55]), // a number, not an object
    new Uint8Array([0, 0]), // a byte after the last entry
  ])
    expect(() => decodeAwareness(bad)).toThrow(CrdtUpdateError);
  expect(decodeAwareness(new Uint8Array([0]))).toEqual([]);
});

const arbEntry: fc.Arbitrary<AwarenessEntry> = fc.record({
  clientId: fc.nat(),
  clock: fc.nat(),
  state: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), {
    nil: null,
  }),
});

test("entries survive the round trip", () => {
  fc.assert(
    fc.property(fc.array(arbEntry, { maxLength: 4 }), (entries) => {
      const wire = encodeAwareness(entries);
      expect(decodeAwareness(wire)).toEqual(
        entries.map((entry) => ({
          ...entry,
          state: JSON.parse(JSON.stringify(entry.state)),
        })),
      );
    }),
    { numRuns: 300 },
  );
});

test("any bytes decode to entries or are refused", () => {
  fc.assert(
    fc.property(fc.uint8Array({ maxLength: 32 }), (bytes) => {
      let entries: AwarenessEntry[];
      try {
        entries = decodeAwareness(bytes);
      } catch (error) {
        expect(error).toBeInstanceOf(CrdtUpdateError);
        return;
      }
      for (const { clientId, clock, state } of entries)
        expect([
          Number.isSafeInteger(clientId) && clientId >= 0,
          Number.isSafeInteger(clock) && clock >= 0,
          state === null ||
            (typeof state === "object" && !Array.isArray(state)),
        ]).toEqual([true, true, true]);
    }),
    { numRuns: 1000 },
  );
});

test("a client id or clock that is not an unsigned integer is a caller's mistake", () => {
  for (const entry of [
    { clientId: -1, clock: 0, state: null },
    { clientId: 1, clock: 1.5, state: null },
  ])
    expect(() => encodeAwareness([entry])).toThrow(RangeError);
});
