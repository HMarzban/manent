import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mountPageView } from "../src/index.ts";
import type { TypesettingOptions } from "../src/index.ts";
import { docOf, sp } from "./docs.ts";

withDom();

/** A page view of `doc` whose fonts never load and whose wait never ends. */
const mount = (
  extra: Partial<Parameters<typeof mountPageView>[0]>,
): ReturnType<typeof mountPageView> => {
  const options: TypesettingOptions = {
    profile: sp,
    offFontNote: "note",
    engine: "chromium",
    ports: {
      fonts: { add: () => {} },
      makeFace: () => ({ load: () => new Promise(() => {}) }),
      wait: () => new Promise(() => {}),
      defer: (work) => work(),
      whenIdle: () => {},
      userAgent: "test",
    },
  };
  return mountPageView({
    ...options,
    place: document.createElement("div"),
    doc: docOf([["one", "two"]]),
    ...extra,
  });
};

test("plugins given as before come first, and spelling follows its option", () => {
  const first = new Plugin({});
  const off = mount({ before: [first], spelling: () => false });
  const on = mount({});
  expect([
    off.view.state.plugins[0] === first,
    off.view.dom.getAttribute("spellcheck"),
    on.view.dom.getAttribute("spellcheck"),
  ]).toEqual([true, "false", "true"]);
  off.destroy();
  on.destroy();
});

test("the page view dispatches through the given function and is editable as it says", () => {
  const seen: [EditorView, Transaction][] = [];
  const { view, destroy } = mount({
    dispatchTransaction: (v, tr) => seen.push([v, tr]),
    editable: () => false,
  });
  const tr = view.state.tr.insertText("x", 2);
  view.dispatch(tr);
  expect([
    seen.length === 1 && seen[0]![0] === view && seen[0]![1] === tr,
    view.state.doc.textContent,
    view.dom.getAttribute("contenteditable"),
  ]).toEqual([true, "onetwo", "false"]);
  destroy();
});
