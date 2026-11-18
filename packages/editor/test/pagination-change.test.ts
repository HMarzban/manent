import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import {
  blockPos,
  paginationKey,
  setPagination,
  toIndex,
} from "../src/index.ts";
import { script, state } from "./docs.ts";

// read from the document itself: while composing, the plugin's index is the one from before
const posInBlock = (s: EditorState, block: number, offset: number): number =>
  blockPos(toIndex(s.doc), block) + 1 + offset;

/** A new empty block right after block `block`, in its section. */
const insertAfter = (s: EditorState, block: number): Transaction =>
  s.tr.insert(
    blockPos(toIndex(s.doc), block + 1),
    schema.nodes.block.create({ id: "n000000000000001", type: "action" }),
  );

test("a transaction says which blocks it replaced, and a selection names none", () => {
  const s = state(script());
  const typed = s.apply(s.tr.insertText("k", posInBlock(s, 40, 2)));
  expect(paginationKey.getState(typed)!.change).toEqual({
    first: 40,
    oldEnd: 41,
    newEnd: 41,
  });
  expect(
    paginationKey.getState(
      typed.apply(
        typed.tr.setSelection(TextSelection.near(typed.doc.resolve(5))),
      ),
    )!.change,
  ).toBeNull();
  const entered = typed.apply(insertAfter(typed, 40));
  expect(paginationKey.getState(entered)!.change).toEqual({
    first: 41,
    oldEnd: 41,
    newEnd: 42,
  });
});

test("while composing there is no change, and the first state after it carries everything typed", () => {
  const s = state(script());
  const a = s.apply(
    s.tr.insertText("k", posInBlock(s, 7, 1)).setMeta("composition", 1),
  );
  const b = a.apply(
    a.tr.insertText("a", posInBlock(a, 9, 1)).setMeta("composition", 1),
  );
  expect([
    paginationKey.getState(a)!.change,
    paginationKey.getState(b)!.change,
  ]).toEqual([null, null]);
  expect(
    paginationKey.getState(b.apply(setPagination(b.tr, { repaginate: true })))!
      .change,
  ).toEqual({ first: 7, oldEnd: 10, newEnd: 10 });
});

test("an edit that ends a composition names the composed blocks and its own", () => {
  const s = state(script());
  const composing = s.apply(
    s.tr.insertText("k", posInBlock(s, 7, 1)).setMeta("composition", 1),
  );
  const entered = composing.apply(insertAfter(composing, 2));
  expect(paginationKey.getState(entered)!.change).toEqual({
    first: 3,
    oldEnd: 8,
    newEnd: 9,
  });
});

test("the first state names no change, and a new profile names every block", () => {
  const s = state(script(300));
  const restyled = s.apply(
    setPagination(s.tr, {
      profile: { ...paginationKey.getState(s)!.settings.profile, key: "other" },
    }),
  );
  expect([
    paginationKey.getState(s)!.change,
    paginationKey.getState(restyled)!.change,
  ]).toEqual([null, { first: 0, oldEnd: 300, newEnd: 300 }]);
});
