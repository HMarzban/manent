import { expect, test } from "bun:test";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { changeCount, compareDocs } from "@manent/revisions";
import { parseDoc } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import fc from "fast-check";
import { EditorState } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import type { Decoration, EditorView } from "prosemirror-view";
import {
  blockPos,
  changesKey,
  changesPlugin,
  isDriftCandidate,
  paginationKey,
  setChanges,
} from "../src/index.ts";
import type { ChangesDisplay } from "../src/index.ts";
import { arbTransactions, bid, state as paginated } from "./docs.ts";

const A = "action";
const b = (type: string, text: string): [string, string] => [type, text];

/** One section of blocks, each [element, text]; block k has the id bid(k). */
function doc(...blocks: [string, string][]): DocJSON {
  return {
    type: "doc",
    content: [
      {
        type: "section",
        content: blocks.map(([type, text], k) => ({
          type: "block",
          attrs: { id: bid(k), type },
          content: [{ type: "text", text }],
        })),
      },
    ],
  };
}

const corpus = (count: number): DocJSON =>
  corpusDoc(generateBlocks("screenplay", count, 1));

/** The document with each block k replaced by the blocks `edit` gives for it. */
function edited(
  source: DocJSON,
  edit: (block: BlockJSON, k: number) => BlockJSON[],
): DocJSON {
  let k = 0;
  return {
    type: "doc",
    content: (source.content ?? []).map((section) => ({
      type: "section",
      content: (section.content ?? []).flatMap((block) => edit(block, k++)),
    })),
  };
}

const changed = (block: BlockJSON): BlockJSON => ({
  ...block,
  content: [{ type: "text", text: "Rain on the glass." }],
});

/** corpus(2,000) with `count` blocks, evenly spaced, passed through `change`. */
const baselineWith = (
  count: number,
  change: (block: BlockJSON) => BlockJSON,
): DocJSON =>
  edited(corpus(2_000), (block, k) => [
    k % (2_000 / count) === 0 ? change(block) : block,
  ]);

/** A state of `live` with the pagination plugin and then the changes plugin, showing the changes since `baseline`. */
function withChanges(
  live: DocJSON,
  baseline: DocJSON,
  display: ChangesDisplay = "page",
): EditorState {
  const plain = paginated(parseDoc(live));
  const s = EditorState.create({
    doc: plain.doc,
    plugins: [...plain.plugins, changesPlugin()],
  });
  return s.apply(
    setChanges(s.tr, {
      baseline,
      comparison: compareDocs(baseline, live),
      display,
    }),
  );
}

const withoutPlugin = (s: EditorState): EditorState =>
  EditorState.create({
    doc: s.doc,
    plugins: s.plugins.filter((plugin) => plugin.spec.key !== changesKey),
  });

const posIn = (s: EditorState, block: number, offset = 0): number =>
  blockPos(paginationKey.getState(s)!.index, block) + 1 + offset;

/** An element a widget draws, as far as the test reads it. */
class DrawnElement {
  className = "";
  textContent = "";
  readonly attributes = new Map<string, string>();
  constructor(readonly tagName: string) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

// a widget draws into the view's own document; this one records what it is given
const recordingView = {
  dom: {
    ownerDocument: { createElement: (tag: string) => new DrawnElement(tag) },
  },
} as unknown as EditorView;

/** What prosemirror-view keeps of a decoration on a member its types leave out. */
function typeOf(decoration: Decoration): Record<string, unknown> {
  const type: unknown = Reflect.get(decoration, "type");
  if (typeof type !== "object" || type === null)
    throw new TypeError("a decoration with no type");
  return Object.fromEntries(Object.entries(type));
}

function drawn(decoration: Decoration): DrawnElement {
  const toDOM = typeOf(decoration)["toDOM"];
  if (typeof toDOM !== "function") throw new TypeError("not a widget");
  const element: unknown = toDOM(recordingView, () => decoration.from);
  if (!(element instanceof DrawnElement))
    throw new TypeError("a widget drawn outside the view's document");
  return element;
}

function attrsOf(decoration: Decoration): Record<string, unknown> {
  const attrs = typeOf(decoration)["attrs"];
  if (typeof attrs !== "object" || attrs === null)
    throw new TypeError("a decoration with no attributes");
  return Object.fromEntries(Object.entries(attrs));
}

type Shape = "widget" | "inline" | "node";

function shapeOf(s: EditorState, d: Decoration): Shape {
  if (typeof typeOf(d)["toDOM"] === "function") return "widget";
  return d.to - d.from === s.doc.nodeAt(d.from)?.nodeSize ? "node" : "inline";
}

const RANK: Record<Shape, number> = { widget: 0, inline: 1, node: 2 };

/** The plugin's decorations by position, a widget before an inline at one position, node decorations last. */
function decorationsOf(s: EditorState): unknown[][] {
  return changesKey
    .getState(s)!
    .decorations.find()
    .map((d) => ({ d, shape: shapeOf(s, d) }))
    .toSorted(
      (x, y) =>
        Number(x.shape === "node") - Number(y.shape === "node") ||
        x.d.from - y.d.from ||
        RANK[x.shape] - RANK[y.shape],
    )
    .map(({ d, shape }) => {
      if (shape === "widget") {
        const element = drawn(d);
        return ["widget", element.tagName, element.textContent];
      }
      const attrs = attrsOf(d);
      if (shape === "node") return ["node", attrs["data-changes"]];
      return [
        "inline",
        attrs["nodeName"],
        attrs["class"],
        s.doc.textBetween(d.from, d.to),
      ];
    });
}

test("added text is an ins, removed text a del widget, both on the page as it is", () => {
  const s = withChanges(
    doc(b(A, "Nobody's logged a crossing")),
    doc(b(A, "No one has crossed")),
  );
  expect(decorationsOf(s)).toEqual([
    ["widget", "del", "No one has"],
    ["inline", "ins", "mn-added", "Nobody's logged a"],
    ["widget", "del", "crossed"],
    ["inline", "ins", "mn-added", "crossing"],
    ["node", "changed"],
  ]);
});

test("a keystroke re-compares only the block it changed", () => {
  const s = withChanges(corpus(2_000), baselineWith(20, changed));
  const t = s.apply(s.tr.insertText("x", posIn(s, 700)));
  expect(
    changesKey.getState(t)!.recompared - changesKey.getState(s)!.recompared,
  ).toBe(1);
});

test("typing the baseline's text back removes the change", () => {
  const s = withChanges(
    doc(b(A, "Rain"), b(A, "No one crossed")),
    doc(b(A, "Rain"), b(A, "No one has crossed")),
  );
  const t = s.apply(s.tr.insertText("has ", posIn(s, 1, 7)));
  const comparison = changesKey.getState(t)!.comparison!;
  expect([
    decorationsOf(t),
    changeCount(comparison),
    comparison.entries.map((entry) => entry.kind),
  ]).toEqual([[], 0, ["unchanged", "unchanged"]]);
});

test("a block deleted now appears as removed where it was", () => {
  const blocks = doc(b(A, "Rain"), b(A, "The ferry leaves."), b(A, "Dawn"));
  const s = withChanges(blocks, blocks);
  const t = s.apply(s.tr.delete(posIn(s, 1) - 1, posIn(s, 2) - 1));
  const [widget] = changesKey.getState(t)!.decorations.find();
  const element = drawn(widget!);
  expect([
    decorationsOf(t),
    widget!.from === posIn(t, 1) - 1,
    element.className,
    [...element.attributes],
    changesKey
      .getState(t)!
      .comparison!.entries.map((entry) => [entry.id, entry.kind, entry.after]),
  ]).toEqual([
    [["widget", "del", "The ferry leaves."]],
    true,
    "mn-removed",
    [
      ["data-changes", "removed"],
      ["contenteditable", "false"],
    ],
    [
      [bid(0), "unchanged", null],
      [bid(1), "removed", bid(0)],
      [bid(2), "unchanged", null],
    ],
  ]);
});

// live blocks the baseline lacks, baseline blocks the live document lacks, and changed text, in both displays
const script = corpus(60);
const baselines = [
  edited(script, (block, k) => [k % 7 === 0 ? changed(block) : block]),
  edited(script, (block, k) => (k % 9 === 0 ? [] : [block])),
  edited(script, (block, k) =>
    k % 11 === 0
      ? [block, { ...changed(block), attrs: { id: `x${bid(k).slice(1)}` } }]
      : [block],
  ),
];
const arbEditsWithChanges = fc.record({
  state: fc.constantFrom(
    ...baselines.flatMap((baseline) =>
      (["page", "asterisks"] as const).map((display) =>
        withChanges(script, baseline, display),
      ),
    ),
  ),
  steps: arbTransactions,
});
const applyAll = (s: EditorState, steps: (s: EditorState) => EditorState) =>
  steps(s);

test("the decorations never change the document", () => {
  fc.assert(
    fc.property(arbEditsWithChanges, ({ state, steps }) => {
      const plain = applyAll(withoutPlugin(state), steps);
      const marked = applyAll(state, steps);
      expect(marked.doc.eq(plain.doc)).toBe(true);
    }),
    { numRuns: 300 },
  );
});

test("hiding changes leaves no decoration", () => {
  const s = withChanges(
    doc(b(A, "Nobody's logged a crossing")),
    doc(b(A, "No one has crossed")),
  );
  const hidden = changesKey.getState(s.apply(setChanges(s.tr, null)))!;
  expect([
    hidden.decorations === DecorationSet.empty,
    hidden.older,
    hidden.comparison,
  ]).toEqual([true, null, null]);
});

test("a block carrying change marks is not measured for drift", () => {
  const s = withChanges(
    doc(b(A, "Rain"), b(A, "The ferry leaves."), b(A, "Dawn")),
    doc(b(A, "Rain"), b(A, "The ferry left."), b(A, "Dawn")),
  );
  const sets = [
    paginationKey.getState(s)!.decorations,
    changesKey.getState(s)!.decorations,
  ];
  expect(
    [0, 1, 2].map((k) => {
      const from = posIn(s, k) - 1;
      const node = s.doc.nodeAt(from)!;
      return isDriftCandidate(
        node,
        sets.flatMap((set) => set.find(from, from + node.nodeSize)),
      );
    }),
  ).toEqual([true, false, true]);
});
