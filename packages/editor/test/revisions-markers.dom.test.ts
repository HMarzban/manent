import { withDom } from "@manent/testkit/dom";
import { expect, jest, test } from "bun:test";
import { filledText } from "@manent/pagination/testing";
import { baselineOf } from "@manent/revisions";
import type { BlockMark } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  blockPos,
  createPageScaffold,
  paginationKey,
  paginationPlugin,
  revisionPlugins,
} from "../src/index.ts";
import type {
  FactsShape,
  PageRow,
  PageScaffold,
  ProductionView,
} from "../src/index.ts";
import { bid, docOfBlocks, sp } from "./docs.ts";

withDom();

/** A frame that comes as a microtask, so settle lets it draw. */
function microtaskFrame(fn: () => void): () => void {
  let live = true;
  queueMicrotask(() => {
    if (live) fn();
  });
  return () => {
    live = false;
  };
}

function blockJSONs(doc: Node): BlockJSON[] {
  const json: DocJSON = doc.toJSON();
  return (json.content ?? []).flatMap((section) => section.content ?? []);
}

/** A level-1 anchor of page `label` at the start of block `block`. */
const anchorAt = (label: string, block: number, order: number) => ({
  level: 1,
  order,
  label,
  blockId: bid(block),
  offset: 0,
  quote: "",
  fallbackIds: [],
  source: "lock" as const,
});

/** Production of `doc` measured against itself, Second Blue being written after the issued Blue. */
function productionOf(
  doc: Node,
  extra: Partial<ProductionView> = {},
): ProductionView {
  return {
    setId: "s9",
    records: [],
    numbering: "suffix",
    issuedNumbers: new Map(),
    used: new Set(),
    baseline: baselineOf(blockJSONs(doc)),
    earlier: [],
    active: {
      ordinal: 9,
      name: "Second Blue",
      colour: "blue",
      mark: "*",
      day: "2026-11-16",
      fullDraft: false,
    },
    mode: "collated",
    tint: false,
    words: {
      lockTooltip: (next) =>
        `Page numbers are locked. You can still edit; extra text goes to ${next}.`,
      colourName: (colour) => colour,
      revisedDescription: (name) => `revised, ${name}`,
    },
    ...extra,
  };
}

interface Mounted {
  view: EditorView;
  scaffold: PageScaffold;
  layer: HTMLElement;
  rows: { rows: readonly PageRow[]; scenes: readonly string[] }[];
  facts: Partial<FactsShape>;
  destroy(): void;
}

function mount(doc: Node, production: ProductionView): Mounted {
  const place = document.createElement("div");
  // a viewport tall enough to show every sheet
  Object.defineProperty(place, "clientHeight", { value: 100_000 });
  const layer = document.createElement("div");
  document.body.append(place, layer);
  const scaffold = createPageScaffold({
    place,
    profile: sp,
    engine: "chromium",
  });
  const rows: Mounted["rows"] = [];
  const facts: Partial<FactsShape> = {};
  const view = new EditorView(scaffold.pages, {
    state: EditorState.create({
      doc,
      plugins: [
        paginationPlugin({
          profile: sp,
          defer: (run) => run(),
          offFontNote: "note",
          onPages: (count) => scaffold.setPageCount(count),
        }),
        revisionPlugins({
          port: {
            view: () => production,
            subscribe: () => () => {},
            overrides: { get: () => null, set() {}, subscribe: () => () => {} },
          },
          facts: { publish: (changed) => Object.assign(facts, changed) },
          pages: { publish: (r, scenes) => rows.push({ rows: r, scenes }) },
          scaffold: () => scaffold,
          layer: () => layer,
          zoom: () => 1,
          scenesNumbered() {},
          lockIcon: () =>
            document.createElementNS("http://www.w3.org/2000/svg", "svg"),
          lockMarkerName: "Page number locked",
          frames: { request: microtaskFrame },
        }),
      ],
    }),
  });
  return {
    view,
    scaffold,
    layer,
    rows,
    facts,
    destroy() {
      view.destroy();
      scaffold.destroy();
      place.remove();
      layer.remove();
    },
  };
}

/** Lets the plugin's deferred work run, each piece of it queued as a microtask. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const posIn = (view: EditorView, block: number, offset = 0): number =>
  blockPos(paginationKey.getState(view.state)!.index, block) + 1 + offset;

function caretIn(view: EditorView, block: number): void {
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, posIn(view, block)),
    ),
  );
}

test("each locked page has a lock beside its page number, saying where extra text goes", async () => {
  const doc = docOfBlocks([
    ["action", filledText(60, 40)],
    ["action", filledText(60, 40)],
  ]);
  const records = [anchorAt("12", 0, 1), anchorAt("13", 1, 2)];
  const shown = mount(doc, productionOf(doc, { records }));
  await settle();
  const markers = [...shown.layer.querySelectorAll<HTMLElement>("span")];
  expect(
    markers.map((m) => ({
      className: m.className,
      role: m.getAttribute("role"),
      name: m.getAttribute("aria-label"),
      description: m.getAttribute("aria-description"),
      title: m.title,
      text: m.textContent,
      focusable: m.hasAttribute("tabindex"),
      icon: m.firstElementChild?.tagName.toLowerCase(),
      size: [m.style.width, m.style.height],
    })),
  ).toEqual(
    ["12A", "13A"].map((next) => {
      const sentence = `Page numbers are locked. You can still edit; extra text goes to ${next}.`;
      return {
        className: "mn-marker mn-marker-lock",
        role: "img",
        name: "Page number locked",
        description: sentence,
        title: sentence,
        text: "",
        focusable: false,
        icon: "svg",
        size: ["24px", "24px"],
      };
    }),
  );
  shown.destroy();
});

/** A locked page of level 1, revised in Second Blue or not. */
const row = (index: number, label: string, revised: boolean): PageRow => ({
  index,
  label,
  locked: true,
  level: 1,
  revision: revised ? "blue" : null,
  revisionName: revised ? "Second Blue" : null,
});

test("the Pages feed lists every label with its lock and colour, at most four times a second", async () => {
  jest.useFakeTimers();
  const doc = docOfBlocks([
    ["scene_heading", "INT. HALL - NIGHT"],
    ["action", filledText(60, 30)],
    ["scene_heading", "EXT. YARD - DAY"],
    ["action", filledText(60, 5)],
  ]);
  const records = [anchorAt("12", 0, 1), anchorAt("13", 2, 2)];
  const shown = mount(doc, productionOf(doc, { records }));
  await settle();
  jest.advanceTimersByTime(250);
  const first = shown.rows.length;
  for (const word of ["Rain", " on", " glass"])
    shown.view.dispatch(
      shown.view.state.tr.insertText(word, posIn(shown.view, 3)),
    );
  await settle();
  const typing = shown.rows.length - first;
  jest.advanceTimersByTime(249);
  const waiting = shown.rows.length - first;
  jest.advanceTimersByTime(1);
  const published = shown.rows.length - first;
  jest.advanceTimersByTime(1000);
  const idle = shown.rows.length - first;
  jest.useRealTimers();
  expect([
    shown.rows[first - 1],
    [typing, waiting, published, idle],
    shown.rows.at(-1),
  ]).toEqual([
    { rows: [row(0, "12", false), row(1, "13", false)], scenes: [] },
    [0, 0, 1, 1],
    { rows: [row(0, "12", false), row(1, "13", true)], scenes: [bid(2)] },
  ]);
  shown.destroy();
});

test("the readout names the caret's page revision", async () => {
  jest.useFakeTimers();
  const doc = docOfBlocks(
    Array.from({ length: 14 }, () => ["action", filledText(60, 40)] as const),
  );
  const whole: BlockMark = { kind: "whole" };
  const blue = {
    ordinal: 1,
    name: "Blue",
    colour: "blue" as const,
    mark: "*",
    day: "2026-11-02",
    fullDraft: false,
    marks: new Map([[bid(13), whole]]),
  };
  // every block starts a page of its own
  const records = Array.from({ length: 14 }, (_, k) =>
    anchorAt(String(k + 1), k, k + 1),
  );
  const shown = mount(doc, productionOf(doc, { records, earlier: [blue] }));
  await settle();
  caretIn(shown.view, 13);
  jest.advanceTimersByTime(250);
  const onBlue = { ...shown.facts };
  caretIn(shown.view, 2);
  shown.view.dispatch(shown.view.state.tr.insertText("Rain."));
  jest.advanceTimersByTime(250);
  const onSecondBlue = { ...shown.facts };
  jest.useRealTimers();
  expect([onBlue, onSecondBlue]).toEqual([
    { pageRevision: "Blue", pageOrdinal: 14 },
    { pageRevision: "Second Blue", pageOrdinal: 3 },
  ]);
  shown.destroy();
});
