import { expect, test } from "bun:test";
import { AllSelection, TextSelection } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { BlockIndex } from "../src/index.ts";
import { blockPos, paginationKey, placeOf, positionOf } from "../src/index.ts";
import {
  bid,
  docOf,
  script as corpusScript,
  state as paginatedState,
  stateAt,
} from "./docs.ts";

const index = (s: EditorState): BlockIndex => paginationKey.getState(s)!.index;
const idAt = (s: EditorState, block: number): string =>
  index(s).blocks[block]!.id;

test("a cursor is found near its hint without a walk", () => {
  const s = paginatedState(corpusScript(2000));
  const id = idAt(s, 1500);
  expect(positionOf(s, { blockId: id, offset: 3 }, 1490)).toBe(
    blockPos(index(s), 1500) + 1 + 3,
  );
  expect(positionOf(s, { blockId: id, offset: 3 }, 100)).toBeNull();
  expect(positionOf(s, { blockId: "gone", offset: 0 }, 1500)).toBeNull();
});

test("the local place is block ids and offsets", () => {
  expect(placeOf(stateAt(docOf([["one", "two"]]), 0, 1, 1, 2))).toEqual({
    anchor: { blockId: bid(0), offset: 1 },
    head: { blockId: bid(1), offset: 2 },
    at: 1,
  });
});

test("without pages a place is found across sections, and an offset past the text stops at its end", () => {
  const s = stateAt(
    docOf([
      ["one", "two"],
      ["three", "four"],
    ]),
    3,
    0,
  );
  expect([
    positionOf(s, { blockId: bid(2), offset: 4 }, 0),
    positionOf(s, { blockId: bid(3), offset: 99 }, 3),
    positionOf(s, { blockId: bid(3), offset: 0 }, 300),
  ]).toEqual([18, 25, null]);
  expect(placeOf(s)).toEqual({
    anchor: { blockId: bid(3), offset: 0 },
    head: { blockId: bid(3), offset: 0 },
    at: 3,
  });
});

test("with pages the head's index comes from the sections before it", () => {
  const s = paginatedState(corpusScript(450));
  const pos = blockPos(index(s), 333) + 1;
  const at = s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)));
  expect(placeOf(at)).toEqual({
    anchor: { blockId: idAt(s, 333), offset: 0 },
    head: { blockId: idAt(s, 333), offset: 0 },
    at: 333,
  });
});

test("a selection that is not inside a block has no place", () => {
  const s = stateAt(docOf([["one", "two"]]), 0, 0);
  expect(placeOf(s.apply(s.tr.setSelection(new AllSelection(s.doc))))).toBe(
    null,
  );
});
