import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { parseDoc } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as editor from "../src/index.ts";
import {
  blockPos,
  completeKey,
  completePlugin,
  paginationPlugin,
  toIndex,
} from "../src/index.ts";
import type { Frames, Timers } from "../src/index.ts";
import { docOfBlocks, sp } from "./docs.ts";

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

let views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
  document.body.replaceChildren();
});

function mount(doc: Node): {
  view: EditorView;
  layer: HTMLElement;
  timers: ReturnType<typeof fakeTimers>;
  frames: ReturnType<typeof fakeFrames>;
} {
  const place = document.createElement("div");
  const layer = document.createElement("div");
  document.body.append(place, layer);
  const timers = fakeTimers();
  const frames = fakeFrames();
  const view = new EditorView(place, {
    state: EditorState.create({
      doc,
      plugins: [
        completePlugin({ layer, frames, timers, projectNames: [] }),
        paginationPlugin({
          profile: sp,
          defer: (work) => work(),
          offFontNote: "note",
        }),
      ],
    }),
  });
  views.push(view);
  view.focus();
  return { view, layer, timers, frames };
}

const SCENE: readonly (readonly [string, string])[] = [
  ["scene_heading", "INT. KITCHEN - NIGHT"],
  ["character", "DANA"],
  ["dialogue", "Hi."],
  ["character", "DAVID (V.O.)"],
  ["dialogue", "Hello."],
];

/** The caret at the end of block `block`, then `text` typed there one character at a time. */
function typeAt(view: EditorView, block: number, text: string): void {
  const index = toIndex(view.state.doc);
  const end = blockPos(index, block) + 1 + index.blocks[block]!.text.length;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, end)),
  );
  for (const char of text) view.dispatch(view.state.tr.insertText(char));
}

function press(
  view: EditorView,
  key: string,
  composing = false,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    isComposing: composing,
  });
  view.dom.dispatchEvent(event);
  return event;
}

const options = (layer: HTMLElement): string[] =>
  [...layer.querySelectorAll('#mn-complete [role="option"]')].map(
    (option) => option.textContent ?? "",
  );

const blockText = (view: EditorView, block: number): string =>
  toIndex(view.state.doc).blocks[block]!.text;

test("typing a cue opens the list under the caret without taking focus, and Enter accepts", () => {
  const { view, layer, timers } = mount(
    docOfBlocks([...SCENE, ["character", ""]]),
  );
  timers.advance(250);
  typeAt(view, 5, "Da");
  const list = layer.querySelector("#mn-complete");
  expect([
    list?.getAttribute("role"),
    options(layer),
    document.activeElement === view.dom,
    view.dom.getAttribute("aria-controls"),
    view.dom.getAttribute("aria-activedescendant"),
    view.dom.getAttribute("aria-autocomplete"),
  ]).toEqual([
    "listbox",
    ["DAVID", "DANA"],
    true,
    "mn-complete",
    layer.querySelector('[role="option"]')?.id,
    "list",
  ]);
  press(view, "Enter");
  expect([
    blockText(view, 5),
    layer.querySelector("#mn-complete"),
    view.dom.getAttribute("aria-controls"),
  ]).toEqual(["DAVID", null, null]);
});

test("the list is placed under the caret in a frame", () => {
  const { view, layer, timers, frames } = mount(
    docOfBlocks([...SCENE, ["character", ""]]),
  );
  timers.advance(250);
  typeAt(view, 5, "Da");
  const list = layer.querySelector<HTMLElement>("#mn-complete")!;
  const before = [list.style.left, list.style.top];
  frames.fire();
  const caret = view.coordsAtPos(view.state.selection.head);
  const box = layer.getBoundingClientRect();
  expect([before, [list.style.left, list.style.top]]).toEqual([
    ["", ""],
    [`${caret.left - box.left}px`, `${caret.bottom - box.top}px`],
  ]);
});

test("the arrows move through the list and Tab accepts the one chosen", () => {
  const { view, layer, timers } = mount(
    docOfBlocks([...SCENE, ["character", ""]]),
  );
  timers.advance(250);
  typeAt(view, 5, "Da");
  press(view, "ArrowDown");
  const chosen = layer.querySelectorAll('[role="option"]')[1]!;
  expect([
    chosen.getAttribute("aria-selected"),
    view.dom.getAttribute("aria-activedescendant") === chosen.id,
    completeKey.getState(view.state)!.active,
  ]).toEqual(["true", true, 1]);
  press(view, "ArrowUp");
  press(view, "ArrowUp");
  press(view, "ArrowDown");
  press(view, "Tab");
  expect(blockText(view, 5)).toBe("DANA");
});

test("Escape leaves what was typed", () => {
  const { view, layer, timers } = mount(
    docOfBlocks([...SCENE, ["character", ""]]),
  );
  timers.advance(250);
  typeAt(view, 5, "Da");
  const reached: string[] = [];
  const listen = (event: KeyboardEvent) => reached.push(event.key);
  document.body.addEventListener("keydown", listen);
  const event = press(view, "Escape");
  press(view, "x");
  document.body.removeEventListener("keydown", listen);
  expect([
    blockText(view, 5),
    layer.querySelector("#mn-complete"),
    event.defaultPrevented,
    reached,
  ]).toEqual(["Da", null, true, ["x"]]);
});

test("accepting a location goes on to the time of day", () => {
  const { view, layer, timers } = mount(
    docOfBlocks([...SCENE, ["scene_heading", ""]]),
  );
  timers.advance(250);
  typeAt(view, 5, "INT. K");
  expect(options(layer)).toEqual(["KITCHEN"]);
  press(view, "Tab");
  expect([blockText(view, 5), options(layer)]).toEqual([
    "INT. KITCHEN - ",
    ["NIGHT", "DAY", "CONTINUOUS", "LATER"],
  ]);
});

test("a keystroke elsewhere in a long script does not collect names", () => {
  const { view, timers } = mount(
    parseDoc(corpusDoc(generateBlocks("screenplay", 5000, 1))),
  );
  const collect = spyOn(editor, "collectNames");
  const action = toIndex(view.state.doc).blocks.findIndex(
    (block) => block.type === "action",
  );
  for (let i = 0; i < 40; i++) {
    typeAt(view, action, "k");
    timers.advance(5);
  }
  const typing = collect.mock.calls.length;
  timers.advance(50);
  expect([typing, collect.mock.calls.length]).toEqual([0, 1]);
  collect.mockRestore();
});

test("while composing the list is not shown", () => {
  const { view, layer, timers } = mount(
    docOfBlocks([...SCENE, ["character", ""]]),
  );
  timers.advance(250);
  typeAt(view, 5, "Da");
  const event = press(view, "Enter", true);
  const kept = blockText(view, 5);
  view.dispatch(view.state.tr.insertText("v").setMeta("composition", 1));
  expect([
    event.defaultPrevented,
    kept,
    layer.querySelector("#mn-complete"),
    completeKey.getState(view.state)!.open,
  ]).toEqual([false, "Da", null, null]);
});
