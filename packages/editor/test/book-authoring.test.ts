import { expect, test } from "bun:test";
import { paginate, profileFor } from "@manent/pagination";
import { attrsForNewBlock, minSchemaVersionOf, schema } from "@manent/schema";
import { EditorState, TextSelection } from "prosemirror-state";
import { insertChapter, insertSceneBreak } from "../src/actions/book-blocks.ts";
import { setFirstLine } from "../src/actions/layout.ts";
import {
  clearFormatting,
  setLink,
  toggleStyle,
} from "../src/actions/styles.ts";
import { MARK_BIT, factsOf } from "../src/bridge/facts.ts";
import { paginationWordCount } from "../src/bridge/word-count.ts";
import { detectOnEnter } from "../src/elements/detect-rules.ts";
import { isDriftCandidate } from "../src/pagination/drift.ts";
import { sectionsOf } from "../src/script-editor/furniture.ts";
import type { EditorWords, HistoryPort } from "../src/script-editor/ports.ts";

let nextId = 1;
const ids = (): string => `bk_${String(nextId++).padStart(4, "0")}`;

const noHistory: HistoryPort = {
  undo: () => false,
  redo: () => false,
  canUndo: () => false,
  canRedo: () => false,
  closeStep: () => {},
  onStep: () => () => {},
};

const words: EditorWords = {
  element: (_format, type) => type,
  placeholder: () => null,
  picker: "Element",
  offFontNote: "",
};

function makeState(
  blocks: readonly { readonly type: string; readonly text: string }[],
): EditorState {
  const nodes = blocks.map((b) =>
    schema.nodes.block.create(
      attrsForNewBlock(b.type, ids()),
      b.text === "" ? null : schema.text(b.text),
    ),
  );
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.section.create(null, nodes),
  ]);
  return EditorState.create({ doc });
}

test("setLink applies safe URLs, refuses unsafe schemes, and removes link on collapsed caret", () => {
  let state = makeState([{ type: "body", text: "Read the almanac." }]);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 11, 18)),
  );

  expect(setLink(state, "javascript:alert(1)")).toEqual({
    ok: false,
    reason: "nothing_to_do",
  });

  const applied = setLink(state, "https://example.com/almanac", (tr) => {
    state = state.apply(tr);
  });
  expect(applied).toEqual({ ok: true });

  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 14)),
  );
  const facts = factsOf(state, {
    history: noHistory,
    words,
    format: "manuscript",
    outline: { entries: [], headingBlocks: new Int32Array(0) },
    wordCount: 3,
  });
  expect(facts.marksMask & MARK_BIT.link).toBe(MARK_BIT.link);
  expect(facts.markLink).toBe("https://example.com/almanac");
  expect(facts.blockType).toBe("body");
  expect(facts.wordCount).toBe(3);

  setLink(state, null, (tr) => {
    state = state.apply(tr);
  });
  const after = factsOf(state, {
    history: noHistory,
    words,
    format: "manuscript",
    outline: { entries: [], headingBlocks: new Int32Array(0) },
  });
  expect(after.marksMask & MARK_BIT.link).toBe(0);
  expect(after.markLink).toBeNull();
});

test("clearFormatting removes inline styles while preserving suggestion marks", () => {
  let state = makeState([{ type: "body", text: "Styled text" }]);
  state = state.apply(
    state.tr
      .addMark(2, 13, schema.marks.bold.create())
      .addMark(2, 13, schema.marks.color.create({ value: "blue" }))
      .addMark(
        2,
        13,
        schema.marks.suggest_insert.create({
          id: "sg1",
          authorUserId: "u1",
          at: 1,
        }),
      ),
  );
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 2, 13)),
  );

  clearFormatting(state, (tr) => {
    state = state.apply(tr);
  });
  const names = state.doc.nodeAt(2)!.marks.map((m) => m.type.name);
  expect(names).toEqual(["suggest_insert"]);
});

test("setFirstLine sets drop_cap and flush, skips drift measurement, and bumps minSchemaVersion to 4", () => {
  let state = makeState([
    { type: "body", text: "Every harbour keeps two clocks." },
  ]);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 4)),
  );
  setFirstLine(state, "drop_cap", (tr) => {
    state = state.apply(tr);
  });
  const node = state.doc.child(0).child(0);
  expect(node.attrs.firstLine).toBe("drop_cap");
  expect(isDriftCandidate(node, [])).toBe(false);
  expect(minSchemaVersionOf(state.doc.toJSON())).toBe(4);
  expect(
    factsOf(state, {
      history: noHistory,
      words,
      format: "manuscript",
      outline: { entries: [], headingBlocks: new Int32Array(0) },
    }).blockFirstLine,
  ).toBe("drop_cap");

  setFirstLine(state, "raised_cap", (tr) => {
    state = state.apply(tr);
  });
  expect(state.doc.child(0).child(0).attrs.firstLine).toBe("raised_cap");
  expect(isDriftCandidate(state.doc.child(0).child(0), [])).toBe(false);
  expect(minSchemaVersionOf(state.doc.toJSON())).toBe(4);

  setFirstLine(state, null, (tr) => {
    state = state.apply(tr);
  });
  expect(isDriftCandidate(state.doc.child(0).child(0), [])).toBe(true);
  expect(minSchemaVersionOf(state.doc.toJSON())).toBe(1);
});

test("superscript and subscript marks are mutually exclusive, publish MARK_BIT, bump schema to 4 and clear cleanly", () => {
  let state = makeState([{ type: "body", text: "H2O note1" }]);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 3, 4)),
  );
  toggleStyle(state, "sub", (tr) => {
    state = state.apply(tr);
  });
  expect(minSchemaVersionOf(state.doc.toJSON())).toBe(4);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 4)),
  );
  const subFacts = factsOf(state, {
    history: noHistory,
    words,
    format: "manuscript",
    outline: { entries: [], headingBlocks: new Int32Array(0) },
  });
  expect(subFacts.marksMask & MARK_BIT.sub).toBe(MARK_BIT.sub);

  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 3, 4)),
  );
  toggleStyle(state, "sup", (tr) => {
    state = state.apply(tr);
  });
  const markNames = state.doc.nodeAt(3)!.marks.map((m) => m.type.name);
  expect(markNames).toEqual(["sup"]);

  clearFormatting(state, (tr) => {
    state = state.apply(tr);
  });
  expect(state.doc.nodeAt(3)!.marks).toEqual([]);
  expect(minSchemaVersionOf(state.doc.toJSON())).toBe(1);
});

test("insertSceneBreak and insertChapter add manuscript blocks cleanly", () => {
  let state = makeState([{ type: "body", text: "Opening line." }]);
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 15)),
  );

  insertSceneBreak(ids)(state, (tr) => {
    state = state.apply(tr);
  });
  const typesAfterBreak: string[] = [];
  state.doc.forEach((sec) => {
    sec.forEach((blk) => typesAfterBreak.push(String(blk.attrs.type)));
  });
  expect(typesAfterBreak).toEqual(["body", "break", "body"]);

  insertChapter(ids, { title: "2. The Bar", atEnd: true })(state, (tr) => {
    state = state.apply(tr);
  });
  const lastSec = state.doc.lastChild!;
  expect(lastSec.child(lastSec.childCount - 2).attrs.type).toBe("chapter");
  expect(lastSec.child(lastSec.childCount - 2).textContent).toBe("2. The Bar");
  expect(lastSec.child(lastSec.childCount - 1).attrs.type).toBe("body");
});

test("manuscript Enter detection converts ***, * * * and --- in body to break", () => {
  const body = { type: "body" as const, kind: null };
  expect(detectOnEnter("manuscript", body, "***")).toEqual({
    type: "break",
    kind: null,
  });
  expect(detectOnEnter("manuscript", body, " * * * ")).toEqual({
    type: "break",
    kind: null,
  });
  expect(detectOnEnter("manuscript", body, "---")).toEqual({
    type: "break",
    kind: null,
  });
  expect(detectOnEnter("manuscript", body, "Ordinary prose.")).toBeNull();
});

test("sectionsOf resolves chapter headings and paginationWordCount counts printed words", () => {
  const profile = profileFor("manuscript")!;
  const lb = (id: string, type: string, text: string) => ({
    id,
    type,
    kind: null,
    text,
    styles: new Uint8Array(text.length),
    dual: null,
    num: null,
    omitted: false,
    align: null,
    indent: null,
    width: null,
    spaceBefore: null,
    noContd: false,
  });
  const p = paginate(
    [
      lb("c1", "chapter", "1. High Water"),
      lb("b1", "body", "First chapter prose."),
      lb("g1", "group", "Hidden outline note"),
      lb("c2", "chapter", "2. The Bar"),
      lb("b2", "body", "Second chapter prose."),
    ],
    profile,
  );
  expect(sectionsOf(p)).toEqual(["1. High Water", "2. The Bar"]);
  expect(paginationWordCount(p.blocks)).toBe(12);
});
