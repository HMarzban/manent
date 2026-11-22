import { expect, test } from "bun:test";
import fc from "fast-check";
import { blockText, blockView, canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { MAX_MERGE_CHARACTERS, mergeBlock } from "../src/index.ts";
import { A, arbBlockEdits, b, blockWith, insertedRuns } from "./arbitraries.ts";

function withAttrs(
  block: BlockJSON,
  attrs: Record<string, unknown>,
): BlockJSON {
  return canonicalBlock({ ...block, attrs: { ...block.attrs, ...attrs } });
}

test("changes that do not touch merge character by character", () => {
  expect(
    mergeBlock(
      b(A, "The rain falls"),
      b(A, "The cold rain falls"),
      b(A, "The rain falls hard"),
    ),
  ).toEqual({
    ok: true,
    block: b(A, "The cold rain falls hard"),
  });
});

test("changes that touch, even end to end, are not merged", () => {
  expect(mergeBlock(b(A, "rain"), b(A, "rains"), b(A, "rainy"))).toEqual({
    ok: false,
  });
  expect(mergeBlock(b(A, "abcd"), b(A, "aBcd"), b(A, "abCd"))).toEqual({
    ok: false,
  });
});

test("the same change on both sides is taken once", () => {
  expect(
    mergeBlock(b(A, "The rain"), b(A, "The cold rain"), b(A, "The cold rain")),
  ).toEqual({
    ok: true,
    block: b(A, "The cold rain"),
  });
});

test("a mark change is a change to those characters", () => {
  const base = b(A, "The rain falls");
  const mine = canonicalBlock(
    blockWith(A, [
      { text: "The ", marks: [] },
      { text: "rain", marks: [{ type: "bold" }] },
      { text: " falls", marks: [] },
    ]),
  );
  expect(mergeBlock(base, mine, b(A, "The raXin falls"))).toEqual({
    ok: false,
  });
  expect(mergeBlock(base, mine, b(A, "The rain falls hard"))).toEqual({
    ok: true,
    block: canonicalBlock(
      blockWith(A, [
        { text: "The ", marks: [] },
        { text: "rain", marks: [{ type: "bold" }] },
        { text: " falls hard", marks: [] },
      ]),
    ),
  });
});

test("attributes merge key by key, and one key changed two ways is not merged", () => {
  const base = b(A, "Night");
  expect(
    mergeBlock(
      base,
      withAttrs(base, { type: "character" }),
      withAttrs(base, { synopsis: "The storm" }),
    ),
  ).toEqual({
    ok: true,
    block: withAttrs(base, { type: "character", synopsis: "The storm" }),
  });
  expect(
    mergeBlock(
      base,
      withAttrs(base, { type: "character" }),
      withAttrs(base, { type: "dialogue" }),
    ),
  ).toEqual({
    ok: false,
  });
});

test("a block too long to merge by character is not merged", () => {
  const base = "a".repeat(19_999);
  expect(MAX_MERGE_CHARACTERS).toBe(20_000);
  expect(mergeBlock(b(A, base), b(A, `X${base}`), b(A, `${base}YZ`))).toEqual({
    ok: false,
  });
  expect(mergeBlock(b(A, base), b(A, `X${base}`), b(A, `${base}Y`))).toEqual({
    ok: true,
    block: b(A, `X${base}Y`),
  });
});

test("whole characters and their marks survive a merge", () => {
  const base = blockWith(A, [{ text: "🎬 مرحبا", marks: [] }]);
  const mine = blockWith(A, [
    { text: "🎬 مرحبا", marks: [] },
    { text: " é", marks: [{ type: "bold" }] },
  ]);
  const theirs = blockWith(A, [{ text: "أول 🎬 مرحبا", marks: [] }]);
  expect(mergeBlock(base, mine, theirs)).toEqual({
    ok: true,
    block: canonicalBlock(
      blockWith(A, [
        { text: "أول 🎬 مرحبا", marks: [] },
        { text: " é", marks: [{ type: "bold" }] },
      ]),
    ),
  });
});

test("nothing either side typed is lost when a block merges", () => {
  fc.assert(
    fc.property(arbBlockEdits, ({ base, mine, theirs }) => {
      const merged = mergeBlock(base, mine, theirs);
      if (!merged.ok) return;
      for (const piece of insertedRuns(base, mine).concat(
        insertedRuns(base, theirs),
      ))
        expect(blockText(blockView(merged.block))).toContain(piece);
    }),
    { numRuns: 1_000 },
  );
});

test("seed 1: text both sides typed is taken once, wherever the diff of each side places it", () => {
  expect(
    mergeBlock(
      b(A, "[window:71][window:78]"),
      b(A, "[window:99][window:71][window:78][window:92]"),
      b(A, "[window:71][window:78][window:92]"),
    ),
  ).toEqual({
    ok: true,
    block: b(A, "[window:99][window:71][window:78][window:92]"),
  });
});
