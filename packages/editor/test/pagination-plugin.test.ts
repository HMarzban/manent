import { expect, test } from "bun:test";
import {
  ENGINE_VERSION,
  applyLayoutPatches,
  engineFor,
  paginate,
  profileFor,
  specKey,
  toLayoutBlocks,
} from "@manent/pagination";
import type { LayoutPatches, PageProfile } from "@manent/pagination";
import { BLOCK_TYPES, FORMATS, blocksOf } from "@manent/schema";
import fc from "fast-check";
import { TextSelection } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import {
  blockAt,
  blockPos,
  paginationKey,
  setPagination,
  toIndex,
} from "../src/index.ts";
import {
  arbTransactions,
  docWithAttr,
  replaceWholeDoc,
  script,
  sp,
  state,
} from "./docs.ts";

const pages = (s: EditorState) => paginationKey.getState(s)!.pagination.pages;
const full = (s: EditorState, profile: PageProfile = sp) =>
  paginate(toLayoutBlocks(blocksOf(s.doc)), profile).pages;

test("a selection-only transaction does no work", () => {
  const s = state(script());
  const next = s.apply(
    s.tr.setSelection(TextSelection.near(s.doc.resolve(500))),
  );
  expect(paginationKey.getState(next) === paginationKey.getState(s)).toBe(true);
});

test("typing, and a ruler drag, repaginate in the same transaction", () => {
  const s = state(script());
  const typed = s.apply(
    s.tr.insertText(
      " and a good deal more text to push this over the line",
      300,
    ),
  );
  expect([pages(typed), paginationKey.getState(typed)!.engineRuns]).toEqual([
    full(typed),
    paginationKey.getState(s)!.engineRuns + 1,
  ]);
  const dragged = s.apply(
    s.tr.setNodeAttribute(
      blockPos(paginationKey.getState(s)!.index, 40),
      "width",
      20,
    ),
  );
  expect([
    pages(dragged),
    paginationKey.getState(dragged)!.index.blocks[40]!.width,
  ]).toEqual([full(dragged), 20]);
});

test("a remote change that replaces the whole document is found by node identity", () => {
  const s = state(script());
  const before = paginationKey.getState(s)!;
  const next = s.apply(
    replaceWholeDoc(s, 700, "rewritten by someone else").setMeta(
      "remote",
      true,
    ),
  );
  const after = paginationKey.getState(next)!;
  expect([
    after.index.blocks.filter((b, i) => b !== before.index.blocks[i]).length,
    after.pagination.pages,
  ]).toEqual([1, full(next)]);
});

test("a composition freezes pagination until it ends", () => {
  const s = state(script());
  const typing = s.apply(s.tr.insertText("k", 300).setMeta("composition", 1));
  const frozen = paginationKey.getState(typing)!;
  expect([
    frozen.frozen,
    frozen.engineRuns,
    frozen.pagination === paginationKey.getState(s)!.pagination,
  ]).toEqual([true, paginationKey.getState(s)!.engineRuns, true]);
  const done = typing.apply(setPagination(typing.tr, { repaginate: true }));
  expect([paginationKey.getState(done)!.frozen, pages(done)]).toEqual([
    false,
    full(done),
  ]);
});

test("a new profile or lock table repaginates everything, and a profile from another engine is refused", () => {
  const s = state(script());
  const a4 = profileFor("screenplay", { paper: "a4" })!;
  expect(pages(s.apply(setPagination(s.tr, { profile: a4 })))).toEqual(
    full(s, a4),
  );
  expect(() =>
    s.apply(setPagination(s.tr, { profile: { ...a4, engineVersion: 2 } })),
  ).toThrow(RangeError);
  expect(paginationKey.getState(s)!.settings.engine).toBe(
    engineFor(ENGINE_VERSION)!,
  );
});

test("a layout patch changes the engine's blocks and nothing else, in the plugin too", () => {
  const s = state(script());
  const before = paginationKey.getState(s)!;
  const ids = before.index.blocks.map((b) => b.id);
  const layout: LayoutPatches = {
    key: "omit-3",
    patches: new Map([[ids[3]!, { text: "OMITTED" }]]),
  };
  const s2 = s.apply(setPagination(s.tr, { layout }));
  const next = paginationKey.getState(s2)!;
  expect([
    next.index.layoutKey,
    next.index.blocks[3]!.text,
    next.index.blocks.filter((b, i) => b !== before.index.blocks[i]).length,
  ]).toEqual(["omit-3", "OMITTED", 1]);
  expect(next.pagination.pages).toEqual(
    paginate(applyLayoutPatches(toLayoutBlocks(blocksOf(s.doc)), layout), sp)
      .pages,
  );
  const typed = s2.apply(
    s2.tr.insertText("z", blockPos(next.index, ids.length - 1) + 1),
  );
  // the same key keeps the patched block object
  expect(paginationKey.getState(typed)!.index.blocks[3]).toBe(
    next.index.blocks[3]!,
  );
});

test("the index knows where every block is, and a block the schema refuses is still laid out", () => {
  const index = toIndex(script());
  expect(
    index.blocks.map((_, i) => blockAt(index, blockPos(index, i) + 1)),
  ).toEqual(index.blocks.map((_, i) => i));
  // an attribute value validation would refuse
  const bad = docWithAttr(script(), 3, "dual", "middle");
  expect([toIndex(bad).blocks[3]!.type, toIndex(bad).blocks[3]!.text]).toEqual([
    "general",
    bad.child(0).child(3).textContent,
  ]);
});

test("the plugin's pages are a full pagination's after any transactions", () => {
  const start = state(script(400));
  fc.assert(
    fc.property(arbTransactions, (apply) => {
      const s = apply(start);
      expect(pages(s)).toEqual(full(s));
    }),
    { numRuns: 100 },
  );
});

test("every element and format the schema knows has a layout", () => {
  expect(BLOCK_TYPES.map((t) => specKey(t, null) in sp.elements)).toEqual(
    BLOCK_TYPES.map(() => true),
  );
  expect(FORMATS.map((f) => profileFor(f) === null)).toEqual(
    FORMATS.map((f) => f === "ink"),
  );
});
