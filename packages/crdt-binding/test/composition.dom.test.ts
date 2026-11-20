import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { scriptDocFromJSON } from "@manent/crdt";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { bindDocument } from "../src/index.ts";
import type { BoundDocument } from "../src/index.ts";
import { SAMPLE, fakeTimers, local } from "./helpers.ts";
import type { FakeTimers } from "./helpers.ts";

withDom();

interface Counted extends BoundDocument {
  holds: number;
  releases: number;
}

/** An editor bound through bindDocument over a document that counts its holds and releases. */
function boundCounting(): {
  view: EditorView;
  doc: Counted;
  timers: FakeTimers;
} {
  const timers = fakeTimers();
  const doc: Counted = {
    ...local(scriptDocFromJSON(SAMPLE)),
    holds: 0,
    releases: 0,
    holdRemote: () => doc.holds++,
    releaseRemote: () => doc.releases++,
  };
  const result = bindDocument({ document: doc, timers, undoRoots: ["script"] });
  if (!result.ok) throw new RangeError(`not bound: ${result.reason}`);
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: result.binding.doc,
      plugins: [...result.binding.plugins],
    }),
  });
  return { view, doc, timers };
}

function fire(view: EditorView, type: "compositionstart" | "compositionend") {
  view.dom.dispatchEvent(new CompositionEvent(type, { bubbles: true }));
}

test("a remote update waits for the composition to end, however long", () => {
  const { view, doc, timers } = boundCounting();
  fire(view, "compositionstart");
  expect(doc.holds).toBe(1);
  timers.advance(3_600_000);
  expect(doc.releases).toBe(0);
  fire(view, "compositionend");
  view.updateState(view.state);
  expect([doc.holds, doc.releases]).toEqual([1, 1]);
});

test("a composition that ends with no update is released after 50 ms", () => {
  const { view, doc, timers } = boundCounting();
  fire(view, "compositionstart");
  fire(view, "compositionend");
  timers.advance(49);
  const before = doc.releases;
  timers.advance(1);
  expect([before, doc.releases]).toEqual([0, 1]);
});

test("an editor destroyed mid-composition releases what it held", () => {
  const { view, doc, timers } = boundCounting();
  fire(view, "compositionstart");
  view.destroy();
  timers.advance(1_000);
  expect([doc.holds, doc.releases]).toEqual([1, 1]);
});
