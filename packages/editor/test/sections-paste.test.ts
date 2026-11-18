import { expect, test } from "bun:test";
import type { BlockJSON } from "@manent/schema";
import { Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import {
  dropSlice,
  insertBlocks,
  pasteSlice,
  typeOverSelection,
} from "../src/index.ts";
import { bid, counter, docOf, ids, stateAt, texts } from "./docs.ts";

/** `n` action blocks whose ids already exist in the script. */
function pasted(n: number): BlockJSON[] {
  return Array.from({ length: n }, (_, i) => ({
    type: "block",
    attrs: { id: bid(i % 2), type: "action" },
    content: [{ type: "text", text: `pasted ${i}` }],
  }));
}

/** The blocks, as a copy from another script would hold them. */
function sliceOf(blocks: readonly string[]): Slice {
  return new Slice(docOf([blocks]).child(0).content, 0, 0);
}

function posAtEnd(doc: Node, block: number): number {
  return stateAt(doc, block, 0).selection.$head.end();
}

test("a paste at the end of a section gets sections of its own; in the middle it stays in the section; ids are new", () => {
  let s = stateAt(docOf([["a", "b"]]), 1, 1);
  s = s.apply(insertBlocks(s.tr, pasted(250), counter("p")));
  expect(ids(s.doc).map((x) => x.length)).toEqual([2, 100, 100, 50]);
  s = stateAt(s.doc, 0, 1);
  s = s.apply(insertBlocks(s.tr, pasted(3), counter("q")));
  expect([
    ids(s.doc).map((x) => x.length),
    ids(s.doc)[0]![4],
    new Set(ids(s.doc).flat()).size,
  ]).toEqual([[5, 100, 100, 50], bid(1), 255]);
});

test("a paste into an empty block reuses it; in the middle of a block it splits it", () => {
  const empty = stateAt(docOf([[""]]), 0, 0);
  const a = empty.apply(insertBlocks(empty.tr, pasted(2), counter("p")));
  expect([ids(a.doc)[0]![0], texts(a.doc)]).toEqual([
    bid(0),
    [["pasted 0", "pasted 1"]],
  ]);
  const mid = stateAt(docOf([["one two"]]), 0, 3);
  const b = mid.apply(insertBlocks(mid.tr, pasted(2), counter("p")));
  expect(texts(b.doc)).toEqual([["one", "pasted 0", "pasted 1", " two"]]);
});

test("one pasted block is text at the caret", () => {
  const s = stateAt(docOf([["abcd"]]), 0, 2);
  expect(
    texts(s.apply(pasteSlice(s, sliceOf(["XY"]), counter("p"))).doc),
  ).toEqual([["abXYcd"]]);
});

test("typing over a selection that spans sections keeps the sections", () => {
  const s = stateAt(
    docOf([
      ["a1", "a2"],
      ["b1", "b2"],
    ]),
    1,
    1,
    2,
    1,
  );
  expect(
    texts(
      s.apply(typeOverSelection(s, s.selection.from, s.selection.to, "X")!).doc,
    ),
  ).toEqual([["a1", "aX1"], ["b2"]]);
  expect(
    typeOverSelection(stateAt(docOf([["abc"]]), 0, 1, 0, 2), 2, 3, "X"),
  ).toBeNull();
});

test("a dragged selection is removed from where it was", () => {
  const s = stateAt(
    docOf([
      ["one", "two"],
      ["three", "four"],
    ]),
    0,
    0,
    0,
    3,
  ); // "one" selected and dragged to the end of "four"
  const out = s.apply(
    dropSlice(
      s,
      s.selection.content(),
      posAtEnd(s.doc, 3),
      "moved",
      counter("p"),
    ),
  );
  expect(texts(out.doc)).toEqual([
    ["", "two"],
    ["three", "fourone"],
  ]);
});
