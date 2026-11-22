import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { filledText } from "@manent/pagination/testing";
import { baselineOf } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  blockPos,
  createPageScaffold,
  paginationKey,
  paginationPlugin,
  revisionPlugins,
} from "../src/index.ts";
import type {
  PageScaffold,
  ProductionPort,
  ProductionView,
} from "../src/index.ts";
import { docOfBlocks, sp } from "./docs.ts";

withDom();

function blockJSONs(doc: Node): BlockJSON[] {
  const json: DocJSON = doc.toJSON();
  return (json.content ?? []).flatMap((section) => section.content ?? []);
}

/** Production with no anchors, measured against `doc`, Blue being written. */
function bluePort(doc: Node, tint: boolean): ProductionPort {
  const view: ProductionView = {
    setId: "s1",
    records: [],
    numbering: "suffix",
    issuedNumbers: new Map(),
    used: new Set(),
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
    tint,
    words: { lockTooltip: (next) => next, colourName: (colour) => colour },
  };
  return {
    view: () => view,
    subscribe: () => () => {},
    overrides: { get: () => null, set() {}, subscribe: () => () => {} },
  };
}

function mount(tint: boolean): { view: EditorView; scaffold: PageScaffold } {
  const place = document.createElement("div");
  document.body.append(place);
  const scaffold = createPageScaffold({
    place,
    profile: sp,
    engine: "chromium",
  });
  const doc = docOfBlocks([
    ["action", filledText(60, 3)],
    ["action", filledText(60, 3)],
  ]);
  const view = new EditorView(scaffold.pages, {
    state: EditorState.create({
      doc,
      plugins: [
        paginationPlugin({
          profile: sp,
          defer: (run) => run(),
          offFontNote: "note",
        }),
        revisionPlugins({
          port: bluePort(doc, tint),
          facts: { publish() {} },
          pages: { publish() {} },
          scaffold: () => scaffold,
          layer: () => null,
          zoom: () => 1,
          scenesNumbered() {},
          lockIcon: () => document.createElement("span"),
          lockMarkerName: "Page number locked",
        }),
      ],
    }),
  });
  return { view, scaffold };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

test("a revised sheet shows the band's colour, its header and an asterisk per marked line", async () => {
  const { view, scaffold } = mount(false);
  await settle();
  const start = blockPos(paginationKey.getState(view.state)!.index, 1) + 1;
  view.dispatch(view.state.tr.insertText("Rain.", start));
  await settle();
  const sheet = scaffold.pages.querySelector<HTMLElement>(
    '.mn-sheet[data-page="0"]',
  )!;
  expect([
    sheet.dataset["rev"],
    sheet.dataset["revHead"],
    sheet.querySelectorAll(".mn-mark").length,
  ]).toEqual(["blue", "Blue Rev. (16 Nov 2026)", 1]);
  view.destroy();
  scaffold.destroy();
});

test("Colour revised pages tints the sheets", async () => {
  const tinted = mount(true);
  const plain = mount(false);
  await settle();
  expect([
    tinted.scaffold.pages.dataset["tint"],
    plain.scaffold.pages.dataset["tint"],
  ]).toEqual(["on", undefined]);
  for (const { view, scaffold } of [tinted, plain]) {
    view.destroy();
    scaffold.destroy();
  }
});
