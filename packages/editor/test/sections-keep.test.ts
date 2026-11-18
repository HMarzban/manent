import { expect, test } from "bun:test";
import { EditorState, Selection, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { keepKey, keepPlugin, keptSections, toDocEdge } from "../src/index.ts";
import { docOf, stateAt } from "./docs.ts";

const ten = docOf(Array.from({ length: 10 }, (_, i) => [`s${i}a`, `s${i}b`])); // block 2k is section k's first

test("the selection's sections and one on each side stay rendered", () => {
  expect([
    keptSections(stateAt(ten, 10, 1)),
    keptSections(stateAt(ten, 4, 0, 14, 1)),
    keptSections(stateAt(ten, 0, 0)),
    keptSections(stateAt(ten, 19, 0)),
  ]).toEqual([
    [4, 5, 6],
    [1, 2, 3, 6, 7, 8],
    [0, 1],
    [8, 9],
  ]);
});

test("they are decorations on the sections, rebuilt only when the caret changes section", () => {
  let s = EditorState.create({
    doc: ten,
    plugins: [keepPlugin()],
    selection: stateAt(ten, 10, 1).selection,
  });
  const first = keepKey.getState(s)!;
  expect([
    first.key,
    first.decorations.find().map((d) => s.doc.resolve(d.from).index(0)),
  ]).toEqual(["4,5,6", [4, 5, 6]]);
  s = s.apply(
    s.tr.setSelection(TextSelection.create(s.doc, s.selection.head + 1)),
  );
  expect(keepKey.getState(s)!.decorations === first.decorations).toBe(true);
  s = s.apply(s.tr.setSelection(TextSelection.near(s.doc.resolve(1))));
  expect(keepKey.getState(s)!.key).toBe("0,1");
});

test("the document's edges are reached from the model", () => {
  const s = stateAt(ten, 10, 1);
  const seen: Transaction[] = [];
  toDocEdge("end", "move")(s, (t) => seen.push(t));
  toDocEdge("start", "extend")(s, (t) => seen.push(t));
  expect(
    seen.map((t) => [t.selection.anchor, t.selection.head, t.scrolledIntoView]),
  ).toEqual([
    [Selection.atEnd(ten).head, Selection.atEnd(ten).head, true],
    [s.selection.anchor, Selection.atStart(ten).head, true],
  ]);
});
