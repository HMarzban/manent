import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type {
  CursorPlace,
  Frames,
  PresencePort,
  RemoteCursor,
  Timers,
} from "../src/index.ts";
import {
  CURSOR_CSS,
  MAX_SELECTION_BLOCKS,
  NAME_TAB_MS,
  cursorsKey,
  cursorsPlugin,
} from "../src/index.ts";
import { bid, docOf, replaceWholeDoc } from "./docs.ts";

withDom();

interface Fakes {
  readonly presence: PresencePort;
  readonly frames: Frames;
  readonly timers: Timers;
  emit(cursors: readonly RemoteCursor[]): void;
  /** Runs every frame requested so far. */
  fire(): void;
  advance(ms: number): void;
  readonly published: (CursorPlace | null)[];
}

function fakes(): Fakes {
  const listeners = new Set<(cursors: readonly RemoteCursor[]) => void>();
  let frames: (() => void)[] = [];
  let timers: { at: number; fn: () => void }[] = [];
  let clock = 1_000_000;
  const published: (CursorPlace | null)[] = [];
  return {
    presence: {
      publish: (place) => published.push(place),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribePeople: () => () => {},
    },
    frames: {
      request: (fn) => {
        frames.push(fn);
        return () => {
          frames = frames.filter((f) => f !== fn);
        };
      },
    },
    timers: {
      now: () => clock,
      schedule: (fn, delayMs) => {
        const timer = { at: clock + delayMs, fn };
        timers.push(timer);
        return () => {
          timers = timers.filter((t) => t !== timer);
        };
      },
    },
    emit: (cursors) => {
      for (const listener of listeners) listener(cursors);
    },
    fire: () => {
      const due = frames;
      frames = [];
      for (const fn of due) fn();
    },
    advance: (ms) => {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock);
      timers = timers.filter((t) => t.at > clock);
      for (const t of due) t.fn();
    },
    published,
  };
}

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

function mount(
  doc: Node,
  f: Fakes,
): { view: EditorView; draws: () => Transaction[] } {
  const transactions: Transaction[] = [];
  const view: EditorView = new EditorView(
    document.body.appendChild(document.createElement("div")),
    {
      state: EditorState.create({ doc, plugins: [cursorsPlugin(f)] }),
      dispatchTransaction: (tr) => {
        transactions.push(tr);
        view.updateState(view.state.apply(tr));
      },
    },
  );
  views.push(view);
  return {
    view,
    draws: () =>
      transactions.filter((tr) => tr.getMeta(cursorsKey) !== undefined),
  };
}

function dana(place: CursorPlace, movedAt: number): RemoteCursor {
  return {
    key: "7",
    userId: "dana",
    name: "Dana Reyes",
    initials: "DR",
    colour: 3,
    place,
    movedAt,
  };
}

const at = (block: number, offset: number): CursorPlace => ({
  anchor: { blockId: bid(block), offset },
  head: { blockId: bid(block), offset },
  at: block,
});

/** Each drawn caret as its colour and the text of its tab, or null without one. */
const carets = (view: EditorView): [string | undefined, string | null][] =>
  [...view.dom.querySelectorAll<HTMLElement>(".mn-cursor")].map((caret) => [
    caret.dataset["collab"],
    caret.querySelector(".mn-cursor-tab")?.textContent ?? null,
  ]);

const widgets = (view: EditorView): [number, unknown][] =>
  cursorsKey
    .getState(view.state)!
    .decorations.find()
    .map((d) => [d.from, d.spec.key]);

test("another person's caret is drawn with their name, which gives way to their initials after three seconds", () => {
  const f = fakes();
  const { view } = mount(docOf([["the rain falls", "on the roof"]]), f);
  f.emit([dana(at(1, 3), f.timers.now())]);
  expect(carets(view)).toEqual([]);
  f.fire();
  expect(carets(view)).toEqual([["3", "Dana Reyes"]]);
  expect(widgets(view)).toEqual([[21, "cursor:7:3:true"]]);
  f.advance(NAME_TAB_MS - 1);
  f.fire();
  expect(carets(view)).toEqual([["3", "Dana Reyes"]]);
  f.advance(1);
  f.fire();
  expect(carets(view)).toEqual([["3", "DR"]]);
  expect(widgets(view)).toEqual([[21, "cursor:7:3:false"]]);
});

test("cursors arriving in one frame are drawn in one transaction", () => {
  const f = fakes();
  const { view, draws } = mount(docOf([["one", "two", "three"]]), f);
  for (const block of [0, 1, 2, 0, 1]) f.emit([dana(at(block, 1), 0)]);
  expect(draws()).toEqual([]);
  f.fire();
  expect(draws().length).toBe(1);
  expect(draws()[0]!.docChanged).toBe(false);
  expect(widgets(view)).toEqual([[8, "cursor:7:3:false"]]);
});

test("a cursor whose block is gone is not drawn", () => {
  const f = fakes();
  const { view } = mount(docOf([["one", "two"]]), f);
  f.emit([
    dana(
      {
        anchor: { blockId: "gone", offset: 0 },
        head: { blockId: "gone", offset: 0 },
        at: 0,
      },
      f.timers.now(),
    ),
  ]);
  f.fire();
  expect(carets(view)).toEqual([]);
});

test("a cursor is found again after the script around it is replaced", () => {
  const f = fakes();
  const { view } = mount(docOf([["one", "two"]]), f);
  f.emit([dana(at(1, 2), 0)]);
  f.fire();
  view.dispatch(replaceWholeDoc(view.state, 0, "first"));
  expect(widgets(view)).toEqual([]);
  f.fire();
  expect(widgets(view)).toEqual([[11, "cursor:7:3:false"]]);
});

test("nothing is redrawn while composing", () => {
  const f = fakes();
  const { view, draws } = mount(docOf([["one", "two"]]), f);
  let composing = true;
  Object.defineProperty(view, "composing", { get: () => composing });
  f.emit([dana(at(1, 2), 0)]);
  f.fire();
  view.dispatch(view.state.tr.insertText("x", 2));
  f.fire();
  expect([draws(), carets(view)]).toEqual([[], []]);
  composing = false;
  view.dom.dispatchEvent(new Event("compositionend"));
  f.fire();
  expect(draws().length).toBe(1);
  expect(widgets(view)).toEqual([[10, "cursor:7:3:false"]]);
});

test("a selection is drawn in its own element, block by block, and capped", () => {
  const f = fakes();
  const lines = Array.from({ length: 250 }, (_, i) => `line ${i}`);
  const doc = docOf([
    lines.slice(0, 100),
    lines.slice(100, 200),
    lines.slice(200),
  ]);
  const { view } = mount(doc, f);
  const starts: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "block") return true;
    starts.push(pos + 1);
    return false;
  });
  f.emit([
    {
      ...dana(at(201, 3), 0),
      place: {
        anchor: { blockId: bid(1), offset: 2 },
        head: { blockId: bid(201), offset: 3 },
        at: 201,
      },
    },
  ]);
  f.fire();
  const drawn = Array.from({ length: MAX_SELECTION_BLOCKS }, (_, i) => i + 2);
  expect(
    cursorsKey
      .getState(view.state)!
      .decorations.find()
      .filter((d) => d.spec.key === undefined)
      .map((d) => [d.from, d.to]),
  ).toEqual(
    drawn.map((block) => [
      starts[block]!,
      block === 201
        ? starts[block]! + 3
        : starts[block]! + lines[block]!.length,
    ]),
  );
  const elements = [...view.dom.querySelectorAll<HTMLElement>("mn-remote-sel")];
  expect(elements.length).toBe(MAX_SELECTION_BLOCKS);
  expect(new Set(elements.map((e) => e.dataset["collab"]))).toEqual(
    new Set(["3"]),
  );
  expect(elements.map((e) => e.parentElement?.dataset["id"])).toEqual(
    drawn.map(bid),
  );
});

test("the local caret is published whenever it or the text moves", () => {
  const f = fakes();
  const { view } = mount(docOf([["one", "two"]]), f);
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)),
  );
  view.dispatch(view.state.tr.insertText("x", 2));
  f.emit([dana(at(0, 1), 0)]);
  f.fire();
  expect(f.published).toEqual([at(1, 0), at(1, 0)]);
});

/** Each rule of the cursors' styles as its selector and its declarations, trimmed. */
const cssRules = (): [string, string[]][] =>
  [...CURSOR_CSS.matchAll(new RegExp("([^{}]+)\\{([^{}]*)\\}", "g"))].map(
    (m) => [
      m[1]!.trim(),
      m[2]!
        .split(";")
        .map((d) => d.trim())
        .filter((d) => d !== ""),
    ],
  );

/** The rule's declarations of position and display. */
const positioning = (selector: string): string[] =>
  cssRules()
    .find(([s]) => s === selector)![1]
    .filter((d) => d.startsWith("position") || d.startsWith("display"));

test("a caret takes no room on its line: its bar and name tab are placed out of the flow", () => {
  expect([
    positioning(".mn-cursor"),
    positioning(".mn-cursor-bar"),
    positioning(".mn-cursor-tab"),
  ]).toEqual([
    ["position: relative", "display: inline"],
    ["position: absolute"],
    ["position: absolute"],
  ]);
});

test("hiding cursors is display only", () => {
  expect(
    cssRules().filter(([selector]) => selector.includes("data-cursors")),
  ).toEqual([
    ['[data-cursors="off"] .mn-cursor', ["display: none"]],
    ['[data-cursors="off"] mn-remote-sel', ["display: contents"]],
  ]);
});

test("a caret and its selection take their person's collaborator token, and nothing else colours them", () => {
  expect(
    cssRules().filter(([selector]) => selector.includes("data-collab=")),
  ).toEqual(
    Array.from({ length: 10 }, (_, i) => [
      `.mn-cursor[data-collab="${i + 1}"], mn-remote-sel[data-collab="${i + 1}"]`,
      [`--mn-collab: var(--collab-${i + 1})`],
    ]),
  );
  expect(
    new Set(
      [...CURSOR_CSS.matchAll(new RegExp("var\\((--[a-z0-9-]+)\\)", "g"))].map(
        (m) => m[1],
      ),
    ),
  ).toEqual(
    new Set([
      "--mn-collab",
      "--collab-on",
      "--type-micro",
      "--lh-micro",
      "--face-ui",
      ...Array.from({ length: 10 }, (_, i) => `--collab-${i + 1}`),
    ]),
  );
});
