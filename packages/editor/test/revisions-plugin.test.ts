import { withDom } from "@manent/testkit/dom";
import { expect, spyOn, test } from "bun:test";
import {
  ENGINE_VERSION,
  applyLayoutPatches,
  engineFor,
} from "@manent/pagination";
import type { LockAnchorRecord } from "@manent/pagination";
import {
  corpusDoc,
  filledText,
  generateBlocks,
} from "@manent/pagination/testing";
import * as revisions from "@manent/revisions";
import {
  baselineOf,
  captureAnchors,
  deriveNumbers,
  lockNumbers,
  lockedPagination,
  mergeAnchors,
  productionLayout,
} from "@manent/revisions";
import { blocksOf, parseDoc, schema } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import fc from "fast-check";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Command, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  blockPos,
  bringBackScene,
  clearRevised,
  markRevised,
  omitScene,
  paginationKey,
  paginationPlugin,
  revisionKey,
  revisionPlugins,
} from "../src/index.ts";
import type { ProductionPort, ProductionView } from "../src/index.ts";
import { arbTransactions, bid, docOfBlocks, sp } from "./docs.ts";

withDom();

const engine = engineFor(ENGINE_VERSION)!;

/** The blocks of every section, as the document holds them. */
function blockJSONs(doc: Node): BlockJSON[] {
  const json: DocJSON = doc.toJSON();
  return (json.content ?? []).flatMap((section) => section.content ?? []);
}

/** The seeded screenplay as locked: each heading numbered as lock numbered it. */
function lockedScript(count: number, omit: number | null = null): Node {
  const json = corpusDoc(generateBlocks("screenplay", count, 1));
  const nums = new Map(
    lockNumbers(blocksOf(json)).map((n) => [n.blockId, n.num]),
  );
  return parseDoc({
    ...json,
    content: (json.content ?? []).map((section) => ({
      ...section,
      content: (section.content ?? []).map((block) => {
        const num = nums.get(String(block.attrs?.id));
        if (num === undefined) return block;
        return {
          ...block,
          attrs: { ...block.attrs, num, omitted: num === String(omit) },
        };
      }),
    })),
  });
}

/** Production as it stands just after lock: every page anchored, nothing issued since. */
function lockedView(
  doc: Node,
  extra: Partial<ProductionView> = {},
): ProductionView {
  const flat = blocksOf(doc);
  const issued = lockNumbers(flat);
  const p = engine.paginate(
    applyLayoutPatches(
      engine.toLayoutBlocks(flat),
      productionLayout(flat, new Map()),
    ),
    sp,
  );
  return {
    setId: "s1",
    records: captureAnchors(p, "every_page", 1, "lock"),
    numbering: "suffix",
    issuedNumbers: new Map(issued.map((n) => [n.blockId, n.num])),
    used: new Set(issued.map((n) => n.num)),
    baseline: baselineOf(blockJSONs(doc)),
    earlier: [],
    active: {
      ordinal: 1,
      name: "Blue",
      colour: "blue",
      mark: "*",
      day: "2026-11-16",
      fullDraft: false,
    },
    mode: "collated",
    tint: false,
    words: {
      lockTooltip: (next) => `Extra text goes to ${next}.`,
      colourName: (colour) => colour,
      revisedDescription: (name) => `revised, ${name}`,
    },
    ...extra,
  };
}

function fakePort(start: ProductionView | null) {
  let current = start;
  const listeners = new Set<() => void>();
  const keyListeners = new Set<(keys: readonly string[]) => void>();
  const values = new Map<string, string>();
  const port: ProductionPort = {
    view: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    overrides: {
      get: (key) => values.get(key) ?? null,
      set(key, value) {
        if (value === null) values.delete(key);
        else values.set(key, value);
        for (const listener of keyListeners) listener([key]);
      },
      subscribe(listener) {
        keyListeners.add(listener);
        return () => {
          keyListeners.delete(listener);
        };
      },
    },
  };
  const show = (next: ProductionView | null): void => {
    current = next;
    for (const listener of listeners) listener();
  };
  return { port, values, show };
}

function mount(
  doc: Node,
  port: ProductionPort,
  scenesNumbered: (on: boolean) => void = () => {},
): EditorView {
  return new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc,
      plugins: [
        paginationPlugin({
          profile: sp,
          defer: (run) => run(),
          offFontNote: "note",
        }),
        revisionPlugins({
          port,
          facts: { publish() {} },
          pages: { publish() {} },
          scaffold: () => null,
          layer: () => null,
          zoom: () => 1,
          scenesNumbered,
          lockIcon: () => document.createElement("span"),
          lockMarkerName: "Page number locked",
          frames: { request: () => () => {} },
        }),
      ],
    }),
  });
}

/** Lets the plugin's deferred work run, each piece of it queued as a microtask. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const revision = (view: EditorView) => revisionKey.getState(view.state)!;
const index = (view: EditorView) => paginationKey.getState(view.state)!.index;
const labels = (view: EditorView): string[] =>
  paginationKey.getState(view.state)!.pagination.pages.map((p) => p.label);
const lockedLabels = (view: EditorView): string[] =>
  revision(view).locked!.pagination.pages.map((p) => p.label);
const idAt = (view: EditorView, block: number): string =>
  index(view).blocks[block]!.id;
/** The position `offset` characters into block `block`. */
const posIn = (view: EditorView, block: number, offset = 0): number =>
  blockPos(index(view), block) + 1 + offset;
const endOf = (view: EditorView, block: number): number =>
  posIn(view, block, index(view).blocks[block]!.text.length);
const nodeAt = (view: EditorView, block: number): Node =>
  view.state.doc.nodeAt(blockPos(index(view), block))!;

function caretIn(view: EditorView, block: number, offset = 0): void {
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, posIn(view, block, offset)),
    ),
  );
}

/** The index of the first block of element `type` at or after block `from`. */
function firstOf(view: EditorView, type: string, from = 0): number {
  return index(view).blocks.findIndex((b, k) => k >= from && b.type === type);
}

/** The index of the heading of scene `n`, counted from 1. */
function headingOf(view: EditorView, n: number): number {
  let seen = 0;
  return index(view).blocks.findIndex(
    (b) => b.type === "scene_heading" && ++seen === n,
  );
}

/** Runs the command against the view; returns the transaction it dispatched. */
function runCommand(view: EditorView, command: Command): Transaction {
  let sent: Transaction | null = null;
  const ran = command(view.state, (tr) => {
    sent = tr;
    view.dispatch(tr);
  });
  if (!ran) throw new Error("the command does not apply here");
  return sent ?? view.state.tr;
}

/** What an undo of `tr` dispatches: its steps inverted, last first. */
function undo(view: EditorView, tr: Transaction): void {
  const inverse = view.state.tr;
  for (let i = tr.steps.length - 1; i >= 0; i--)
    inverse.step(tr.steps[i]!.invert(tr.docs[i]!));
  view.dispatch(inverse);
}

/** A level-1 anchor of page `label` at the start of block `block`. */
const anchorAt = (label: string, block: number, source: "lock" | "issue") => ({
  level: 1,
  label,
  blockId: bid(block),
  offset: 0,
  quote: "",
  fallbackIds: [],
  source,
});

/** A script of three actions of these line counts on locked pages 12, 12A (if given) and 13. */
function aPageScript(
  lines: readonly [number, number, number],
  issued12A: boolean,
): { doc: Node; records: LockAnchorRecord[] } {
  const doc = docOfBlocks(
    lines.map((n) => ["action", filledText(60, n)] as const),
  );
  const records = [
    anchorAt("12", 0, "lock"),
    ...(issued12A ? [anchorAt("12A", 1, "issue")] : []),
    anchorAt("13", 2, "lock"),
  ].map((r, i) => ({ ...r, order: i + 1 }));
  return { doc, records };
}

/** The labels lockedPagination gives the view's document from scratch, under `records`. */
function fromScratch(
  view: EditorView,
  records: readonly LockAnchorRecord[],
  used: ReadonlySet<string> = new Set(),
): string[] {
  const flat = blocksOf(view.state.doc);
  const headings = flat
    .filter((b) => b.attrs.type === "scene_heading" || b.attrs.type === "slug")
    .map((b) => ({ blockId: b.attrs.id!, num: b.attrs.num }));
  const layout = productionLayout(
    flat,
    deriveNumbers(headings, "suffix", used),
  );
  const blocks = applyLayoutPatches(engine.toLayoutBlocks(flat), layout);
  return lockedPagination(blocks, sp, records, engine).pagination.pages.map(
    (p) => p.label,
  );
}

test("typing on a locked page marks its line, and deleting it again leaves none", async () => {
  const doc = lockedScript(300);
  const view = mount(doc, fakePort(lockedView(doc)).port);
  await settle();
  const block = firstOf(view, "action", 5);
  const id = idAt(view, block);
  const end = endOf(view, block);
  const length = index(view).blocks[block]!.text.length;
  view.dispatch(view.state.tr.insertText("x", end));
  const typed = revision(view).marks.get(id);
  view.dispatch(view.state.tr.delete(end, end + 1));
  expect([typed, revision(view).marks.has(id)]).toEqual([
    { kind: "ranges", inserted: [[length, length + 1]], deletedAt: [] },
    false,
  ]);
  view.destroy();
});

test("a transaction re-derives only the blocks it changed", async () => {
  const doc = lockedScript(300);
  const view = mount(doc, fakePort(lockedView(doc)).port);
  await settle();
  const spy = spyOn(revisions, "markBlock");
  const block = firstOf(view, "action", 5);
  view.dispatch(view.state.tr.insertText("x", endOf(view, block)));
  const typing = spy.mock.calls.length;
  caretIn(view, block + 3);
  const moving = spy.mock.calls.length - typing;
  spy.mockRestore();
  expect([typing, moving]).toEqual([1, 0]);
  view.destroy();
});

test("an edit that makes page 12 overflow draws 12A, and the Pages labels follow", async () => {
  const doc = lockedScript(400);
  const records = lockedView(doc).records;
  const view = mount(doc, fakePort(lockedView(doc)).port);
  await settle();
  const before = labels(view).slice(10, 14);
  const starts13 = records.find((r) => r.label === "13")!.blockId;
  const at = index(view).blocks.findIndex((b) => b.id === starts13);
  view.dispatch(
    view.state.tr.insert(
      blockPos(index(view), at),
      schema.node(
        "block",
        { id: "n000000000000001", type: "action" },
        schema.text(filledText(60, 30)),
      ),
    ),
  );
  await settle();
  expect([before, labels(view).slice(10, 15), lockedLabels(view)]).toEqual([
    ["11", "12", "13", "14"],
    ["11", "12", "12A", "13", "14"],
    labels(view),
  ]);
  view.destroy();
});

/** A scene heading as another script numbered it. */
const pasted = (id: string): Node =>
  schema.node(
    "block",
    { id, type: "scene_heading", num: "88" },
    schema.text("INT. ROOFTOP - NIGHT"),
  );

test("a pasted heading loses a number it was never issued", async () => {
  const doc = lockedScript(300);
  const view = mount(doc, fakePort(lockedView(doc)).port);
  await settle();
  view.dispatch(
    view.state.tr.insert(blockPos(index(view), 10), pasted("n000000000000001")),
  );
  const local = nodeAt(view, 10).attrs.num;
  // a remote change reaches the editor as a step that is never this person's undo step
  view.dispatch(
    view.state.tr
      .insert(blockPos(index(view), 20), pasted("n000000000000002"))
      .setMeta("addToHistory", false),
  );
  expect([local, nodeAt(view, 20).attrs.num]).toEqual([null, "88"]);
  view.destroy();
});

test("an omitted scene reads OMITTED and its blocks take no room", async () => {
  const doc = lockedScript(300);
  const view = mount(doc, fakePort(lockedView(doc)).port);
  await settle();
  const heading = headingOf(view, 4);
  const text = index(view).blocks[heading]!.text;
  const type = index(view).blocks[heading + 1]!.type;
  caretIn(view, heading, 2);
  const omitting = runCommand(view, omitScene);
  await settle();
  const omitted = [
    index(view).blocks[heading]!.text,
    index(view).blocks[heading + 1]!.type,
  ];
  undo(view, omitting);
  await settle();
  expect([
    omitted,
    [index(view).blocks[heading]!.text, index(view).blocks[heading + 1]!.type],
  ]).toEqual([
    ["OMITTED", "group"],
    [text, type],
  ]);
  view.destroy();
});

test("a scene brought back shows its blocks with its number, marked revised", async () => {
  const doc = lockedScript(300, 4);
  const view = mount(doc, fakePort(lockedView(doc)).port);
  await settle();
  const heading = headingOf(view, 4);
  const id = idAt(view, heading);
  const next = idAt(view, heading + 1);
  const hidden = revision(view).layout!.patches.get(next);
  caretIn(view, heading);
  runCommand(view, bringBackScene);
  await settle();
  expect([
    hidden,
    revision(view).layout!.patches.get(next),
    revision(view).marks.get(id),
    revision(view).marks.get(next),
    nodeAt(view, heading).attrs.num,
  ]).toEqual([
    { type: "group", text: "" },
    undefined,
    { kind: "whole" },
    { kind: "whole" },
    "4",
  ]);
  view.destroy();
});

test("numbered scenes are drawn once the script is in production, and not after", async () => {
  const doc = lockedScript(300);
  const told: boolean[] = [];
  const { port, show } = fakePort(null);
  const view = mount(doc, port, (on) => told.push(on));
  await settle();
  const before = [...told];
  show(lockedView(doc));
  await settle();
  show(lockedView(doc, { tint: true }));
  await settle();
  show(null);
  await settle();
  expect([before, told]).toEqual([[], [true, false]]);
  view.destroy();
});

test("Mark revised and Clear revised write their overrides", async () => {
  const doc = lockedScript(300);
  const { port, values } = fakePort(lockedView(doc));
  const view = mount(doc, port);
  await settle();
  const block = firstOf(view, "action", 3);
  const id = idAt(view, block);
  caretIn(view, block, 1);
  runCommand(view, markRevised);
  await settle();
  const marked = [values.get(`s1:${id}`), revision(view).marks.get(id)];
  runCommand(view, clearRevised);
  await settle();
  expect([
    marked,
    [values.get(`s1:${id}`), revision(view).marks.has(id)],
  ]).toEqual([
    ["marked", { kind: "whole" }],
    ["cleared@3224c3ad", false],
  ]);
  view.destroy();
});

test("an issued A-page takes its parent's overflow on screen as it does in print", async () => {
  const { doc, records } = aPageScript([50, 50, 5], true);
  const view = mount(doc, fakePort(lockedView(doc, { records })).port);
  await settle();
  const resize = async (lines: number) => {
    view.dispatch(
      view.state.tr.insertText(
        filledText(60, lines),
        posIn(view, 0),
        endOf(view, 0),
      ),
    );
    await settle();
    return [
      labels(view),
      revision(view).locked!.dropped,
      fromScratch(view, records),
    ];
  };
  const fitting = labels(view);
  const grown = await resize(70);
  const shrunk = await resize(20);
  expect([fitting, grown, shrunk]).toEqual([
    ["12", "12A", "13"],
    [["12", "12A", "12B", "13"], ["12A"], ["12", "12A", "12B", "13"]],
    [["12", "12A", "13"], [], ["12", "12A", "13"]],
  ]);
  view.destroy();
});

test("typing on a page before a set-aside A-page's parent lays nothing out again", async () => {
  const doc = docOfBlocks(
    [5, 70, 50, 5].map((n) => ["action", filledText(60, n)] as const),
  );
  const records = [
    anchorAt("11", 0, "lock"),
    anchorAt("12", 1, "lock"),
    anchorAt("12A", 2, "issue"),
    anchorAt("13", 3, "lock"),
  ].map((r, i) => ({ ...r, order: i + 1 }));
  const view = mount(doc, fakePort(lockedView(doc, { records })).port);
  await settle();
  const spy = spyOn(revisions, "lockedPagination");
  caretIn(view, 0, index(view).blocks[0]!.text.length);
  view.dispatch(view.state.tr.insertText("a"));
  await settle();
  view.dispatch(view.state.tr.insertText("b"));
  await settle();
  const calls = spy.mock.calls.length;
  spy.mockRestore();
  expect([labels(view), revision(view).locked!.dropped, calls]).toEqual([
    ["11", "12", "12A", "12B", "13"],
    ["12A"],
    0,
  ]);
  view.destroy();
});

test("a lock or an unlock that arrives while someone types takes effect without losing a keystroke", async () => {
  const { doc, records } = aPageScript([70, 5, 1], false);
  const start = lockedView(doc, { records });
  const { port, show } = fakePort(start);
  const view = mount(doc, port);
  await settle();
  caretIn(view, 1, index(view).blocks[1]!.text.length);
  const type = (text: string) => view.dispatch(view.state.tr.insertText(text));
  const p = paginationKey.getState(view.state)!.pagination;
  const locked12A = mergeAnchors(
    records,
    captureAnchors(p, "derived_pages", 1, "lock"),
    p,
  );
  type("a");
  type("b");
  show({ ...start, records: locked12A });
  type("c");
  await settle();
  const afterLock = [labels(view), fromScratch(view, locked12A)];
  show({ ...start, records: [] });
  type("d");
  await settle();
  expect([
    afterLock,
    [labels(view), fromScratch(view, [])],
    index(view).blocks[1]!.text.endsWith("abcd"),
    view.state.selection.head,
  ]).toEqual([
    [
      ["12", "12A", "13"],
      ["12", "12A", "13"],
    ],
    [
      ["1", "2"],
      ["1", "2"],
    ],
    true,
    endOf(view, 1),
  ]);
  view.destroy();
});

test("the locked pages on screen always equal the pages laid out from scratch", async () => {
  const { doc, records } = aPageScript([50, 50, 5], true);
  const start = lockedView(doc, { records });
  let collided = 0;
  await fc.assert(
    fc.asyncProperty(arbTransactions, async (edits) => {
      const view = mount(doc, fakePort(start).port);
      await settle();
      view.updateState(edits(view.state));
      await settle();
      const shown = [labels(view), lockedLabels(view)];
      const expected = fromScratch(view, records);
      if (revision(view).locked!.dropped.length > 0) collided++;
      view.destroy();
      expect(shown).toEqual([expected, expected]);
    }),
    { numRuns: 100 },
  );
  // the edits reach the case the rule is for: 12's overflow taking 12A's place
  expect(collided).toBeGreaterThan(0);
}, 60_000);
