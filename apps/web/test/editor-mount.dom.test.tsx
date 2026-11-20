import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { loadDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { FormatId } from "@manent/schema";
import { SettingsProvider, createValue } from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createEditorControl } from "../src/editor-host/control.ts";
import type { EditorControl } from "../src/editor-host/control.ts";
import { createEditorMount } from "../src/editor-host/editor-mount.ts";
import { createLocalSessions } from "../src/editor-host/editor-sessions.ts";
import type {
  EditorSession,
  EditorSessions,
} from "../src/editor-host/editor-sessions.ts";
import { editorWords } from "../src/editor-host/editor-words.ts";
import { createLazyMount } from "../src/editor-host/lazy-mount.ts";
import { liveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import type { EditorMount } from "../src/editor-host/mount.ts";
import { EDITOR_PLUGINS } from "../src/editor-host/plugins.ts";
import type { EditorPluginContext } from "../src/editor-host/plugins.ts";
import { ElementButton } from "../src/screens/document/element-button.tsx";
import { DevicePane } from "../src/screens/preferences/device-pane.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import type { EditorFacts } from "../src/state/facts.store.ts";
import { createGuard } from "../src/state/guard.ts";
import {
  createClock,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const DOC = "8f0d1c2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const noop = (): void => {};
type Factory = (typeof EDITOR_PLUGINS)[number];
type EditorView = LiveEditor["view"];
// the registration list is read-only to the app; a test fills it to stand in for a feature
const plugins = EDITOR_PLUGINS as Factory[];

let disposers: (() => void)[] = [];
let root: Root | null = null;
afterEach(() => {
  for (const dispose of disposers.splice(0).toReversed()) dispose();
  act(() => root?.unmount());
  root = null;
  plugins.splice(0);
  document.body.replaceChildren();
});

/** Frames that pass only when fired. */
function createFrames(): { request(fn: () => void): () => void; fire(): void } {
  let queued: (() => void)[] = [];
  return {
    request(fn) {
      queued.push(fn);
      return () => {
        queued = queued.filter((f) => f !== fn);
      };
    },
    fire() {
      const due = queued;
      queued = [];
      for (const fn of due) fn();
    },
  };
}

// fonts that never load and timers that never fire: the page is drawn in the fallback face
const PORTS = {
  fonts: { add: noop },
  makeFace: () => ({ load: () => new Promise<never>(noop) }),
  wait: () => new Promise<never>(noop),
  defer: (run: () => void) => run(),
  whenIdle: noop,
  userAgent: "test",
};

interface Rig {
  readonly element: HTMLElement;
  readonly services: PersonServices;
  readonly status: ReturnType<typeof createValue<StatusFacts>>;
  readonly facts: Partial<EditorFacts>[];
  readonly frames: ReturnType<typeof createFrames>;
  readonly clock: ReturnType<typeof createClock>;
  readonly control: EditorControl;
  /** Each editor built, in order. */
  readonly attached: number[];
  readonly withdrawn: number[];
  view(): EditorView;
  dispose(): void;
}

/** One mount of DOC in a new element, over the test services with their status and Undo withdrawals watched. */
function rig(
  options: {
    access?: StatusFacts["access"];
    sessions?: (frames: ReturnType<typeof createFrames>) => EditorSessions;
  } = {},
): Rig {
  const frames = createFrames();
  const clock = createClock();
  const base = testServices({ userId: "leo" });
  const status = createValue<StatusFacts>({
    ...base.documents.open(DOC).status.get(),
    access: options.access ?? "edit",
  });
  base.documents.close(DOC);
  const withdrawn: number[] = [];
  const services: PersonServices = {
    ...base,
    documents: {
      open: (docId) => ({ ...base.documents.open(docId), status }),
      close: (docId) => base.documents.close(docId),
    },
    messages: {
      ...base.messages,
      withdrawUndo() {
        withdrawn.push(1);
        base.messages.withdrawUndo();
      },
    },
  };
  const attached: number[] = [];
  const inner = createEditorControl();
  const control: EditorControl = {
    attach(editor) {
      attached.push(attached.length);
      return inner.attach(editor);
    },
    run: (action) => inner.run(action),
  };
  let ids = 0;
  const nextId = () => `block-${String(++ids).padStart(4, "0")}`;
  const mount = createEditorMount({
    sessions:
      options.sessions?.(frames) ??
      createLocalSessions({ frames, clock, ids: nextId }),
    services: () => services,
    control,
    keys: { resolve: () => null, run: () => false },
    ports: PORTS,
    frames,
    timers: clock,
    platform: "mac",
    ids: nextId,
    random: () => "r",
  });
  const element = document.body.appendChild(document.createElement("div"));
  const facts: Partial<EditorFacts>[] = [];
  const dispose = mount.mount({
    element,
    docId: DOC,
    facts: { publish: (changed) => facts.push(changed) },
    outline: { publish: noop },
    settings: services.openScriptStore(DOC),
    guard: { enter: noop, leave: noop },
  });
  let disposed = false;
  const once = () => {
    if (disposed) return;
    disposed = true;
    dispose();
  };
  disposers.push(once);
  const view = (): EditorView => {
    const live = liveEditor(DOC);
    if (live === null) throw new TypeError("no editor is open");
    return live.view;
  };
  return {
    element,
    services,
    status,
    facts,
    frames,
    clock,
    control,
    attached,
    withdrawn,
    view,
    dispose: once,
  };
}

/** The caret's block id and offset in it. */
function caretOf(view: EditorView): { blockId: unknown; offset: number } {
  const $head = view.state.selection.$head;
  return { blockId: $head.parent.attrs.id, offset: $head.parentOffset };
}

const typeInto = (view: EditorView, text: string): void =>
  view.dispatch(view.state.tr.insertText(text));

/** The test DOM lays nothing out: the first block is put at the top of the view, where a place is read from. */
function topAtFirstBlock(view: EditorView): void {
  view.posAtCoords = () => ({ pos: 2, inside: -1 });
}

test("the mount puts an editable page in the host and publishes its first facts", () => {
  const r = rig();
  r.frames.fire();
  const published = Object.assign({}, ...r.facts);
  expect([
    r.element.querySelector(".mn-page-view") !== null,
    r.view().dom.getAttribute("contenteditable"),
    published.element,
    published.page,
    published.pageCount,
    published.blockId,
  ]).toEqual([true, "true", "Scene Heading", "1", 1, "block-0001"]);
});

test("a command reaches the open page", () => {
  const r = rig();
  const result = r.control.run({ kind: "element", slot: "3" });
  expect([
    result,
    r.view().state.doc.firstChild?.firstChild?.attrs.type,
  ]).toEqual([{ ok: true }, "character"]);
});

test("a change of mine takes Undo out of the message that offered it", () => {
  const r = rig();
  r.services.messages.push({
    id: "m1",
    text: "Scene deleted.",
    actions: [{ label: "Undo", commandId: "edit.undo" }],
    lifetime: "reverse",
    ownWork: false,
  });
  typeInto(r.view(), "I");
  expect([r.withdrawn.length, r.services.messages.current()?.actions]).toEqual([
    1,
    [],
  ]);
});

test("someone who cannot edit gets a read-only page, and gains the caret when they can", () => {
  const r = rig({ access: "comment" });
  const before = r.view();
  topAtFirstBlock(before);
  typeInto(before, "INT. HOUSE");
  const readOnly = [
    before.dom.getAttribute("contenteditable"),
    before.dom.getAttribute("aria-readonly"),
  ];
  r.status.set({ ...r.status.get(), access: "edit" });
  const after = r.view();
  expect([
    readOnly,
    r.attached.length,
    after.dom.getAttribute("contenteditable"),
    after.dom.getAttribute("aria-readonly"),
    caretOf(after),
  ]).toEqual([
    ["false", "true"],
    2,
    "true",
    null,
    { blockId: "block-0001", offset: 10 },
  ]);
});

test("changing the format to Ink rebuilds once; the disposer leaves the host empty", () => {
  const r = rig();
  const paged = r.element.querySelector(".mn-sheet") !== null;
  r.services.openScriptStore(DOC).set("script.format", "ink");
  const ink = [r.attached.length, r.element.querySelector(".mn-sheet")];
  r.dispose();
  expect([paged, ink, r.element.childNodes.length, liveEditor(DOC)]).toEqual([
    true,
    [2, null],
    0,
    null,
  ]);
});

/** Local sessions whose open document can be replaced by a copy of itself under a new client id. */
function replaceable(): {
  sessions: (frames: ReturnType<typeof createFrames>) => EditorSessions;
  replace(): void;
  docs(): CrdtDoc[];
} {
  const docs: CrdtDoc[] = [];
  const listeners = new Set<() => void>();
  return {
    sessions: (frames) => ({
      open(docId, format: FormatId): EditorSession {
        const local = createLocalSessions({
          frames,
          clock: createClock(),
          ids: () => "block-0001",
        }).open(docId, format);
        docs.push(local.doc());
        return {
          ...local,
          doc: () => docs.at(-1) ?? local.doc(),
          onReplaced(listener) {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        };
      },
    }),
    replace() {
      const last = docs.at(-1);
      if (last === undefined) throw new TypeError("no session is open");
      docs.push(loadDoc(last.encodeState()));
      for (const listener of listeners) listener();
    },
    docs: () => docs,
  };
}

const contentOf = (doc: CrdtDoc): string =>
  JSON.stringify(scriptBody(doc).materialize());

test("a replaced document rebuilds at the same place, after the composition ends", () => {
  const replacing = replaceable();
  const r = rig({ sessions: replacing.sessions });
  const old = r.view();
  topAtFirstBlock(old);
  typeInto(old, "INT.");
  const caret = caretOf(old);
  old.dom.dispatchEvent(new CompositionEvent("compositionstart"));
  replacing.replace();
  const [first, second] = replacing.docs();
  if (first === undefined || second === undefined)
    throw new TypeError("the document was not replaced");
  const contents = [contentOf(first), contentOf(second)];
  old.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  const waiting = [
    r.attached.length,
    old.editable,
    [contentOf(first), contentOf(second)],
  ];
  old.dom.dispatchEvent(new CompositionEvent("compositionend"));
  r.clock.advance(50);
  const rebuilt = r.view();
  expect([
    waiting,
    r.attached.length,
    rebuilt === old,
    caretOf(rebuilt),
  ]).toEqual([[1, false, contents], 2, false, caret]);
});

test("the live editor and the feature plugins come with the mount", () => {
  // the one plugin with no key and no state, its attributes a fixed object, taken from a read-only page, stands in for a feature's
  const lender = rig({ access: "comment" });
  const plugin = lender
    .view()
    .state.plugins.find((p) => typeof p.props.attributes === "object");
  lender.dispose();
  if (plugin === undefined) throw new TypeError("no plugin to lend");
  const contexts: EditorPluginContext[] = [];
  plugins.push((context) => {
    contexts.push(context);
    return plugin;
  });
  const r = rig();
  const view = r.view();
  const [context] = contexts;
  const live = liveEditor(DOC)?.view;
  r.dispose();
  expect([
    contexts.length,
    Object.keys(context ?? {}).toSorted(),
    context?.docId,
    context?.services === r.services,
    view.state.plugins.at(-1) === plugin,
    live === view,
    liveEditor(DOC),
  ]).toEqual([
    1,
    ["docId", "facts", "layer", "services", "setScenesNumbered", "zoom"],
    DOC,
    true,
    true,
    true,
    null,
  ]);
});

const host = (): HTMLElement =>
  document.body.appendChild(document.createElement("div"));

test("the placeholder stands in until the editor has loaded, and a mount gone first leaves its host empty", async () => {
  let loaded: (mount: EditorMount) => void = noop;
  const loading = new Promise<EditorMount>((resolve) => {
    loaded = resolve;
  });
  const drawn: HTMLElement[] = [];
  const editor: EditorMount = {
    mount({ element }) {
      drawn.push(element);
      const page = element.appendChild(document.createElement("article"));
      return () => page.remove();
    },
  };
  const lazy = createLazyMount(() => loading);
  const ports = (element: HTMLElement) => ({
    element,
    docId: DOC,
    facts: { publish: noop },
    outline: { publish: noop },
    settings: { get: () => null, subscribe: () => noop },
    guard: { enter: noop, leave: noop },
  });
  const [kept, left] = [host(), host()];
  const disposeKept = lazy.mount(ports(kept));
  lazy.mount(ports(left))();
  const waiting = [
    kept.querySelector("[data-placeholder]") !== null,
    left.childNodes.length,
  ];
  loaded(editor);
  await loading;
  await Promise.resolve();
  const later = host();
  lazy.mount(ports(later));
  const shown = [
    kept.querySelector("[data-placeholder]"),
    kept.querySelectorAll("article").length,
    left.childNodes.length,
    later.querySelectorAll("article").length,
  ];
  disposeKept();
  expect([waiting, shown, drawn, kept.childNodes.length]).toEqual([
    [true, 0],
    [null, 1, 0, 1],
    [kept, later],
    0,
  ]);
});

test("the element's words follow the format and the project", () => {
  const film = editorWords("film");
  const podcast = editorWords("podcast");
  expect([
    film.element("screenplay", "scene_heading", null),
    film.element("stage_play", "action", null),
    podcast.element("variety", "slug", null),
    film.element("variety", "slug", null),
    film.element("screenplay", "act_break", "end_of_act"),
    film.element("screenplay", "made_up", null),
    film.placeholder("stage_play", "scene_heading", null),
    podcast.placeholder("variety", "bracket", null),
    film.placeholder("screenplay", "act_break", "teaser"),
    film.placeholder("game", "general", null),
    film.placeholder("screenplay", "general", null),
    film.placeholder("screenplay", "page_break", null),
    film.placeholder("game", "made_up", null),
  ]).toEqual([
    "Scene Heading",
    "Stage direction",
    "Segment",
    "Slug",
    "End of Act",
    "General",
    "Scene — its number and where it happens",
    "Cue — music, sound or a direction; T=0:30 sets its time",
    "Teaser — the scenes before Act One",
    "General — text, or * for a choice and - for a gather",
    "General — text with no layout of its own",
    null,
    "General — text, or * for a choice and - for a gather",
  ]);
});

/** Renders `node` into a new container under the services' providers. */
function render(node: React.ReactNode, services: PersonServices): HTMLElement {
  const container = document.body.appendChild(document.createElement("div"));
  const environment = testEnvironment();
  root = createRoot(container);
  act(() =>
    root?.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>{node}</SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );
  return container;
}

test("the Element button shows the element, is named by it and opens the picker", () => {
  const base = testServices({ userId: "leo" });
  const runs: [string, string][] = [];
  const services: PersonServices = {
    ...base,
    commands: {
      ...base.commands,
      run(id, from) {
        runs.push([id, from]);
        return "ran";
      },
    },
  };
  let frame = noop;
  const facts = createFactsStore({
    guard: createGuard({ flavour: "test" }),
    frame: (fn) => {
      frame = fn;
      return noop;
    },
  });
  facts.writer.publish({ element: "Dialogue" });
  frame();
  const container = render(
    <FactsContext value={facts.selectors}>
      <ElementButton />
    </FactsContext>,
    services,
  );
  const button = container.querySelector("button");
  const shown = [button?.textContent, button?.getAttribute("aria-label")];
  act(() => button?.click());
  facts.writer.publish({ element: null });
  act(() => frame());
  expect([shown, runs, container.innerHTML]).toEqual([
    ["Dialogue▾", "Element: Dialogue"],
    [["format.element", "control"]],
    "",
  ]);
});

test("Preferences shows the layout engine", () => {
  Reflect.set(window, "matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
  }));
  const container = render(
    <DevicePane deviceName={null} persisted />,
    testServices({ userId: "leo" }),
  );
  const about = [...container.querySelectorAll("section")].find(
    (section) => section.querySelector("h3")?.textContent === "About",
  );
  const lines = [...(about?.querySelectorAll("p") ?? [])]
    .slice(0, 2)
    .map((p) => p.textContent);
  expect(lines).toEqual(["Manent 0.0.0", "Layout engine 1"]);
});
