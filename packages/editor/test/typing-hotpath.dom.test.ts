import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { profileFor } from "@manent/pagination";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  blockPos,
  createPageScaffold,
  pagesFeedPlugin,
  paginationKey,
  paginationPlugin,
} from "../src/index.ts";
import { docOf, sp } from "./docs.ts";

withDom();

test("intra-line typing does not force caret coordinate measurements", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = new EditorView(host, {
    state: EditorState.create({
      doc: docOf([["Hello world"]]),
      plugins: [
        paginationPlugin({
          profile: sp,
          defer: () => {},
          offFontNote: "note",
          scroller: () => host,
        }),
      ],
    }),
  });
  let coordsCalls = 0;
  view.coordsAtPos = () => {
    coordsCalls += 1;
    return { left: 10, right: 10, top: 100, bottom: 116 };
  };
  const pos = blockPos(paginationKey.getState(view.state)!.index, 0) + 6;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
  const afterFocus = coordsCalls;
  for (const ch of ["a", "b", "c", "d"]) {
    view.dispatch(view.state.tr.insertText(ch));
  }
  expect(coordsCalls).toBe(afterFocus);
  view.destroy();
  host.remove();
});

test("scaffold records zoom in dataset and avoids redundant data-page mutations", () => {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 900 });
  const scaffold = createPageScaffold({
    place: host,
    profile: profileFor("screenplay")!,
    engine: "chromium",
  });
  scaffold.applyZoom(125);
  expect(scaffold.pages.dataset["zoom"]).toBe("1.25");
  scaffold.destroy();
});

test("pages feed skips scheduling timers when the script is outside production", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const realSetTimeout = globalThis.setTimeout;
  let scheduled = 0;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    scheduled += 1;
    return realSetTimeout(...args);
  }) as typeof setTimeout;
  const view = new EditorView(host, {
    state: EditorState.create({
      doc: docOf([["One line"]]),
      plugins: [
        paginationPlugin({
          profile: sp,
          defer: () => {},
          offFontNote: "note",
          scroller: () => host,
        }),
        pagesFeedPlugin({
          sink: { publish: () => {} },
          facts: { publish: () => {} },
        }),
      ],
    }),
  });
  try {
    scheduled = 0;
    view.dispatch(view.state.tr.insertText("x", 3));
    view.dispatch(view.state.tr.insertText("y", 4));
    expect(scheduled).toBe(0);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    view.destroy();
    host.remove();
  }
});
