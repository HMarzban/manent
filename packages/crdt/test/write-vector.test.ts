import { expect, test } from "bun:test";
import fc from "fast-check";
import { readStateVector, writeStateVector } from "../src/index.ts";

test("a written state vector reads back as written", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.tuple(
          fc.nat({ max: 0xffff_ffff }),
          fc.integer({ min: 1, max: 0xffff_ffff }),
        ),
      ),
      (pairs) => {
        const clocks = new Map(pairs);
        expect(readStateVector(writeStateVector(clocks))).toEqual(clocks);
      },
    ),
    { numRuns: 1000 },
  );
  expect([
    writeStateVector(new Map()),
    writeStateVector(
      new Map([
        [1, 5],
        [300, 2],
      ]),
    ),
  ]).toEqual([new Uint8Array([0]), new Uint8Array([2, 172, 2, 2, 1, 5])]);
});
