import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { profileFor } from "@manent/pagination";
import {
  FORMAT_ELEMENTS,
  HIGHLIGHT_NAMES,
  TEXT_COLOUR_NAMES,
} from "@manent/schema";
import type { FormatId } from "@manent/schema";
import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  HIGHLIGHT_COLOURS,
  TEXT_COLOURS,
  insertPageBreak,
  paginationPlugin,
  runAction,
} from "../src/index.ts";
import type {
  ActionContext,
  ActionResult,
  EditorAction,
  ElementSlot,
  HistoryPort,
} from "../src/index.ts";
import {
  counter,
  docOf,
  docOfBlocks,
  docWithAttr,
  sp,
  stateAt,
  texts,
} from "./docs.ts";

withDom();

/** The state after `step`, which may dispatch any number of transactions. */
function act(
  start: EditorState,
  step: (state: EditorState, dispatch: (tr: Transaction) => void) => unknown,
): EditorState {
  let next = start;
  step(start, (tr) => {
    next = next.apply(tr);
  });
  return next;
}

/** Every block's attributes, in document order. */
function blockAttrs(s: EditorState): Readonly<Record<string, unknown>>[] {
  const attrs: Readonly<Record<string, unknown>>[] = [];
  s.doc.forEach((section) =>
    section.forEach((block) => attrs.push(block.attrs)),
  );
  return attrs;
}

const types = (s: EditorState): string[] =>
  blockAttrs(s).map((attrs) => String(attrs.type));

const attrOf = (s: EditorState, block: number, name: string): unknown =>
  blockAttrs(s)[block]![name];

/** The caret's block, counted in document order. */
function caretBlock(s: EditorState): number {
  let index = 0;
  let found = -1;
  s.doc.descendants((node, pos) => {
    if (node.type.name !== "block") return true;
    if (s.selection.from > pos && s.selection.from <= pos + node.nodeSize - 1)
      found = index;
    index++;
    return false;
  });
  return found;
}

/** The marks on the text at `pos`, each as its name and its value when it has one. */
function marksAt(s: EditorState, pos: number): string[] {
  return s.doc
    .resolve(pos)
    .marks()
    .map((m) =>
      m.attrs.value === undefined
        ? m.type.name
        : `${m.type.name}:${m.attrs.value}`,
    );
}

// The slots these tests use; a format offers one when it has its element.
const SLOT_ELEMENTS: Partial<
  Record<ElementSlot, { type: string; kind: string | null }>
> = {
  "2": { type: "action", kind: null },
  "3": { type: "character", kind: null },
  "6": { type: "transition", kind: null },
  E: { type: "act_break", kind: "end_of_act" },
};

const countingHistory = (): HistoryPort & { undos: number; redos: number } => {
  const history = {
    undos: 0,
    redos: 0,
    undo: () => {
      history.undos++;
      return true;
    },
    redo: () => {
      history.redos++;
      return true;
    },
    canUndo: () => true,
    canRedo: () => true,
    closeStep: () => {},
    onStep: () => () => {},
  };
  return history;
};

function contextFor(
  format: FormatId,
  options: { editable?: boolean; history?: HistoryPort } = {},
): ActionContext {
  return {
    format: () => format,
    slotElement: (f, slot) => {
      const element = SLOT_ELEMENTS[slot];
      return element !== undefined &&
        FORMAT_ELEMENTS[f].some((type) => type === element.type)
        ? element
        : null;
    },
    history: options.history ?? countingHistory(),
    ids: counter("a"),
    openPicker: () => {},
    editable: () => options.editable ?? true,
    columnCells: () => profileFor(format)?.columnCells ?? null,
  };
}

/** runAction in `format` on a view of `start` (one block, "one", the caret at its end) that hands each transaction to `dispatch`. */
function runOn(
  format: FormatId,
  action: EditorAction,
  start: EditorState = stateAt(docOf([["one"]]), 0, 3),
  dispatch: (tr: Transaction) => void = () => {},
  context: ActionContext = contextFor(format),
): ActionResult {
  const view = new EditorView(null, {
    state: start,
    dispatchTransaction: dispatch,
  });
  const result = runAction(view, action, context);
  view.destroy();
  return result;
}

/** `start` on a screenplay page: with the pagination plugin, whose deferred work runs at once. */
const paged = (start: EditorState): EditorState =>
  start.reconfigure({
    plugins: [
      paginationPlugin({
        profile: sp,
        defer: (work) => work(),
        offFontNote: "note",
      }),
    ],
  });

/** The state after runOn in `format` on `start`. */
const actOn = (
  start: EditorState,
  action: EditorAction,
  format: FormatId = "screenplay",
): EditorState => act(start, (st, d) => runOn(format, action, st, d));

/** Each of the first two blocks' indent, width, align and space before. */
const layoutOf = (s: EditorState): unknown[][] =>
  [0, 1].map((k) =>
    ["indent", "width", "align", "spaceBefore"].map((name) =>
      attrOf(s, k, name),
    ),
  );

test("a page break goes where the caret is, and the caret goes past it", () => {
  const s = act(
    stateAt(docOf([["one two"]]), 0, 3),
    insertPageBreak(counter("n")),
  );
  expect([types(s), texts(s.doc), caretBlock(s)]).toEqual([
    ["action", "page_break", "action"],
    [["one", "", " two"]],
    2,
  ]);
});

test("a page break after the last line is followed by a new empty line of that line's element", () => {
  const start = stateAt(docOfBlocks([["character", "DANA"]]), 0, 4);
  const s = act(start, insertPageBreak(counter("n")));
  expect([types(s), texts(s.doc), caretBlock(s)]).toEqual([
    ["character", "page_break", "character"],
    [["DANA"], ["", ""]],
    2,
  ]);
});

test("an element the format does not have is refused", () => {
  expect(runOn("stage_play", { kind: "element", slot: "6" })).toEqual({
    ok: false,
    reason: "not_in_format",
  });
});

test("an element is set on every block the selection touches, with its kind", () => {
  const start = stateAt(docOf([["one", "two", "three"]]), 0, 1, 1, 1);
  const s = actOn(start, { kind: "element", slot: "E" });
  expect([types(s), [0, 1, 2].map((k) => attrOf(s, k, "kind"))]).toEqual([
    ["act_break", "act_break", "action"],
    ["end_of_act", "end_of_act", null],
  ]);
});

test("formatting is marks, and layout is attributes", () => {
  const all = stateAt(docOf([["one two"]]), 0, 0, 0, 7);
  const bold = actOn(all, { kind: "style", mark: "bold" });
  const red = actOn(actOn(all, { kind: "colour", value: "red" }), {
    kind: "colour",
    value: "red",
  });
  const yellow = actOn(actOn(red, { kind: "highlight", value: "pink" }), {
    kind: "highlight",
    value: "yellow",
  });
  const caret = actOn(stateAt(docOf([["one"]]), 0, 3), {
    kind: "colour",
    value: "blue",
  });
  const centred = actOn(all, { kind: "align", value: "center" });
  const spaced = actOn(all, { kind: "space_before" });
  expect({
    bold: [
      marksAt(bold, 2),
      marksAt(actOn(bold, { kind: "style", mark: "bold" }), 2),
    ],
    colour: [
      marksAt(red, 2),
      marksAt(actOn(red, { kind: "colour", value: "green" }), 2),
      marksAt(actOn(red, { kind: "colour", value: null }), 2),
    ],
    highlight: [
      marksAt(yellow, 2),
      marksAt(actOn(yellow, { kind: "highlight", value: null }), 2),
    ],
    stored: (caret.storedMarks ?? []).map(
      (m) => `${m.type.name}:${m.attrs.value}`,
    ),
    align: [
      attrOf(centred, 0, "align"),
      attrOf(actOn(centred, { kind: "align", value: "center" }), 0, "align"),
    ],
    spaceBefore: [
      attrOf(spaced, 0, "spaceBefore"),
      attrOf(actOn(spaced, { kind: "space_before" }), 0, "spaceBefore"),
    ],
  }).toEqual({
    bold: [["bold"], []],
    colour: [["color:red"], ["color:green"], []],
    highlight: [["color:red", "highlight:yellow"], ["color:red"]],
    stored: ["color:blue"],
    align: ["center", null],
    spaceBefore: [1, null],
  });
});

test("a layout from the Ruler is clamped to what the page draws", () => {
  const s = act(paged(stateAt(docOf([["one"]]), 0, 1)), (st, d) =>
    runOn("screenplay", { kind: "layout", indent: 70, width: 5000 }, st, d),
  );
  expect([attrOf(s, 0, "indent"), attrOf(s, 0, "width")]).toEqual([59, 1]);
  expect(runOn("screenplay", { kind: "layout" })).toEqual({
    ok: false,
    reason: "nothing_to_do",
  });
});

test("a layout sets only the fields it gives, floored, and null returns one to the element's", () => {
  const start = paged(stateAt(docOf([["one", "two"]]), 0, 1, 1, 1));
  const set = actOn(start, { kind: "layout", indent: 10.7, spaceBefore: 40 });
  const cleared = actOn(set, { kind: "layout", indent: null, align: "right" });
  expect([layoutOf(set), layoutOf(cleared)]).toEqual([
    [
      [10, null, null, 10],
      [10, null, null, 10],
    ],
    [
      [null, null, "right", 10],
      [null, null, "right", 10],
    ],
  ]);
});

test("a Ruler width is clamped against the indent its line is drawn at", () => {
  const doc = docWithAttr(
    docOfBlocks([
      ["action", "x"],
      ["dialogue", "Go."],
      ["dialogue", "No."],
    ]),
    2,
    "dual",
    "right",
  );
  const s = actOn(paged(stateAt(doc, 0, 0, 2, 1)), {
    kind: "layout",
    width: 5000,
  });
  expect([0, 1, 2].map((k) => attrOf(s, k, "width"))).toEqual([60, 50, 28]);
});

test("a Ruler width set while a composition holds the pages back is clamped for its own line", () => {
  const start = paged(
    stateAt(
      docOfBlocks([
        ["action", "x"],
        ["dialogue", "Go."],
        ["action", "y"],
      ]),
      0,
      1,
    ),
  );
  const composing = start.apply(
    start.tr.insertText("kkkkkkkk", 2).setMeta("composition", 1),
  );
  const onDialogue = composing.apply(
    composing.tr.setSelection(TextSelection.create(composing.doc, 14)),
  );
  const s = actOn(onDialogue, { kind: "layout", width: 5000 });
  expect([0, 1, 2].map((k) => attrOf(s, k, "width"))).toEqual([null, 50, null]);
});

test("a layout without pages clamps nothing but space before", () => {
  const s = actOn(
    stateAt(docOf([["one"]]), 0, 1),
    { kind: "layout", indent: 70.5, width: 5000, spaceBefore: 12 },
    "ink",
  );
  expect(
    ["indent", "width", "spaceBefore"].map((name) => attrOf(s, 0, name)),
  ).toEqual([70, 5000, 10]);
});

test("the colour lists are the schema's", () => {
  expect([TEXT_COLOURS, HIGHLIGHT_COLOURS]).toEqual([
    TEXT_COLOUR_NAMES,
    HIGHLIGHT_NAMES,
  ]);
});

test("a read-only page refuses every change but undo", () => {
  const history = countingHistory();
  const readOnly = contextFor("screenplay", { editable: false, history });
  const changes: EditorAction[] = [
    { kind: "element", slot: "2" },
    { kind: "picker" },
    { kind: "dual_dialogue" },
    { kind: "page_break" },
    { kind: "style", mark: "bold" },
    { kind: "colour", value: "red" },
    { kind: "highlight", value: null },
    { kind: "align", value: "right" },
    { kind: "space_before" },
    { kind: "layout", indent: 4 },
  ];
  const run = (action: EditorAction) =>
    runOn("screenplay", action, undefined, undefined, readOnly);
  expect([
    changes.map(run),
    run({ kind: "undo" }),
    run({ kind: "redo" }),
    [history.undos, history.redos],
  ]).toEqual([
    changes.map((): ActionResult => ({ ok: false, reason: "read_only" })),
    { ok: true },
    { ok: true },
    [1, 1],
  ]);
});
