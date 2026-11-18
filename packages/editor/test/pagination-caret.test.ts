import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { schema } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { paginationPlugin, scrollDelta } from "../src/index.ts";
import { docOf, sp } from "./docs.ts";

withDom();

const LINE_PX = 16;
const ownRect = Element.prototype.getBoundingClientRect;
afterEach(() => {
  Element.prototype.getBoundingClientRect = ownRect;
});

const rect = (top: number, bottom: number): DOMRect =>
  DOMRect.fromRect({ x: 0, y: top, width: 600, height: bottom - top });

// A layout with no browser: each block is one line, in document order, below the scroller's top less its scroll.
function layOut(scroller: HTMLElement): void {
  Element.prototype.getBoundingClientRect = function box(this: Element) {
    const blocks = [...scroller.querySelectorAll("p.el")];
    const topOf = (block: Element) =>
      blocks.indexOf(block) * LINE_PX - scroller.scrollTop;
    if (this.matches("p.el")) return rect(topOf(this), topOf(this) + LINE_PX);
    const own = [...this.querySelectorAll(":scope > p.el")];
    if (!this.matches(".section") || own.length === 0) return rect(0, 0);
    return rect(topOf(own[0]!), topOf(own.at(-1)!) + LINE_PX);
  };
}

// Three one-line blocks whose ids begin with `prefix`.
const threeBlocks = (prefix: string): Node[] =>
  ["rain", "wind", "door"].map((text, i) =>
    schema.node(
      "block",
      { id: `${prefix}${i}0000`, type: "action" },
      schema.text(text),
    ),
  );

test("the caret's line keeps its place only when it changes page", () => {
  expect([
    scrollDelta({ page: 3, top: 700 }, { page: 3, top: 716 }),
    scrollDelta({ page: 3, top: 700 }, { page: 4, top: 932 }),
    scrollDelta(null, { page: 0, top: 10 }),
  ]).toEqual([0, 232, 0]);
});

test("a remote change above the reader keeps the block across the top where it was, and a local one leaves the scroll", () => {
  const scroller = document.createElement("div");
  document.body.append(scroller);
  layOut(scroller);
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`);
  const view = new EditorView(
    scroller.appendChild(document.createElement("div")),
    {
      state: EditorState.create({
        doc: docOf([lines.slice(0, 20), lines.slice(20)]),
        plugins: [
          paginationPlugin({
            profile: sp,
            defer: (run) => run(),
            offFontNote: "note",
            isRemote: (tr) => tr.getMeta("remote") === true,
            scroller: () => scroller,
          }),
        ],
      }),
    },
  );
  // block 24 crosses the top, 8 px above it
  scroller.scrollTop = 24 * LINE_PX + 8;
  view.dispatch(
    view.state.tr.insert(1, threeBlocks("remote")).setMeta("remote", true),
  );
  const remote = scroller.scrollTop;
  view.dispatch(view.state.tr.insert(1, threeBlocks("local")));
  expect([remote, scroller.scrollTop, scroller.style.overflowAnchor]).toEqual([
    27 * LINE_PX + 8,
    27 * LINE_PX + 8,
    "none",
  ]);
  view.destroy();
  scroller.remove();
});
