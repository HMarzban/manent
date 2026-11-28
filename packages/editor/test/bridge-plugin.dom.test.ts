import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import { schema } from "@manent/schema";
import { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  blockPos,
  bridgePlugin,
  paginationPlugin,
  setPagination,
  toIndex,
} from "../src/index.ts";
import type {
  EditorWords,
  FactsShape,
  Frames,
  HistoryPort,
  OutlineEntry,
  Timers,
} from "../src/index.ts";
import { bid, docOfBlocks, script, sp } from "./docs.ts";

withDom();

/** Timers that run only when the test moves the time on. */
function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let jobs: { at: number; fn: () => void }[] = [];
  return {
    now: () => now,
    schedule(fn, delayMs) {
      const job = { at: now + delayMs, fn };
      jobs.push(job);
      return () => {
        jobs = jobs.filter((other) => other !== job);
      };
    },
    advance(ms) {
      now += ms;
      const due = jobs.filter((job) => job.at <= now);
      jobs = jobs.filter((job) => job.at > now);
      for (const job of due) job.fn();
    },
  };
}

/** Frames that run when the test fires them. */
function fakeFrames(): Frames & { fire(): void } {
  let waiting: (() => void)[] = [];
  return {
    request(fn) {
      waiting.push(fn);
      return () => {
        waiting = waiting.filter((other) => other !== fn);
      };
    },
    fire() {
      const due = waiting;
      waiting = [];
      for (const fn of due) fn();
    },
  };
}

const words: EditorWords = {
  element: (_format, type) =>
    type === "dialogue" ? "Dialogue" : type === "action" ? "Action" : "General",
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

let views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
  document.body.replaceChildren();
});

const pagination = (): Plugin =>
  paginationPlugin({
    profile: sp,
    defer: (work) => work(),
    offFontNote: "note",
  });

/** A view of `doc` with these plugins, the caret at the end of block `block`. */
function viewOf(
  doc: Node,
  block: number,
  plugins: readonly Plugin[],
): EditorView {
  const index = toIndex(doc);
  const end = blockPos(index, block) + 1 + index.blocks[block]!.text.length;
  const place = document.createElement("div");
  document.body.append(place);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, end),
      plugins,
    }),
  });
  views.push(view);
  return view;
}

/** A view with pagination and the bridge, the caret at the end of block `block`. */
function mount(doc: Node, block: number) {
  const timers = fakeTimers();
  const frames = fakeFrames();
  const facts: Partial<FactsShape>[] = [];
  const outline: (readonly OutlineEntry[])[] = [];
  const view = viewOf(doc, block, [
    pagination(),
    bridgePlugin({
      facts: { publish: (changed) => facts.push(changed) },
      outline: { publish: (rows) => outline.push(rows) },
      history: noHistory,
      words,
      format: () => "screenplay",
      frames,
      timers,
    }),
  ]);
  return { view, timers, frames, facts, outline };
}

const type = (view: EditorView, text: string): void =>
  view.dispatch(view.state.tr.insertText(text));

test("typing inside a line publishes nothing", () => {
  const { view, frames, facts } = mount(script(40), 3);
  frames.fire();
  const first = facts.length;
  for (let i = 0; i < 20; i++) {
    type(view, "k");
    frames.fire();
  }
  expect([first, facts.length]).toEqual([1, 1]);
});

test("a fact that changes is published once per frame, alone", () => {
  const { view, frames, facts } = mount(
    docOfBlocks([
      ["character", "DANA"],
      ["dialogue", "Hi."],
    ]),
    1,
  );
  frames.fire();
  const { tr } = view.state;
  view.dispatch(
    tr.split(tr.selection.head, 1, [
      {
        type: schema.nodes.block,
        attrs: { id: "n000000000000001", type: "action" },
      },
    ]),
  );
  type(view, "R");
  const beforeFrame = facts.length;
  frames.fire();
  expect([beforeFrame, facts.slice(1)]).toEqual([
    1,
    [
      {
        element: "Action",
        blockType: "action",
        blockId: "n000000000000001",
        blockIndent: 0,
        blockWidth: 60,
        blockSpaceBefore: 1,
      },
    ],
  ]);
});

/** Composes `text` at the caret as an input method would; the view composes until `stop` is called. */
function compose(view: EditorView, text: string): { stop(): void } {
  // happy-dom has no input method: the view is told it composes
  let composing = true;
  Object.defineProperty(view, "composing", {
    configurable: true,
    get: () => composing,
  });
  view.dispatch(view.state.tr.insertText(text).setMeta("composition", 1));
  return {
    stop() {
      composing = false;
    },
  };
}

function endComposition(view: EditorView): void {
  view.dom.dispatchEvent(new Event("compositionend"));
}

test("a composition at the end of a line never publishes the next line's layout", () => {
  const { view, frames, facts } = mount(
    docOfBlocks([
      ["action", "abc"],
      ["character", "DANA"],
    ]),
    0,
  );
  frames.fire();
  const typing = compose(view, "xyzwvq");
  frames.fire();
  typing.stop();
  frames.fire();
  endComposition(view);
  frames.fire();
  expect(facts.slice(1)).toEqual([]);
});

test("a composition at the end of a scene never moves the outline's current scene", () => {
  const { view, timers, outline } = mount(
    docOfBlocks([
      ["scene_heading", "INT. A - DAY"],
      ["action", "abc"],
      ["scene_heading", "INT. B - DAY"],
    ]),
    1,
  );
  compose(view, "xyz").stop();
  // the input method has stopped; the pages catch up only when its event comes
  timers.advance(250);
  endComposition(view);
  timers.advance(250);
  expect(outline).toEqual([
    [
      {
        blockId: bid(0),
        number: "1",
        heading: "INT. A - DAY",
        omitted: false,
        current: true,
        kind: "scene",
        synopsis: "",
        eighths: 1,
      },
      {
        blockId: bid(2),
        number: "2",
        heading: "INT. B - DAY",
        omitted: false,
        current: false,
        kind: "scene",
        synopsis: "",
        eighths: 1,
      },
    ],
  ]);
});

/** The outline of one scene whose heading reads `heading`, the caret in it. */
const row = (heading: string): OutlineEntry[] => [
  {
    blockId: bid(0),
    kind: "scene",
    number: "1",
    heading,
    synopsis: "",
    eighths: 1,
    omitted: false,
    current: true,
  },
];

test("the outline waits 250 ms, publishes the latest, and not while composing", () => {
  const { view, timers, outline } = mount(
    docOfBlocks([
      ["scene_heading", "INT. A - DAY"],
      ["action", "x"],
    ]),
    0,
  );
  type(view, "B");
  timers.advance(100);
  type(view, "C");
  timers.advance(149);
  const waited = outline.length;
  timers.advance(1);
  // happy-dom has no input method: the view is told it composes
  let composing = true;
  Object.defineProperty(view, "composing", { get: () => composing });
  type(view, "D");
  timers.advance(500);
  const whileComposing = outline.length;
  composing = false;
  timers.advance(250);
  expect([waited, whileComposing, outline]).toEqual([
    1,
    2,
    [row("INT. A - DAY"), row("INT. A - DAYBC"), row("INT. A - DAYBCD")],
  ]);
});

test("an omitted scene is listed as omitted", () => {
  const doc = docOfBlocks([
    ["scene_heading", "INT. A - DAY"],
    ["action", "x"],
    ["scene_heading", "INT. B - DAY"],
  ]);
  const omitted = doc.type.create(
    null,
    doc
      .child(0)
      .copy(
        doc
          .child(0)
          .content.replaceChild(
            2,
            schema.nodes.block.create(
              { ...doc.child(0).child(2).attrs, omitted: true },
              schema.text("INT. B - DAY"),
            ),
          ),
      ),
  );
  const { outline } = mount(omitted, 1);
  expect(outline).toEqual([
    [
      {
        blockId: bid(0),
        number: "1",
        heading: "INT. A - DAY",
        omitted: false,
        current: true,
        kind: "scene",
        synopsis: "",
        eighths: 1,
      },
      {
        blockId: bid(2),
        number: "2",
        heading: "INT. B - DAY",
        omitted: true,
        current: false,
        kind: "scene",
        synopsis: "",
        eighths: 1,
      },
    ],
  ]);
});

/** Calls of descendants and nodesBetween, and reads of textContent, while `work` runs. */
function walksDuring(work: () => void): number[] {
  const descendants = spyOn(Node.prototype, "descendants");
  const nodesBetween = spyOn(Node.prototype, "nodesBetween");
  const text = Object.getOwnPropertyDescriptor(Node.prototype, "textContent")!;
  let textReads = 0;
  Object.defineProperty(Node.prototype, "textContent", {
    configurable: true,
    get(this: Node) {
      textReads++;
      return text.get!.call(this);
    },
  });
  try {
    work();
    return [
      descendants.mock.calls.length,
      nodesBetween.mock.calls.length,
      textReads,
    ];
  } finally {
    Object.defineProperty(Node.prototype, "textContent", text);
    descendants.mockRestore();
    nodesBetween.mockRestore();
  }
}

// the pagination plugin reads the text of each block it lays out again; the bridge must add nothing to that
test("the bridge never walks the document", () => {
  const doc = script(2000);
  const heading = toIndex(doc).blocks.findIndex(
    (block) => block.type === "scene_heading",
  );
  const { view, timers, frames, outline } = mount(doc, heading);
  const alone = viewOf(doc, heading, [pagination()]);
  frames.fire();
  const published = outline.length;
  const typing = (target: EditorView) => () => {
    for (let i = 0; i < 50; i++) {
      type(target, "k");
      frames.fire();
      timers.advance(10);
    }
  };
  expect([walksDuring(typing(view)), outline.length - published]).toEqual([
    walksDuring(typing(alone)),
    2,
  ]);
});

/** Moves the caret to the end of `block` without changing the document. */
function moveCaretTo(view: EditorView, block: number): void {
  const index = toIndex(view.state.doc);
  const end = blockPos(index, block) + 1 + index.blocks[block]!.text.length;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  );
}

test("moving the caret to another scene updates the current scene on the next frame", () => {
  const doc = docOfBlocks([
    ["scene_heading", "INT. A - DAY"],
    ["action", "first"],
    ["scene_heading", "INT. B - DAY"],
    ["action", "second"],
    ["scene_heading", "INT. C - DAY"],
  ]);
  const timers = fakeTimers();
  const frames = fakeFrames();
  const facts: Partial<FactsShape>[] = [];
  const publishedRows: (readonly OutlineEntry[])[] = [];
  const publishedCurrent: (string | null)[] = [];
  const view = viewOf(doc, 1, [
    pagination(),
    bridgePlugin({
      facts: { publish: (changed) => facts.push(changed) },
      outline: {
        publish: (rows) => publishedRows.push(rows),
        publishCurrent: (blockId) => publishedCurrent.push(blockId),
      },
      history: noHistory,
      words,
      format: () => "screenplay",
      frames,
      timers,
    }),
  ]);
  frames.fire();
  const initialRowCount = publishedRows.length;
  const initialCurrent = [...publishedCurrent];

  moveCaretTo(view, 3);
  const beforeFrame = [...publishedCurrent];
  frames.fire();
  const afterMoveFacts = facts.at(-1);

  // moving inside the same scene publishes nothing more
  moveCaretTo(view, 2);
  frames.fire();

  // advancing the 250 ms timer triggers no structural rebuild for selection-only moves
  timers.advance(250);

  expect([
    initialRowCount,
    initialCurrent,
    beforeFrame,
    publishedCurrent,
    publishedRows.length,
    afterMoveFacts?.scene,
    afterMoveFacts?.sceneId,
  ]).toEqual([1, [bid(0)], [bid(0)], [bid(0), bid(2)], 1, "2", bid(2)]);
});

test("a minimal outline sink receives a frame-fast update when the caret enters another scene", () => {
  const doc = docOfBlocks([
    ["scene_heading", "INT. A - DAY"],
    ["action", "first"],
    ["scene_heading", "INT. B - DAY"],
    ["action", "second"],
    ["scene_heading", "INT. C - DAY"],
  ]);
  const { view, frames, outline } = mount(doc, 1);
  frames.fire();
  const first = outline[0]!;
  moveCaretTo(view, 3);
  const beforeFrame = outline.length;
  frames.fire();
  const second = outline[1]!;
  expect([
    beforeFrame,
    outline.length,
    second.map((entry) => [entry.blockId, entry.current]),
    second[2] === first[2],
  ]).toEqual([
    1,
    2,
    [
      [bid(0), false],
      [bid(2), true],
      [bid(4), false],
    ],
    true,
  ]);
});

test("the outline rebuilds when layout patches arrive without a document change", () => {
  const doc = docOfBlocks([
    ["scene_heading", "INT. A - DAY"],
    ["action", "One."],
    ["scene_heading", "INT. B - NIGHT"],
    ["action", "Hidden."],
    ["scene_heading", "INT. C - NIGHT"],
  ]);
  const { view, timers, outline } = mount(doc, 0);
  view.dispatch(
    setPagination(view.state.tr, {
      layout: {
        key: "omit-b",
        patches: new Map([
          [bid(2), { text: "OMITTED", num: "2" }],
          [bid(3), { type: "group", text: "" }],
        ]),
      },
    }),
  );
  timers.advance(250);
  expect(
    outline.at(-1)!.map((entry) => [entry.blockId, entry.kind, entry.heading]),
  ).toEqual([
    [bid(0), "scene", "INT. A - DAY"],
    [bid(2), "scene", "OMITTED"],
    [bid(4), "scene", "INT. C - NIGHT"],
  ]);
});

test("scrolling the editor publishes the viewed scene on the next frame and dedupes unchanged scenes", () => {
  const doc = docOfBlocks([
    ["scene_heading", "INT. A - DAY"],
    ["action", "first"],
    ["scene_heading", "INT. B - DAY"],
    ["action", "second"],
    ["scene_heading", "INT. C - DAY"],
  ]);
  const timers = fakeTimers();
  const frames = fakeFrames();
  const scroller = document.createElement("div");
  const viewed: (string | null)[] = [];
  let blockAtViewport: number | null = 1;
  const view = viewOf(doc, 0, [
    pagination(),
    bridgePlugin({
      facts: { publish() {} },
      outline: {
        publish() {},
        publishViewed: (blockId) => viewed.push(blockId),
      },
      history: noHistory,
      words,
      format: () => "screenplay",
      frames,
      timers,
      scroll: {
        scroller: () => scroller,
        viewedBlock: () => blockAtViewport,
      },
    }),
  ]);
  frames.fire();
  const initial = [...viewed];
  // scroll inside scene 2 -> publishes bid(2) on the next frame
  blockAtViewport = 3;
  scroller.dispatchEvent(new Event("scroll"));
  const beforeFrame = [...viewed];
  frames.fire();
  // scrolling again inside scene 2 publishes nothing extra
  blockAtViewport = 2;
  scroller.dispatchEvent(new Event("scroll"));
  frames.fire();
  // scrolling into scene 3 -> publishes bid(4)
  blockAtViewport = 4;
  scroller.dispatchEvent(new Event("scroll"));
  frames.fire();
  view.destroy();
  // scrolling after destroy publishes nothing
  blockAtViewport = 0;
  scroller.dispatchEvent(new Event("scroll"));
  frames.fire();
  expect([initial, beforeFrame, viewed]).toEqual([
    [bid(0)],
    [bid(0)],
    [bid(0), bid(2), bid(4)],
  ]);
});
