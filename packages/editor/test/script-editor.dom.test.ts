import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { ENGINE_VERSION, engineFor } from "@manent/pagination";
import { schema } from "@manent/schema";
import type { Node } from "prosemirror-model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  NO_PASTED_TEXT,
  createScriptEditor,
  elementKeysPlugin,
  paginationKey,
  sectionEditingPlugin,
  staticBinding,
} from "../src/index.ts";
import type {
  CursorPlace,
  EditorBinding,
  EditorPluginHost,
  FactsShape,
  ScriptEditor,
  ScriptEditorOptions,
  SettingsReader,
} from "../src/index.ts";
import { bid, counter, docOf } from "./docs.ts";

withDom();

interface Queue {
  request(fn: () => void): () => void;
  fire(): void;
  pending(): number;
}

/** Frames that run only when fired; `pending` counts the ones not yet run or cancelled. */
function fakeFrames(): Queue {
  let queued: (() => void)[] = [];
  return {
    request(fn) {
      queued.push(fn);
      return () => {
        queued = queued.filter((f) => f !== fn);
      };
    },
    fire() {
      const now = queued;
      queued = [];
      for (const fn of now) fn();
    },
    pending: () => queued.length,
  };
}

interface FakeTimers {
  now: () => number;
  schedule(fn: () => void, delayMs: number): () => void;
  pending(): number;
}

/** Timers that never fire; `pending` counts the ones not cancelled. */
function fakeTimers(): FakeTimers {
  const scheduled = new Set<() => void>();
  return {
    now: () => 0,
    schedule(fn) {
      const entry = () => fn();
      scheduled.add(entry);
      return () => {
        scheduled.delete(entry);
      };
    },
    pending: () => scheduled.size,
  };
}

interface FakeReader extends SettingsReader {
  set(key: string, value: unknown): void;
  /** Listeners still subscribed. */
  listening(): number;
}

function fakeReader(values: Record<string, unknown> = {}): FakeReader {
  const map = new Map<string, unknown>(Object.entries(values));
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (key) => map.get(key),
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
      };
    },
    set(key, value) {
      map.set(key, value);
      for (const listener of listeners.get(key) ?? []) listener();
    },
    listening: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

interface Desk {
  width: number;
  readonly listeners: Set<() => void>;
  resize(width: number): void;
}

function fakeDesk(width: number): Desk {
  const desk: Desk = {
    width,
    listeners: new Set(),
    resize(next) {
      desk.width = next;
      for (const listener of desk.listeners) listener();
    },
  };
  return desk;
}

/** A place 600 px tall at the viewport's top that scrolls. */
function fakePlace(): HTMLElement {
  const place = document.body.appendChild(document.createElement("div"));
  place.style.overflowY = "auto";
  let top = 0;
  Object.defineProperty(place, "scrollTop", {
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  place.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 600 });
  return place;
}

const bindingKey = (name: string): Plugin =>
  new Plugin({ key: new PluginKey(name) });

interface Fakes {
  readonly place: HTMLElement;
  readonly frames: Queue;
  readonly timers: FakeTimers;
  readonly personal: FakeReader;
  readonly script: FakeReader;
  readonly guard: { depth: number; log: string[] };
  readonly facts: Partial<FactsShape>[];
  readonly published: (CursorPlace | null)[];
  readonly desk: Desk;
  /** Every transaction the view applied. */
  readonly transactions: Transaction[];
  /** The guard's depth at each view update. */
  readonly updates: number[];
}

interface Made {
  readonly e: ScriptEditor;
  readonly fakes: Fakes;
}

const made: ScriptEditor[] = [];
afterEach(() => {
  for (const e of made.splice(0)) if (!e.view.isDestroyed) e.destroy();
  document.body.replaceChildren();
});

function editor(
  options: {
    doc?: Node;
    script?: Record<string, unknown>;
    editable?: boolean;
    zoom?: ScriptEditorOptions["zoom"];
    host?: (host: EditorPluginHost) => void;
  } = {},
): Made {
  const doc = options.doc ?? docOf([["one", "two", "three"]]);
  const fakes: Fakes = {
    place: fakePlace(),
    frames: fakeFrames(),
    timers: fakeTimers(),
    personal: fakeReader(),
    script: fakeReader(options.script),
    guard: { depth: 0, log: [] },
    facts: [],
    published: [],
    desk: fakeDesk(1000),
    transactions: [],
    updates: [],
  };
  const { guard } = fakes;
  const binding: EditorBinding = {
    ...staticBinding(doc),
    plugins: [bindingKey("binding-a"), bindingKey("binding-b")],
    presence: {
      publish: (place) => fakes.published.push(place),
      subscribe: () => () => {},
      subscribePeople: () => () => {},
    },
  };
  const recording = new Plugin({
    key: new PluginKey("extra-a"),
    filterTransaction: (tr) => {
      fakes.transactions.push(tr);
      return true;
    },
    view: () => ({ update: () => fakes.updates.push(guard.depth) }),
  });
  const e = createScriptEditor({
    place: fakes.place,
    binding,
    editable: options.editable ?? true,
    personal: fakes.personal,
    script: fakes.script,
    layoutEngine: engineFor(ENGINE_VERSION)!,
    facts: { publish: (changed) => fakes.facts.push(changed) },
    outline: { publish: () => {} },
    guard: {
      enter: () => {
        guard.depth++;
        guard.log.push("enter");
      },
      leave: () => {
        guard.depth--;
        guard.log.push("leave");
      },
    },
    words: {
      element: (_format, type) => type,
      placeholder: () => null,
      picker: "Element",
      offFontNote: "note",
    },
    frames: fakes.frames,
    timers: fakes.timers,
    ports: {
      fonts: { add: () => {} },
      makeFace: () => ({ load: () => new Promise(() => {}) }),
      wait: () => new Promise(() => {}),
      defer: (work) => work(),
      whenIdle: () => {},
      userAgent: "test",
    },
    platform: "mac",
    ids: counter("n"),
    random: () => "r",
    pastedText: NO_PASTED_TEXT,
    onUndoStep: () => {},
    title: { get: () => "Low Tide", subscribe: () => () => {} },
    keys: { resolve: () => null, run: () => false },
    zoom: options.zoom ?? 100,
    desk: {
      widthPx: () => fakes.desk.width,
      paddingPx: () => 64,
      observe: (listener) => {
        fakes.desk.listeners.add(listener);
        return () => {
          fakes.desk.listeners.delete(listener);
        };
      },
    },
    extraPlugins: (host) => {
      options.host?.(host);
      return [recording, bindingKey("extra-b")];
    },
  });
  made.push(e);
  return { e, fakes };
}

const referenceContext = {
  format: () => "screenplay" as const,
  prefs: () => ({ enterAfterDialogue: "action" as const }),
  history: staticBinding(docOf([["x"]])).history,
  ids: counter("r"),
  openPicker: () => {},
};

/** Plugins made by one factory share the source of their props. */
const signature = (plugin: Plugin): string =>
  Object.entries(plugin.spec.props ?? {})
    .map(([name, value]) => `${name}:${String(value)}`)
    .join("|");

const REFERENCE = new Map([
  [signature(elementKeysPlugin(referenceContext)), "element-keys"],
  [signature(sectionEditingPlugin()), "section-editing"],
]);

/** The factory's name for the two keyless plugins the order is about, else the plugin key's name. */
function pluginName(plugin: Plugin): string {
  return (
    REFERENCE.get(signature(plugin)) ??
    String(Reflect.get(plugin, "key")).replace(new RegExp("\\$\\d*$"), "")
  );
}

/** The caret at `offset` into block `block` of the first section. */
function caretAt(view: EditorView, block: number, offset: number): void {
  let pos = 1;
  for (let i = 0; i < block; i++)
    pos += view.state.doc.child(0).child(i).nodeSize;
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, pos + 1 + offset),
    ),
  );
}

function selectAll(view: EditorView): void {
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
}

const paginationMetas = (transactions: readonly Transaction[]) =>
  transactions
    .filter((tr) => tr.getMeta(paginationKey) !== undefined)
    .map((tr) => ({
      paper: tr.getMeta(paginationKey).profile.paper,
      scenesNumbered:
        tr.getMeta(paginationKey).profile.furniture.scenesNumbered,
      addToHistory: tr.getMeta("addToHistory"),
      docChanged: tr.docChanged,
    }));

test("the editor's keys come before the section editing's", () => {
  const { e } = editor();
  const names = e.view.state.plugins.map(pluginName);
  expect(names.indexOf("element-keys")).toBeGreaterThan(-1);
  expect(names.indexOf("element-keys")).toBeLessThan(
    names.indexOf("section-editing"),
  );
  expect(names.slice(0, 2)).toEqual(["binding-a", "binding-b"]);
  expect(names.slice(-2)).toEqual(["extra-a", "extra-b"]);
});

test("every document-changing dispatch is inside the guard, and nothing else is", () => {
  const { e, fakes } = editor();
  fakes.updates.length = 0;
  for (const character of "abc")
    e.view.dispatch(e.view.state.tr.insertText(character));
  caretAt(e.view, 1, 1);
  expect([fakes.guard.log, fakes.updates]).toEqual([
    ["enter", "leave", "enter", "leave", "enter", "leave"],
    [1, 1, 1, 0],
  ]);
});

test("changing the paper repaginates without reconfiguring a plugin", () => {
  const { e, fakes } = editor();
  const plugins = e.view.state.plugins;
  fakes.transactions.length = 0;
  fakes.script.set("script.paper", "a4");
  expect([
    paginationMetas(fakes.transactions),
    e.view.state.plugins === plugins,
    paginationKey.getState(e.view.state)!.settings.profile.paper,
  ]).toEqual([
    [
      {
        paper: "a4",
        scenesNumbered: false,
        addToHistory: false,
        docChanged: false,
      },
    ],
    true,
    "a4",
  ]);
});

test("spelling follows the preference", () => {
  const { e, fakes } = editor();
  fakes.personal.set("writing.checkSpelling", false);
  const off = e.view.dom.getAttribute("spellcheck");
  fakes.personal.set("writing.checkSpelling", true);
  expect([off, e.view.dom.getAttribute("spellcheck")]).toEqual([
    "false",
    "true",
  ]);
});

const inkDoc = (): Node =>
  schema.node("doc", null, [
    schema.node("section", null, [
      schema.node(
        "block",
        { id: bid(0), type: "ink_line" },
        schema.text("Once upon a time"),
      ),
    ]),
  ]);

test("an Ink script has no pages and still flows", () => {
  const { e, fakes } = editor({
    doc: inkDoc(),
    script: { "script.format": "ink" },
  });
  caretAt(e.view, 0, "Once upon a time".length);
  e.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  fakes.frames.fire();
  const blocks: string[] = [];
  e.view.state.doc.child(0).forEach((block) => blocks.push(block.attrs.type));
  expect([
    fakes.place.querySelector(".mn-sheet"),
    e.scaffold,
    e.pagination(),
    e.zoomPercent(),
    blocks,
    fakes.facts[0]!.page,
    fakes.facts[0]!.pageCount,
  ]).toEqual([null, null, null, null, ["ink_line", "ink_line"], null, null]);
});

/** A key press of `character`, with the character code the test DOM leaves out. The view types it itself only over a selection that is not text. */
function keypress(character: string): Event {
  const event = new KeyboardEvent("keypress", {
    key: character,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "charCode", {
    value: character.charCodeAt(0),
  });
  return event;
}

/** A paste of `text` as the browser sends it. */
function pasteEvent(text: string): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  const data = new DataTransfer();
  data.setData("text/plain", text);
  Object.defineProperty(event, "clipboardData", { value: data });
  return event;
}

function dropEvent(text: string): Event {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  const data = new DataTransfer();
  data.setData("text/plain", text);
  Object.defineProperty(event, "dataTransfer", { value: data });
  return event;
}

test("a read-only page takes no keys but undo, shows no caret and can still be focused and read", () => {
  const { e } = editor({ editable: false });
  const before = e.view.state.doc;
  selectAll(e.view);
  e.view.dom.dispatchEvent(keypress("x"));
  e.view.dom.dispatchEvent(pasteEvent("Pasted."));
  e.view.dom.dispatchEvent(dropEvent("Dropped."));
  const dom = e.view.dom;
  expect([
    e.view.state.doc.eq(before),
    dom.getAttribute("contenteditable"),
    dom.getAttribute("tabindex"),
    dom.getAttribute("role"),
    dom.getAttribute("aria-multiline"),
    dom.getAttribute("aria-readonly"),
  ]).toEqual([true, "false", "0", "textbox", "true", "true"]);
});

test("an editable page takes typed and pasted text", () => {
  const { e } = editor();
  selectAll(e.view);
  e.view.dom.dispatchEvent(keypress("x"));
  e.view.dom.dispatchEvent(pasteEvent("Pasted."));
  expect([
    e.view.state.doc.child(0).child(0).textContent,
    e.view.dom.getAttribute("contenteditable"),
    e.view.dom.getAttribute("aria-readonly"),
  ]).toEqual(["xPasted.", "true", null]);
});

test("a feature plugin can number the scenes before and after the view exists", () => {
  let host: EditorPluginHost | null = null;
  const { e, fakes } = editor({
    host: (given) => {
      host = given;
      given.setScenesNumbered(true);
    },
  });
  const first = paginationKey.getState(e.view.state)!.settings.profile.furniture
    .scenesNumbered;
  fakes.transactions.length = 0;
  host!.setScenesNumbered(false);
  fakes.script.set("script.paper", "a4");
  expect([first, paginationMetas(fakes.transactions)]).toEqual([
    true,
    [
      {
        paper: "letter",
        scenesNumbered: false,
        addToHistory: false,
        docChanged: false,
      },
      {
        paper: "a4",
        scenesNumbered: false,
        addToHistory: false,
        docChanged: false,
      },
    ],
  ]);
});

test("zoom scales the page around the caret's line and changes no break", () => {
  const { e, fakes } = editor();
  const applied: number[] = [];
  let scale = 1;
  e.scaffold!.applyZoom = (percent) => {
    applied.push(percent);
    scale = percent / 100;
  };
  // the caret's line sits 300 px into the page at 100 %
  const caretTop = () => 300 * scale - fakes.place.scrollTop;
  e.view.coordsAtPos = () => ({
    top: caretTop(),
    bottom: caretTop() + 16,
    left: 0,
    right: 0,
  });
  caretAt(e.view, 0, 1);
  const pages = e.pagination();
  fakes.transactions.length = 0;
  e.setZoom(150);
  const after150 = [caretTop(), e.zoomPercent()];
  e.setZoom("fit_width");
  fakes.desk.resize(2000);
  e.setZoom(500);
  expect([
    applied,
    after150,
    Math.round(caretTop()),
    e.pagination() === pages,
    fakes.transactions.length,
  ]).toEqual([[150, 113, 227, 300], [300, 150], 300, true, 0]);
});

/** posAtCoords reads layout, which the test DOM has none of: every point is in the first block. */
function topAtFirstBlock(e: ScriptEditor): void {
  e.view.posAtCoords = () => ({ pos: 3, inside: -1 });
}

test("the place survives a destroy and a new editor", () => {
  const doc = docOf([Array.from({ length: 40 }, (_, i) => `Line ${i}.`)]);
  const first = editor({ doc });
  topAtFirstBlock(first.e);
  caretAt(first.e.view, 30, 4);
  const place = first.e.place()!;
  first.e.destroy();
  const second = editor({ doc });
  topAtFirstBlock(second.e);
  second.e.restore(place);
  const { $head } = second.e.view.state.selection;
  expect([place.head, $head.parent.attrs.id, $head.parentOffset]).toEqual([
    { blockId: bid(30), offset: 4 },
    bid(30),
    4,
  ]);
});

test("destroying leaves nothing behind", () => {
  const { e, fakes } = editor({ zoom: "fit_width" });
  e.view.dispatch(e.view.state.tr.insertText("x"));
  e.destroy();
  expect([
    fakes.place.childNodes.length,
    fakes.frames.pending(),
    fakes.timers.pending(),
    fakes.published.at(-1),
    fakes.personal.listening() + fakes.script.listening(),
    fakes.desk.listeners.size,
    e.view.isDestroyed,
  ]).toEqual([0, 0, 0, null, 0, 0, true]);
});
