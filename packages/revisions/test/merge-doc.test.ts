import { expect, test } from "bun:test";
import fc from "fast-check";
import type { DocJSON } from "@manent/schema";
import {
  applyBlockOpsToJSON,
  mergeByBlock,
  mergeThrough,
} from "../src/index.ts";
import {
  A,
  B,
  C,
  D,
  E,
  F,
  N,
  arbThreeDocs,
  b,
  changedAgainst,
  doc,
  inResultAsMerged,
} from "./arbitraries.ts";

/** Three documents that reach every row of the merge table. */
function table(): { base: DocJSON; mine: DocJSON; theirs: DocJSON } {
  return {
    base: doc(
      b(A, "one"),
      b(B, "two"),
      b(C, "three"),
      b(D, "four"),
      b(F, "rain falls"),
    ),
    mine: doc(
      b(A, "one"),
      b(B, "TWO"),
      b(N, "new"),
      b(C, "three!"),
      b(E, "mine"),
      b(F, "cold rain falls"),
    ),
    theirs: doc(
      b(A, "one"),
      b(B, "two"),
      b(D, "four"),
      b(E, "theirs"),
      b(F, "rain falls hard"),
    ),
  };
}

test("each row of the merge table", () => {
  const { base, mine, theirs } = table();
  expect(mergeByBlock(base, mine, theirs)).toEqual({
    ops: [
      { op: "replace", block: b(B, "TWO") },
      { op: "insert", after: B, block: b(N, "new") },
      { op: "replace", block: b(F, "cold rain falls hard") },
      { op: "delete", id: D },
    ],
    overlaps: [{ blockId: E, mine: b(E, "mine"), theirs: b(E, "theirs") }],
    setAside: [{ blockId: C, nearBlockId: N, text: "three!" }],
    applied: 4,
    result: doc(
      b(A, "one"),
      b(B, "TWO"),
      b(N, "new"),
      b(E, "theirs"),
      b(F, "cold rain falls hard"),
    ),
  });
});

test("a block both sides changed so that the changes touch is kept as theirs, with mine to review", () => {
  const touching = doc(b(F, "rainy"));
  expect(mergeByBlock(doc(b(F, "rain")), doc(b(F, "rains")), touching)).toEqual(
    {
      ops: [],
      overlaps: [{ blockId: F, mine: b(F, "rains"), theirs: b(F, "rainy") }],
      setAside: [],
      applied: 0,
      result: touching,
    },
  );
});

test("merging the result again changes nothing", () => {
  const { base, mine, theirs } = table();
  const { result } = mergeByBlock(base, mine, theirs);
  expect(mergeByBlock(base, mine, result).ops).toEqual([]);
});

test("a merge is carried through each skipped generation in turn", () => {
  const base = doc(b(A, "one"), b(B, "two"));
  const mine = doc(b(A, "one!"), b(B, "two"));
  const final1 = doc(b(A, "one"), b(B, "TWO"));
  const final2 = doc(b(A, "one"), b(B, "TWO"), b(C, "three"));
  const current = doc(b(A, "One"), b(B, "TWO"), b(C, "three"));
  expect(mergeThrough(base, mine, [final1, final2, current])).toMatchObject({
    ops: [{ op: "replace", block: b(A, "One!") }],
    applied: 1,
    overlaps: [],
    setAside: [],
  });
  expect(() => mergeThrough(base, mine, [])).toThrow(RangeError);
});

test("text set aside in an early step is kept to the end", () => {
  const current = doc(b(B, "TWO"), b(C, "three"));
  expect(
    mergeThrough(
      doc(b(B, "two"), b(A, "one")),
      doc(b(B, "two"), b(A, "one!")),
      [doc(b(B, "two")), current],
    ),
  ).toEqual({
    ops: [],
    overlaps: [],
    setAside: [{ blockId: A, nearBlockId: B, text: "one!" }],
    applied: 0,
    result: current,
  });
});

test("every block mine changed ends merged, to review, or set aside", () => {
  fc.assert(
    fc.property(arbThreeDocs, ({ base, mine, theirs }) => {
      const m = mergeByBlock(base, mine, theirs);
      for (const block of changedAgainst(base, mine))
        expect(
          inResultAsMerged(m.result, block) ||
            m.overlaps.some((o) => o.blockId === block.attrs!.id) ||
            m.setAside.some((s) => s.blockId === block.attrs!.id),
        ).toBe(true);
    }),
    { numRuns: 1_000 },
  );
});

test("seed 44: a block mine holds a second time under one ID is never written over the first, and its text is set aside unless base or theirs holds it", () => {
  const base = doc(b(A, "one"), b(B, "two"), b(B, "two, again"));
  const theirs = doc(b(A, "One"), b(B, "two"), b(B, "two, again"));
  expect(
    mergeByBlock(
      base,
      doc(
        b(A, "one"),
        b(B, "two!"),
        b(B, "two, again"),
        b(C, "three"),
        b(A, "a stray copy"),
      ),
      theirs,
    ),
  ).toEqual({
    ops: [
      { op: "replace", block: b(B, "two!") },
      { op: "insert", after: B, block: b(C, "three") },
    ],
    overlaps: [],
    setAside: [{ blockId: A, nearBlockId: C, text: "a stray copy" }],
    applied: 2,
    result: doc(b(A, "One"), b(B, "two!"), b(C, "three"), b(B, "two, again")),
  });
});

test("applying operations to JSON gives the blocks the table says", () => {
  const given: DocJSON = {
    type: "doc",
    content: [
      { type: "section", content: [b(A, "one"), b(B, "two")] },
      { type: "section", content: [b(C, "three")] },
    ],
  };
  const before = structuredClone(given);
  expect(
    applyBlockOpsToJSON(given, [
      { op: "insert", after: C, block: b(N, "new") },
      { op: "insert", after: null, block: b(D, "four") },
      { op: "replace", block: b(B, "TWO") },
      { op: "delete", id: A },
      { op: "insert", after: E, block: b(F, "lost") },
      { op: "replace", block: b(E, "five") },
      { op: "delete", id: E },
    ]),
  ).toEqual({
    type: "doc",
    content: [
      { type: "section", content: [b(D, "four"), b(B, "TWO")] },
      { type: "section", content: [b(C, "three"), b(N, "new")] },
    ],
  });
  expect(given).toEqual(before);
});
