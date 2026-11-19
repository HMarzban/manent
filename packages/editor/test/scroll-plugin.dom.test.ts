import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { schema } from "@manent/schema";
import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { ScrollPorts } from "../src/index.ts";
import {
  anchorShiftPx,
  blockPos,
  paginationKey,
  scrollPlugin,
  sectionEnter,
} from "../src/index.ts";
import { counter, docOf, script, state } from "./docs.ts";

withDom();

/** What the fake layout reports: the caret's top in the scroll (null: no caret), the block at the top, and each block's viewport top. */
interface Layout {
  caret: number | null;
  top: { block: number; offsetPx: number } | null;
  blockTop: (block: number) => number | null;
}

interface Scroller {
  readonly element: HTMLElement;
  /** Every value written to scrollTop, in order. */
  readonly writes: number[];
}

/** A scroller 600 px tall at the viewport's top, whose scrollTop writes are kept. */
function fakeScroller(): Scroller {
  const element = document.body.appendChild(document.createElement("div"));
  const writes: number[] = [];
  let top = 0;
  Object.defineProperty(element, "scrollTop", {
    get: () => top,
    set: (value: number) => {
      top = value;
      writes.push(value);
    },
  });
  Object.defineProperty(element, "clientHeight", { value: 600 });
  element.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 });
  return { element, writes };
}

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) if (!view.isDestroyed) view.destroy();
  document.body.replaceChildren();
});

interface Mounted {
  readonly view: EditorView;
  readonly scroller: Scroller;
  readonly layout: Layout;
  /** Sets whether an input method is composing, as the view reports it. */
  composing(on: boolean): void;
  /** Turns typewriter scrolling on or off. */
  typewriter(on: boolean): void;
}

function mount(
  doc: Node,
  options: { typewriter?: boolean; zoom?: number; paged?: boolean } = {},
): Mounted {
  let typewriter = options.typewriter ?? false;
  const scroller = fakeScroller();
  const layout: Layout = { caret: null, top: null, blockTop: () => null };
  const ports: ScrollPorts = {
    scroller: () => scroller.element,
    zoom: () => options.zoom ?? 1,
    caretTop: () =>
      layout.caret === null ? null : layout.caret - scroller.element.scrollTop,
    topBlock: () => layout.top,
    blockTop: (_, block) => layout.blockTop(block),
  };
  const plugin = scrollPlugin({
    ...ports,
    isRemote: (tr) => tr.getMeta("remote") === true,
    typewriter: () => typewriter,
  });
  const before = options.paged === false ? [] : state(doc).plugins;
  const view = new EditorView(
    scroller.element.appendChild(document.createElement("div")),
    { state: EditorState.create({ doc, plugins: [...before, plugin] }) },
  );
  views.push(view);
  let composing = false;
  Object.defineProperty(view, "composing", { get: () => composing });
  return {
    view,
    scroller,
    layout,
    composing: (on) => {
      composing = on;
    },
    typewriter: (on) => {
      typewriter = on;
    },
  };
}

/** The document with `count` one-line actions inserted before block `block` of the first section; every other node is kept. */
function withLinesAt(doc: Node, block: number, count: number): Node {
  const lines = Array.from({ length: count }, (_, i) =>
    schema.node(
      "block",
      { id: `added${String(i).padStart(11, "0")}`, type: "action" },
      schema.text(`Rain on the glass ${i}.`),
    ),
  );
  let start = 0;
  const sections: Node[] = [];
  doc.forEach((section) => {
    const at = block - start;
    start += section.childCount;
    const blocks: Node[] = [];
    section.forEach((node) => blocks.push(node));
    if (at >= 0 && at < blocks.length) blocks.splice(at, 0, ...lines);
    sections.push(
      blocks.length === section.childCount
        ? section
        : section.copy(Fragment.from(blocks)),
    );
  });
  return doc.copy(Fragment.from(sections));
}

/** A remote change that replaces the whole document, as the binding's are. */
function remote(view: EditorView, next: Node): Transaction {
  return view.state.tr
    .replaceWith(0, view.state.doc.content.size, next.content)
    .setMeta("remote", true);
}

const pagesOf = (view: EditorView) => paginationKey.getState(view.state)!;

/** The caret at the start of block `block`. */
function caretAt(view: EditorView, block: number): void {
  const pos = blockPos(pagesOf(view).index, block) + 1;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)),
  );
}

const scrolled = (element: HTMLElement): void => {
  element.dispatchEvent(new Event("scroll"));
};

test("a remote edit above the anchor scrolls by exactly the height it added", () => {
  const m = mount(script(400), { zoom: 1.25 });
  m.layout.top = { block: 300, offsetPx: 12 };
  scrolled(m.scroller.element);
  const before = pagesOf(m.view);
  m.view.dispatch(remote(m.view, withLinesAt(m.view.state.doc, 10, 30)));
  const after = pagesOf(m.view);
  const shift = anchorShiftPx(
    before.pagination,
    after.pagination,
    after.settings.engine,
    { first: 10, oldEnd: 10, newEnd: 40 },
    330,
  );
  expect(shift).toBeGreaterThan(30 * 16);
  expect(m.scroller.writes).toEqual([shift * 1.25]);
});

test("a remote edit below the reader, and every local edit, move nothing here", () => {
  const m = mount(script(400));
  m.layout.top = { block: 300, offsetPx: 0 };
  scrolled(m.scroller.element);
  m.view.dispatch(remote(m.view, withLinesAt(m.view.state.doc, 350, 30)));
  caretAt(m.view, 10);
  m.view.dispatch(m.view.state.tr.insertText("A long line. ".repeat(20)));
  sectionEnter({ ids: counter("e") })(m.view.state, m.view.dispatch);
  expect(m.scroller.writes).toEqual([]);
});

test("a remote edit above the reader after the person typed below it still scrolls by the height it added", () => {
  const m = mount(script(400));
  m.layout.top = { block: 300, offsetPx: 0 };
  scrolled(m.scroller.element);
  caretAt(m.view, 350);
  m.view.dispatch(m.view.state.tr.insertText("A word."));
  const before = pagesOf(m.view);
  m.view.dispatch(remote(m.view, withLinesAt(m.view.state.doc, 10, 30)));
  const after = pagesOf(m.view);
  expect(m.scroller.writes).toEqual([
    anchorShiftPx(
      before.pagination,
      after.pagination,
      after.settings.engine,
      { first: 10, oldEnd: 10, newEnd: 40 },
      330,
    ),
  ]);
});

test("an anchor block the remote change deleted gives no correction", () => {
  const m = mount(script(400));
  caretAt(m.view, 300);
  m.layout.caret = 200;
  scrolled(m.scroller.element);
  const doc = m.view.state.doc;
  const section = doc.child(3);
  const kept: Node[] = [];
  section.forEach((node, _, i) => {
    if (i !== 0) kept.push(node);
  });
  const next = doc.copy(
    doc.content.replaceChild(3, section.copy(Fragment.from(kept))),
  );
  m.view.dispatch(remote(m.view, withLinesAt(next, 10, 30)));
  expect(m.scroller.writes).toEqual([]);
});

test("without pages a remote edit above the anchor scrolls by how far the anchor block moved", () => {
  const m = mount(
    docOf([
      ["one", "two", "three"],
      ["four", "five"],
    ]),
    {
      paged: false,
    },
  );
  m.layout.top = { block: 3, offsetPx: 0 };
  m.layout.blockTop = (block) => block * 20 - m.scroller.element.scrollTop;
  scrolled(m.scroller.element);
  m.view.dispatch(remote(m.view, withLinesAt(m.view.state.doc, 1, 2)));
  expect(m.scroller.writes).toEqual([40]);
});

test("typewriter scrolling holds the line being written", () => {
  const m = mount(script(200), { typewriter: true });
  const enter = sectionEnter({ ids: counter("e") });
  caretAt(m.view, 20);
  m.layout.caret = 400;
  m.view.dispatch(m.view.state.tr.insertText("a"));
  for (const caret of [432, 464, 496]) {
    m.layout.caret = caret;
    enter(m.view.state, m.view.dispatch);
  }
  expect(m.scroller.writes).toEqual([32, 64, 96]);
  caretAt(m.view, 21);
  m.layout.caret = 520;
  m.view.dispatch(m.view.state.tr.insertText("b"));
  m.layout.caret = 552;
  m.view.dispatch(m.view.state.tr.insertText("c"));
  expect(m.scroller.writes).toEqual([32, 64, 96, 128]);
});

test("typewriter scrolling turned off and on again holds the line afresh", () => {
  const m = mount(script(200), { typewriter: true });
  caretAt(m.view, 20);
  for (const [on, caret] of [
    [true, 400],
    [false, 432],
    [true, 464],
    [true, 496],
  ] as const) {
    m.typewriter(on);
    m.layout.caret = caret;
    m.view.dispatch(m.view.state.tr.insertText("a"));
  }
  expect(m.scroller.writes).toEqual([32]);
});

test("a scroll by the person lets go of the held line, and with the caret out of view the middle is held", () => {
  const m = mount(script(200), { typewriter: true });
  caretAt(m.view, 20);
  m.layout.caret = 400;
  m.view.dispatch(m.view.state.tr.insertText("a"));
  m.scroller.element.scrollTop = 700;
  scrolled(m.scroller.element);
  m.view.dispatch(m.view.state.tr.insertText("b"));
  m.layout.caret = 1032;
  m.view.dispatch(m.view.state.tr.insertText("c"));
  expect(m.scroller.writes).toEqual([700, 732]);
});

test("nothing moves while an input method composes", () => {
  const m = mount(script(400), { typewriter: true });
  caretAt(m.view, 350);
  m.layout.caret = 400;
  m.composing(true);
  m.view.dispatch(m.view.state.tr.insertText("a"));
  m.layout.caret = 432;
  m.view.dispatch(m.view.state.tr.insertText("b"));
  m.composing(false);
  m.layout.caret = null;
  m.layout.top = { block: 300, offsetPx: 0 };
  scrolled(m.scroller.element);
  const before = pagesOf(m.view);
  m.composing(true);
  m.view.dispatch(remote(m.view, withLinesAt(m.view.state.doc, 10, 30)));
  expect(m.scroller.writes).toEqual([]);
  m.composing(false);
  m.view.dispatch(m.view.state.tr.setMeta("composition_ended", true));
  const after = pagesOf(m.view);
  expect(m.scroller.writes).toEqual([
    anchorShiftPx(
      before.pagination,
      after.pagination,
      after.settings.engine,
      { first: 10, oldEnd: 10, newEnd: 40 },
      330,
    ),
  ]);
});

test("the browser's own anchoring is off while the editor is mounted", () => {
  const scroller = fakeScroller();
  scroller.element.style.setProperty("overflow-anchor", "auto");
  const view = new EditorView(scroller.element, {
    state: EditorState.create({
      doc: docOf([["one"]]),
      plugins: [
        scrollPlugin({
          scroller: () => scroller.element,
          zoom: () => 1,
          caretTop: () => null,
          topBlock: () => null,
          blockTop: () => null,
          isRemote: () => false,
          typewriter: () => false,
        }),
      ],
    }),
  });
  const during = scroller.element.style.getPropertyValue("overflow-anchor");
  view.destroy();
  expect([
    during,
    scroller.element.style.getPropertyValue("overflow-anchor"),
  ]).toEqual(["none", "auto"]);
});
