import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { loadDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON, FormatId } from "@manent/schema";
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
import { timingEditorPlugin } from "../src/editor-host/timing.ts";
import { timingFactsOf } from "../src/timing/timing-facts.ts";
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
import { until } from "./sync.fixtures.ts";

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
    bare?: boolean;
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
    run: (id) => inner.run(id),
    zoomPercent: () => inner.zoomPercent(),
    showTitlePage: () => inner.showTitlePage(),
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
    outline: { publish: noop, publishCurrent: noop },
    settings: services.openScriptStore(DOC),
    guard: { enter: noop, leave: noop },
    bare: options.bare,
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
  const result = r.control.run("element.character");
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
  const paged = r.element.querySelector(".mn-pages") !== null;
  r.services.openScriptStore(DOC).set("script.format", "ink");
  const ink = [r.attached.length, r.element.querySelector(".mn-pages")];
  r.dispose();
  expect([paged, ink, r.element.childNodes.length, liveEditor(DOC)]).toEqual([
    true,
    [2, null],
    0,
    null,
  ]);
});

/** Local sessions whose document is kept only once `kept` says so, counting the sessions closed. */
function keptLater(): {
  sessions: (frames: ReturnType<typeof createFrames>) => EditorSessions;
  kept: ReturnType<typeof createValue<boolean>>;
  closed(): number;
} {
  const kept = createValue(false);
  let closed = 0;
  return {
    sessions: (frames) => ({
      open(docId, format: FormatId): EditorSession {
        const local = createLocalSessions({
          frames,
          clock: createClock(),
          ids: () => "block-0001",
        }).open(docId, format);
        return {
          ...local,
          kept,
          close() {
            closed++;
            local.close();
          },
        };
      },
    }),
    kept,
    closed: () => closed,
  };
}

test("a page stands as the placeholder until its document is kept on this device, and only then takes keys", () => {
  const later = keptLater();
  const r = rig({ sessions: later.sessions });
  const drawn = () => [
    r.element.querySelector(".mn-sheet[data-placeholder]") !== null,
    liveEditor(DOC)?.view.dom.getAttribute("contenteditable") ?? null,
    r.attached.length,
  ];
  const waiting = drawn();
  later.kept.set(true);
  expect([waiting, drawn()]).toEqual([
    [true, null, 0],
    [false, "true", 1],
  ]);
});

test("a page gone before its document is kept leaves its host empty and its session closed", () => {
  const later = keptLater();
  const r = rig({ sessions: later.sessions });
  r.dispose();
  later.kept.set(true);
  expect([
    r.element.childNodes.length,
    liveEditor(DOC),
    later.closed(),
  ]).toEqual([0, null, 1]);
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
  // a whole heading: after "INT." alone, Enter would take a completion and split nothing
  typeInto(old, "INT. HALL");
  const caret = caretOf(old);
  old.dom.dispatchEvent(new CompositionEvent("compositionstart"));
  replacing.replace();
  const [first, second] = replacing.docs();
  if (first === undefined || second === undefined)
    throw new TypeError("the document was not replaced");
  const contents = [contentOf(first), contentOf(second)];
  old.dom.dispatchEvent(new CompositionEvent("compositionend"));
  old.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  const waiting = [
    r.attached.length,
    old.editable,
    [contentOf(first), contentOf(second)],
  ];
  r.clock.advance(50);
  const rebuilt = r.view();
  expect([
    waiting,
    r.attached.length,
    rebuilt === old,
    caretOf(rebuilt),
  ]).toEqual([[1, false, contents], 2, false, caret]);
});

test("a mount gone between the composition's release and the rebuild builds no editor", () => {
  const replacing = replaceable();
  const r = rig({ sessions: replacing.sessions });
  const old = r.view();
  old.dom.dispatchEvent(new CompositionEvent("compositionstart"));
  replacing.replace();
  old.dom.dispatchEvent(new CompositionEvent("compositionend"));
  // due with the release and queued after it, so it runs before the rebuild the release schedules
  r.clock.schedule(r.dispose, 50);
  r.clock.advance(50);
  expect([
    r.attached.length,
    liveEditor(DOC),
    r.element.childNodes.length,
  ]).toEqual([1, null, 0]);
});

test("the live editor and the feature plugins come with the mount", () => {
  // the one plugin with attributes and no state, the page's own, taken from a read-only page, stands in for a feature's
  const lender = rig({ access: "comment" });
  const plugin = lender
    .view()
    .state.plugins.find(
      (p) => p.props.attributes !== undefined && p.spec.state === undefined,
    );
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
    [
      "docId",
      "facts",
      "frames",
      "layer",
      "presence",
      "services",
      "setScenesNumbered",
      "zoom",
    ],
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
    outline: { publish: noop, publishCurrent: noop },
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

test("lazy mount hands off its live placeholder element to editor mount without remounting", async () => {
  const later = keptLater();
  const base = testServices({ userId: "leo" });
  const clock = createClock();
  const frames = createFrames();
  const realMount = createEditorMount({
    sessions: later.sessions(frames),
    services: () => base,
    control: createEditorControl(),
    keys: { resolve: () => null, run: () => false },
    ports: PORTS,
    frames,
    timers: clock,
    platform: "mac",
    ids: () => "block-0001",
    random: () => "r",
  });
  let resolveMount: (mount: EditorMount) => void = noop;
  const loading = new Promise<EditorMount>((resolve) => {
    resolveMount = resolve;
  });
  const lazy = createLazyMount(() => loading);
  const el = host();
  const dispose = lazy.mount({
    element: el,
    docId: DOC,
    facts: { publish: noop },
    outline: { publish: noop, publishCurrent: noop },
    settings: base.openScriptStore(DOC),
    guard: { enter: noop, leave: noop },
  });
  const before = el.querySelector(".mn-sheet[data-placeholder]");
  resolveMount(realMount);
  await loading;
  await Promise.resolve();
  await Promise.resolve();
  const after = el.querySelector(".mn-sheet[data-placeholder]");
  later.kept.set(true);
  const onceKept = [
    el.querySelector(".mn-sheet[data-placeholder]") === null,
    liveEditor(DOC) !== null,
  ];
  dispose();
  expect([before !== null, before === after, onceKept]).toEqual([
    true,
    true,
    [true, true],
  ]);
});

test("a person's page draws the editor their environment loads, built for that person", async () => {
  const built: string[] = [];
  const editor: EditorMount = {
    mount({ element }) {
      const page = element.appendChild(document.createElement("article"));
      return () => page.remove();
    },
  };
  const services = testServices({
    userId: "leo",
    environment: testEnvironment({
      async loadEditor(_environment, parts) {
        await Promise.resolve();
        built.push(parts.services().userId);
        return { mount: editor, besideMount: () => editor };
      },
    }),
  });
  const element = host();
  const dispose = services.mount.mount({
    element,
    docId: DOC,
    facts: { publish: noop },
    outline: { publish: noop, publishCurrent: noop },
    settings: { get: () => null, subscribe: () => noop },
    guard: { enter: noop, leave: noop },
  });
  const waiting = element.querySelector("[data-placeholder]") !== null;
  // the editor is built once the person's private index has opened
  await until(() => element.querySelector("article") !== null);
  const shown = [
    element.querySelector("[data-placeholder]"),
    element.querySelectorAll("article").length,
  ];
  dispose();
  services.dispose();
  expect([waiting, shown, built]).toEqual([true, [null, 1], ["leo"]]);
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
      <ElementButton docId="doc" />
    </FactsContext>,
    services,
  );
  const button = container.querySelector("button");
  const shown = [button?.textContent, button?.getAttribute("aria-label")];
  act(() => button?.click());
  facts.writer.publish({ element: null });
  act(() => frame());
  expect([shown, runs, container.innerHTML]).toEqual([
    ["Dialogue", "Element: Dialogue"],
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
  expect(lines).toEqual(["Manent — demo", "Layout engine 1"]);
});

test("bare mode starts read-only with no presence publishing and mn-front-field reacts to editable changes", async () => {
  const published: unknown[] = [];
  const r = rig({
    access: "edit",
    bare: true,
    sessions: (frames) => {
      const inner = createLocalSessions({
        frames,
        clock: createClock(),
        ids: () => "b1",
      });
      return {
        open(docId, format) {
          const s = inner.open(docId, format);
          return {
            ...s,
            sendAwareness(update) {
              published.push(update);
              s.sendAwareness(update);
            },
          };
        },
      };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect([r.view().editable, liveEditor(DOC)?.editable]).toEqual([
    false,
    false,
  ]);
  liveEditor(DOC)?.presence.publish({
    anchor: { blockId: "b1", offset: 0 },
    head: { blockId: "b1", offset: 0 },
    at: 0,
  });
  expect(published).toEqual([]);
  const bareFields = [
    ...r.element.querySelectorAll<HTMLElement>(".mn-front-field"),
  ];
  expect(bareFields.length).toBeGreaterThan(0);
  for (const field of bareFields) {
    expect([
      field.getAttribute("contenteditable"),
      field.getAttribute("aria-readonly"),
    ]).toEqual([null, "true"]);
  }
  r.dispose();

  const editable = rig({ access: "edit" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const titleField = editable.element.querySelector<HTMLElement>(
    '.mn-front-field[data-field="title"]',
  )!;
  expect([
    titleField.getAttribute("contenteditable"),
    titleField.getAttribute("aria-readonly"),
  ]).toEqual(["plaintext-only", null]);
  liveEditor(DOC)?.setEditable?.(false);
  expect([
    editable.view().editable,
    titleField.getAttribute("contenteditable"),
    titleField.getAttribute("aria-readonly"),
  ]).toEqual([false, null, "true"]);
  liveEditor(DOC)?.setEditable?.(true);
  expect([
    editable.view().editable,
    titleField.getAttribute("contenteditable"),
    titleField.getAttribute("aria-readonly"),
  ]).toEqual([true, "plaintext-only", null]);
});

test("a queued read-only rebuild before document replacement does not cancel an active composition hold", async () => {
  const docs: CrdtDoc[] = [];
  const listeners = new Set<() => void>();
  const readOnly = createValue<DocJSON | null>(null);
  const r = rig({
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
          readOnly,
          onReplaced(listener) {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          },
        };
      },
    }),
  });
  const old = r.view();
  old.dom.dispatchEvent(new CompositionEvent("compositionstart"));
  // readOnly queues a microtask rebuild; same-turn onReplaced starts a composition hold
  readOnly.set(scriptBody(docs[0]!).materialize());
  docs.push(loadDoc(docs[0]!.encodeState()));
  for (const listener of listeners) listener();
  // flush microtasks while still composing: editor must NOT rebuild yet
  await Promise.resolve();
  await Promise.resolve();
  const duringComposition = r.attached.length;
  old.dom.dispatchEvent(new CompositionEvent("compositionend"));
  r.clock.advance(50);
  expect([duringComposition, r.attached.length]).toEqual([1, 2]);
});

test("switching script format to and from variety enables and disables timing without reconfiguring plugins", () => {
  plugins.push(timingEditorPlugin);
  const r = rig();
  const view = r.view();
  const pluginsBefore = view.state.plugins;
  r.frames.fire();
  const initialFacts = timingFactsOf(DOC).get();

  r.services.openScriptStore(DOC).set("script.format", "variety");
  r.frames.fire();
  const varietyFacts = timingFactsOf(DOC).get();
  const pluginsInVariety = r.view().state.plugins;

  r.services.openScriptStore(DOC).set("script.format", "screenplay");
  r.frames.fire();
  const screenplayFacts = timingFactsOf(DOC).get();
  const pluginsAfter = r.view().state.plugins;

  expect([
    initialFacts,
    varietyFacts !== null,
    screenplayFacts,
    pluginsBefore === pluginsInVariety,
    pluginsInVariety === pluginsAfter,
    r.attached.length,
  ]).toEqual([null, true, null, true, true, 1]);
});
