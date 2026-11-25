import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  blockPos,
  bridgePlugin,
  completePlugin,
  inkMarksPlugin,
  inkOutlineOf,
  toIndex,
} from "../src/index.ts";
import type {
  EditorWords,
  Frames,
  HistoryPort,
  InkMarkSource,
  InkProblem,
  OutlineEntry,
  Timers,
} from "../src/index.ts";
import { bid, docOfBlocks } from "./docs.ts";

withDom();

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
  element: () => "Ink",
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

const INK_LINES: readonly (readonly [string, string])[] = [
  ["ink_line", "VAR trust = 0"],
  ["ink_line", "CONST max_trust = 3"],
  ["ink_line", "-> stairs"],
  ["ink_line", "=== stairs ==="],
  ["ink_line", "You climb the stairs."],
  ["ink_line", "=== quiz ==="],
  ["ink_line", "= question_1"],
  ["ink_line", "~ temp tries = 1"],
  ["ink_line", "The keeper hands you the logbook."],
  ["ink_line", "= entry"],
  ["ink_line", ""],
  ["ink_line", "=== function is_trusted ==="],
  ["ink_line", "~ return trust >= 2"],
];

let views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
  document.body.replaceChildren();
});

function setCaretEnd(view: EditorView, block: number): void {
  const index = toIndex(view.state.doc);
  const end = blockPos(index, block) + 1 + index.blocks[block]!.text.length;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  );
}

function typeAt(view: EditorView, block: number, text: string): void {
  setCaretEnd(view, block);
  for (const ch of text) view.dispatch(view.state.tr.insertText(ch));
}

const options = (layer: HTMLElement): string[] =>
  [...layer.querySelectorAll('#mn-complete [role="option"]')].map(
    (el) => el.textContent ?? "",
  );

test("inkOutlineOf lists knots and indented stitches, skips function knots, and marks current", () => {
  const doc = docOfBlocks(INK_LINES);
  const outline = inkOutlineOf(doc, 8);
  expect(outline.entries).toEqual([
    {
      blockId: bid(3),
      kind: "knot",
      number: null,
      heading: "stairs",
      synopsis: "",
      eighths: null,
      omitted: false,
      current: false,
    },
    {
      blockId: bid(5),
      kind: "knot",
      number: null,
      heading: "quiz",
      synopsis: "",
      eighths: null,
      omitted: false,
      current: false,
    },
    {
      blockId: bid(6),
      kind: "stitch",
      number: null,
      heading: "quiz › question_1",
      synopsis: "",
      eighths: null,
      omitted: false,
      current: true,
    },
    {
      blockId: bid(9),
      kind: "stitch",
      number: null,
      heading: "quiz › entry",
      synopsis: "",
      eighths: null,
      omitted: false,
      current: false,
    },
  ]);
});

test("bridgePlugin publishes Ink outline without pages and throttles updates", () => {
  const doc = docOfBlocks(INK_LINES);
  const timers = fakeTimers();
  const frames = fakeFrames();
  const outlines: (readonly OutlineEntry[])[] = [];
  const place = document.createElement("div");
  document.body.append(place);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc,
      plugins: [
        bridgePlugin({
          facts: { publish: () => {} },
          outline: { publish: (rows) => outlines.push(rows) },
          history: noHistory,
          words,
          format: () => "ink",
          frames,
          timers,
        }),
      ],
    }),
  });
  views.push(view);
  expect(outlines.length).toBe(1);
  expect(outlines[0]!.map((r) => [r.kind, r.heading, r.current])).toEqual([
    ["knot", "stairs", false],
    ["knot", "quiz", false],
    ["stitch", "quiz › question_1", false],
    ["stitch", "quiz › entry", false],
  ]);
  setCaretEnd(view, 9);
  expect(outlines.length).toBe(1);
  frames.fire();
  expect(outlines.length).toBe(2);
  expect(outlines[1]!.find((r) => r.current)?.heading).toBe("quiz › entry");

  typeAt(view, 3, "!");
  frames.fire();
  expect(outlines.length).toBe(2);
  timers.advance(250);
  expect(outlines.length).toBe(3);
  expect(outlines[2]![0]!.heading).toBe("stairs ===!");
});

test("Ink autocomplete offers diverts (knots, bare stitches in current knot, knot.stitch) and variables/functions inside braces", () => {
  const doc = docOfBlocks(INK_LINES);
  const place = document.createElement("div");
  const layer = document.createElement("div");
  document.body.append(place, layer);
  const timers = fakeTimers();
  const frames = fakeFrames();
  const view = new EditorView(place, {
    state: EditorState.create({
      doc,
      plugins: [completePlugin({ layer, frames, timers, projectNames: [] })],
    }),
  });
  views.push(view);
  view.focus();

  // Inside knot `quiz` (block 10): bare stitch `question_1` + knot `quiz` + `quiz.*` paths
  typeAt(view, 10, "-> q");
  expect(options(layer)).toEqual([
    "quiz",
    "question_1",
    "quiz.question_1",
    "quiz.entry",
  ]);

  // Accept first option via Enter
  view.dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(toIndex(view.state.doc).blocks[10]!.text).toBe("-> quiz");

  // Variables & functions inside `{...}`
  typeAt(view, 10, " {t");
  expect(options(layer)).toEqual(["trust", "tries"]);

  // Function name inside braces
  typeAt(view, 10, " + is_");
  expect(options(layer)).toEqual(["is_trusted"]);

  // Outside any knot (block 4 is inside `stairs`): no bare stitch `entry`
  typeAt(view, 4, " -> e");
  expect(options(layer)).toEqual([]);
});

test("inkMarksPlugin renders problem underline, gutter mark, hover/caret tooltip, once-per-entry announcement, and visited dot", () => {
  let problems: InkProblem[] = [
    { line: 5, message: "Divert target not found" },
  ];
  let visited = new Set<number>([3]);
  const listeners = new Set<() => void>();
  const source: InkMarkSource = {
    problems: () => problems,
    visited: () => visited,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const announced: string[] = [];
  const place = document.createElement("div");
  const layer = document.createElement("div");
  document.body.append(place, layer);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: docOfBlocks(INK_LINES),
      plugins: [
        inkMarksPlugin(source, {
          layer,
          announce: (text) => announced.push(text),
        }),
      ],
    }),
  });
  views.push(view);

  const problemLine = view.dom.querySelector(".mn-ink-problem");
  const problemMark = view.dom.querySelector<HTMLElement>(
    '[data-ink-mark="problem"]',
  );
  const visitedMark = view.dom.querySelector<HTMLElement>(
    '[data-ink-mark="visited"]',
  );
  expect([
    problemLine !== null,
    problemMark?.getAttribute("aria-label"),
    visitedMark?.getAttribute("aria-label"),
    announced,
  ]).toEqual([true, "Problem on line 5", "Visited", []]);

  // Hovering visited mark shows "Visited" tooltip
  visitedMark!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  expect(layer.querySelector('[role="tooltip"]')?.textContent).toBe("Visited");
  visitedMark!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  expect(layer.querySelector('[role="tooltip"]')).toBeNull();

  // Moving caret into line 5 (block index 4) shows tooltip and announces once
  setCaretEnd(view, 4);
  expect([
    layer.querySelector('[role="tooltip"]')?.textContent,
    announced,
  ]).toEqual(["Divert target not found", ["Line 5: Divert target not found"]]);

  // Typing on the same problem line does NOT repeat announcement
  view.dispatch(view.state.tr.insertText("!"));
  expect(announced).toEqual(["Line 5: Divert target not found"]);

  // Leaving and re-entering announces again
  setCaretEnd(view, 3);
  expect(layer.querySelector('[role="tooltip"]')).toBeNull();
  setCaretEnd(view, 4);
  expect(announced).toEqual([
    "Line 5: Divert target not found",
    "Line 5: Divert target not found",
  ]);

  // Updating source clears decorations
  problems = [];
  visited = new Set();
  for (const fn of listeners) fn();
  expect([
    view.dom.querySelector(".mn-ink-problem"),
    view.dom.querySelector('[data-ink-mark="visited"]'),
  ]).toEqual([null, null]);
});
