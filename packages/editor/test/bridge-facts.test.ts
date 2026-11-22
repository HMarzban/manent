import { expect, test } from "bun:test";
import { profileFor, resolveSpec } from "@manent/pagination";
import type { LayoutBlock, PageProfile, Pagination } from "@manent/pagination";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { parseDoc } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { AllSelection, EditorState, TextSelection } from "prosemirror-state";
import {
  blockPos,
  factsOf,
  outlineOf,
  paginationKey,
  sceneAt,
} from "../src/index.ts";
import type { EditorWords, HistoryPort } from "../src/index.ts";
import { bid, docOfBlocks, script, state } from "./docs.ts";

const LABELS: Readonly<Record<string, string>> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
};

const words: EditorWords = {
  element: (_format, type) => LABELS[type] ?? "General",
  placeholder: () => null,
  picker: "Element",
  offFontNote: "note",
};

const noHistory: HistoryPort = {
  undo: () => false,
  redo: () => false,
  canUndo: () => false,
  canRedo: () => false,
  closeStep: () => {},
  onStep: () => () => {},
};

const pag = (s: EditorState): Pagination =>
  paginationKey.getState(s)!.pagination;
const profileOf = (s: EditorState): PageProfile =>
  paginationKey.getState(s)!.settings.profile;
const blockAtIndex = (s: EditorState, block: number): LayoutBlock =>
  paginationKey.getState(s)!.index.blocks[block]!;
const idAt = (s: EditorState, block: number): string =>
  blockAtIndex(s, block).id;

/** The caret `offset` characters into block `block`. */
function stateAtBlock(s: EditorState, block: number, offset: number) {
  const pos = blockPos(paginationKey.getState(s)!.index, block) + 1 + offset;
  return s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)));
}

/** Block `block` with these attributes changed. */
function withAttrs(
  s: EditorState,
  block: number,
  attrs: Readonly<Record<string, unknown>>,
): EditorState {
  const pos = blockPos(paginationKey.getState(s)!.index, block);
  const node = s.doc.nodeAt(pos)!;
  return s.apply(s.tr.setNodeMarkup(pos, null, { ...node.attrs, ...attrs }));
}

const isScene = (block: LayoutBlock): boolean =>
  block.type === "scene_heading" || block.type === "slug";

/** The last scene heading or slug at or before block `block`. */
function headingAtOrBefore(s: EditorState, block: number): number {
  const { blocks } = pag(s);
  for (let i = block; i >= 0; i--) if (isScene(blocks[i]!)) return i;
  throw new RangeError(`no scene heading at or before block ${block}`);
}

// counted by hand: the generated script stores no scene numbers
const expectedScene = (s: EditorState, block: number): string =>
  String(
    pag(s)
      .blocks.slice(0, block + 1)
      .filter(isScene).length,
  );

// the last page that starts at or before the caret
const expectedPage = (s: EditorState, block: number, offset: number): string =>
  pag(s).pages.findLast(
    (page) =>
      page.block < block || (page.block === block && page.offset <= offset),
  )!.label;

const labelOf = (s: EditorState): string =>
  words.element("screenplay", s.selection.$head.parent.attrs.type, null);

test("the facts of a place in the script", () => {
  const s = state(script(400));
  const at = stateAtBlock(s, 120, 3);
  const spec = resolveSpec(profileOf(at), blockAtIndex(at, 120));
  expect(
    factsOf(at, {
      history: noHistory,
      words,
      format: "screenplay",
      outline: outlineOf(pag(at), 120),
    }),
  ).toEqual({
    element: labelOf(at),
    page: expectedPage(at, 120, 3),
    pageCount: pag(at).pages.length,
    scene: expectedScene(at, 120),
    blockId: idAt(at, 120),
    sceneId: idAt(at, headingAtOrBefore(at, 120)),
    blockIndent: spec.indent,
    blockWidth: spec.width,
    blockAlign: spec.align,
    blockSpaceBefore: spec.spaceBefore,
    blockSpaceBeforeSet: blockAtIndex(at, 120).spaceBefore !== null,
    columnCells: profileOf(at).columnCells,
    pageRevision: null,
    pageOrdinal: null,
    canUndo: false,
    canRedo: false,
    selectionEmpty: true,
    selectedText: "",
    findCount: 0,
    findCurrent: null,
  });
});

test("a block's own layout is the fact, clamped as the engine draws it", () => {
  const at = stateAtBlock(
    withAttrs(state(script(40)), 5, { indent: 12, width: 5000 }),
    5,
    0,
  );
  expect(
    factsOf(at, {
      history: noHistory,
      words,
      format: "screenplay",
      outline: outlineOf(pag(at), 5),
    }),
  ).toMatchObject({ blockIndent: 12, blockWidth: 60 - 12 });
});

test("the outline lists headings with their numbers and the caret's scene", () => {
  const o = outlineOf(
    pag(
      state(
        docOfBlocks([
          ["scene_heading", "INT. A - DAY"],
          ["action", "x"],
          ["scene_heading", "EXT. B - NIGHT"],
          ["action", "y"],
        ]),
      ),
    ),
    3,
  );
  expect([
    o.entries,
    [...o.headingBlocks],
    sceneAt(o, 3),
    sceneAt(o, 1),
  ]).toEqual([
    [
      {
        blockId: bid(0),
        number: "1",
        heading: "INT. A - DAY",
        omitted: false,
        current: false,
        kind: "scene",
        synopsis: "",
        eighths: 1,
      },
      {
        blockId: bid(2),
        number: "2",
        heading: "EXT. B - NIGHT",
        omitted: false,
        current: true,
        kind: "scene",
        synopsis: "",
        eighths: 1,
      },
    ],
    [0, 2],
    "2",
    "1",
  ]);
});

test("the outline numbers each scene as the pages do, and lists chapters unnumbered", () => {
  const cases: readonly [FormatId, Node][] = [
    ["screenplay", script(600)],
    ["variety", parseDoc(corpusDoc(generateBlocks("variety", 600, 2)))],
    ["multicam", parseDoc(corpusDoc(generateBlocks("multicam", 600, 3)))],
    ["manuscript", parseDoc(corpusDoc(generateBlocks("manuscript", 600, 4)))],
    [
      "screenplay",
      docOfBlocks([
        ["scene_heading", "INT. A - DAY"],
        ["scene_heading", "INT. B - DAY"],
        ["slug", "COLD OPEN"],
      ]),
    ],
  ];
  const numbered = withAttrs(state(cases[4]![1]), 1, { num: "12A" });
  for (const s of [
    ...cases.map(([format, doc]) => state(doc, profileFor(format)!)),
    numbered,
  ]) {
    const p = pag(s);
    const { engine } = paginationKey.getState(s)!.settings;
    const o = outlineOf(p, p.blocks.length - 1);
    const headings = p.blocks.flatMap((block, i) =>
      isScene(block) || block.type === "chapter" ? [i] : [],
    );
    const scenes = o.entries.flatMap((entry, k) =>
      entry.kind === "scene" ? [k] : [],
    );
    expect([
      scenes.map((k) => o.headingBlocks[k]),
      scenes.map((k) => o.entries[k]!.number),
    ]).toEqual([headings, headings.map((i) => engine.sceneNumber(p, i))]);
  }
  expect(
    outlineOf(pag(numbered), 2).entries.map((entry) => entry.number),
  ).toEqual(["1", "12A", "3"]);
});

test("the caret before the first heading has no scene", () => {
  const s = stateAtBlock(
    state(
      docOfBlocks([
        ["action", "x"],
        ["scene_heading", "INT. A - DAY"],
      ]),
    ),
    0,
    0,
  );
  const outline = outlineOf(pag(s), 0);
  expect([
    outline.entries.map((entry) => entry.current),
    factsOf(s, { history: noHistory, words, format: "screenplay", outline }),
  ]).toMatchObject([[false], { scene: null, sceneId: null, blockId: bid(0) }]);
});

test("without pages the block's own facts are still read", () => {
  const doc = docOfBlocks([["action", "x"]]);
  const s = EditorState.create({ doc });
  const spaced = s.apply(
    s.tr.setNodeMarkup(1, null, {
      ...doc.child(0).child(0).attrs,
      spaceBefore: 2,
    }),
  );
  expect(
    factsOf(spaced, {
      history: noHistory,
      words,
      format: "ink",
      outline: { entries: [], headingBlocks: new Int32Array(0) },
    }),
  ).toEqual({
    element: "Action",
    page: null,
    pageCount: null,
    scene: null,
    blockId: bid(0),
    sceneId: null,
    blockIndent: null,
    blockWidth: null,
    blockAlign: null,
    blockSpaceBefore: null,
    blockSpaceBeforeSet: true,
    columnCells: null,
    pageRevision: null,
    pageOrdinal: null,
    canUndo: false,
    canRedo: false,
    selectionEmpty: true,
    selectedText: "",
    findCount: 0,
    findCurrent: null,
  });
});

test("with everything selected no block is the caret's", () => {
  const s = state(script(40));
  const all = s.apply(s.tr.setSelection(new AllSelection(s.doc)));
  const history: HistoryPort = { ...noHistory, canUndo: () => true };
  expect(
    factsOf(all, {
      history,
      words,
      format: "screenplay",
      outline: outlineOf(pag(all), 0),
    }),
  ).toEqual({
    element: null,
    page: null,
    pageCount: pag(all).pages.length,
    scene: null,
    blockId: null,
    sceneId: null,
    blockIndent: null,
    blockWidth: null,
    blockAlign: null,
    blockSpaceBefore: null,
    blockSpaceBeforeSet: null,
    columnCells: 60,
    pageRevision: null,
    pageOrdinal: null,
    canUndo: true,
    canRedo: false,
    selectionEmpty: false,
    selectedText: "",
    findCount: 0,
    findCurrent: null,
  });
});
