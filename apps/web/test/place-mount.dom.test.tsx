import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { parseDoc } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import type { KeyValueMap } from "@manent/settings";
import { createEditorControl } from "../src/editor-host/control.ts";
import { createEditorMount } from "../src/editor-host/editor-mount.ts";
import { createLocalSessions } from "../src/editor-host/editor-sessions.ts";
import type { EditorSessions } from "../src/editor-host/editor-sessions.ts";
import { liveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { createPlaceStore } from "../src/editor-host/place.ts";
import type { PersonServices } from "../src/services/ports.ts";
import { createClock, testServices } from "./services.fixtures.ts";

withDom();

const DOC = "8f0d1c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const noop = (): void => {};
type EditorView = LiveEditor["view"];

let disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) dispose();
  Reflect.deleteProperty(document, "visibilityState");
  document.body.replaceChildren();
});

// fonts that never load and timers that never fire: the page is drawn in the fallback face
const PORTS = {
  fonts: { add: noop },
  makeFace: () => ({ load: () => new Promise<never>(noop) }),
  wait: () => new Promise<never>(noop),
  defer: (run: () => void) => run(),
  whenIdle: noop,
  userAgent: "test",
};

const id = (n: number): string => `block-${String(n).padStart(4, "0")}`;

/** 130 lines of action in two sections of the size a section holds at most. */
const LONG: DocJSON = {
  type: "doc",
  content: [0, 100].map((first) => ({
    type: "section",
    content: Array.from({ length: first === 0 ? 100 : 30 }, (_, i) => ({
      type: "block",
      attrs: { id: id(first + i + 1), type: "action" },
      content: [{ type: "text", text: `Line ${first + i + 1}` }],
    })),
  })),
};

/** A map in memory that records the key of every write. */
function recordingMap(): KeyValueMap & { writes: string[] } {
  const values = new Map<string, unknown>();
  const writes: string[] = [];
  return {
    writes,
    get: (key) => values.get(key),
    set(key, value) {
      writes.push(key);
      values.set(key, value);
    },
    keys: () => [...values.keys()],
    subscribe: () => noop,
  };
}

/** Sessions whose one document outlives each mount, as a document kept on the device does. */
function keptSessions(): EditorSessions {
  const local = createLocalSessions({
    frames: { request: () => noop },
    clock: createClock(),
    ids: () => id(1),
  });
  return {
    open: (docId, format) => ({ ...local.open(docId, format), close: noop }),
  };
}

/** Mounts DOC in a new element for `services`; returns the disposer. */
function mountFor(services: PersonServices, sessions: EditorSessions) {
  const clock = createClock();
  const mount = createEditorMount({
    sessions,
    services: () => services,
    control: createEditorControl(),
    keys: { resolve: () => null, run: () => false },
    ports: PORTS,
    frames: { request: () => noop },
    timers: clock,
    platform: "mac",
    ids: () => id(999),
    random: () => "r",
  });
  const dispose = mount.mount({
    element: document.body.appendChild(document.createElement("div")),
    docId: DOC,
    facts: { publish: noop },
    outline: { publish: noop, publishCurrent: noop },
    settings: services.openScriptStore(DOC),
    guard: { enter: noop, leave: noop },
  });
  disposers.push(dispose);
  return () => {
    disposers = disposers.filter((d) => d !== dispose);
    dispose();
  };
}

function openView(): EditorView {
  const live = liveEditor(DOC);
  if (live === null) throw new TypeError("no editor is open");
  // the test DOM lays nothing out: the first block is put at the top of the view, where a place is read from
  live.view.posAtCoords = () => ({ pos: 2, inside: -1 });
  return live.view;
}

/** Puts the caret `offset` characters into block `blockId` as a click does: the selection, then the browser's selectionchange. */
function putCaret(view: EditorView, blockId: string, offset: number): void {
  const block = view.dom.querySelector(`[data-id="${blockId}"]`);
  const text = block?.firstChild;
  if (text === null || text === undefined)
    throw new TypeError(`no text in block ${blockId}`);
  view.focus();
  document.getSelection()?.collapse(text, offset);
  document.dispatchEvent(new Event("selectionchange"));
}

const hide = (): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
};

const placeWrites = (map: { writes: string[] }): string[] =>
  map.writes.filter((key) => key.startsWith("doc:"));

test("the mount saves the place when it leaves and when the tab is hidden, never while typing", () => {
  const map = recordingMap();
  const base = testServices({ userId: "leo" });
  const services = { ...base, place: createPlaceStore({ map, now: () => 0 }) };
  const dispose = mountFor(services, keptSessions());
  const view = openView();
  for (let key = 0; key < 40; key++)
    view.dispatch(view.state.tr.insertText("a"));
  const typing = placeWrites(map);
  hide();
  const hidden = placeWrites(map);
  dispose();
  expect([typing, hidden, placeWrites(map)]).toEqual([
    [],
    [`doc:${DOC}`],
    [`doc:${DOC}`, `doc:${DOC}`],
  ]);
});

test("opening a script again puts the caret and the top line where they were", () => {
  const base = testServices({ userId: "leo" });
  const services = {
    ...base,
    place: createPlaceStore({ map: recordingMap(), now: () => 0 }),
  };
  const sessions = keptSessions();
  const dispose = mountFor(services, sessions);
  const first = openView();
  first.dispatch(
    first.state.tr
      .replaceWith(0, first.state.doc.content.size, parseDoc(LONG).content)
      .setMeta("addToHistory", false),
  );
  putCaret(first, id(120), 3);
  dispose();
  mountFor(services, sessions);
  const { $head } = openView().state.selection;
  expect([
    services.place.place(DOC)?.top,
    $head.parent.attrs.id,
    $head.parentOffset,
  ]).toEqual([{ blockId: id(1), offsetPx: 0 }, id(120), 3]);
});
