// The page's editor: one session per open document and one script editor over it, built again in place when what it may show changes.
import type { UndoRoot } from "@manent/crdt";
import { bindDocument } from "@manent/crdt-binding";
import type { BoundDocument } from "@manent/crdt-binding";
import {
  DRIFT,
  ELEMENT_SLOTS,
  STRUCTURAL_KEYS,
  createScriptEditor,
  staticBinding,
} from "@manent/editor";
import type {
  EditorBinding,
  Frames,
  PageViewPorts,
  SavedPlace,
  ScriptEditor,
  ScriptEditorOptions,
  Timers,
} from "@manent/editor";
import { ENGINE_VERSION, engineFor } from "@manent/pagination";
import { parseDoc } from "@manent/schema";
import type { FormatId, IdSource } from "@manent/schema";
import type { Platform } from "@manent/settings";
import type { KeyResolver } from "@manent/ui";
import type { FixedKey, PersonServices } from "../services/ports.ts";
import { zoomActions } from "../state/zoom.store.ts";
import { actionOf } from "./command-actions.ts";
import type { EditorControl } from "./control.ts";
import { deskOf } from "./desk.ts";
import type { EditorSession, EditorSessions } from "./editor-sessions.ts";
import { editorWords } from "./editor-words.ts";
import { registerLiveEditor } from "./live-editor.ts";
import type { EditorMount } from "./mount.ts";
import { followZoom } from "./page-zoom.ts";
import { keepPlace } from "./keep-place.ts";
import { placeholderMount } from "./placeholder-mount.ts";
import { EDITOR_PLUGINS } from "./plugins.ts";
import { countSteps } from "./undo-depth.ts";

/** What one person's undo takes back. */
export const UNDO_ROOTS: readonly UndoRoot[] = ["script"];

/** The structural keys as "flow", then the picker's keys as "picker". */
export const EDITOR_FIXED_KEYS: readonly FixedKey[] = Object.freeze([
  ...STRUCTURAL_KEYS.map((chord) => ({ chord, reason: "flow" as const })),
  ...ELEMENT_SLOTS.map((chord) => ({ chord, reason: "picker" as const })),
]);

/** The pages' ports in this browser, whose engine `userAgent` names; the fonts are read when the editor first draws a page. */
export function browserPagePorts(userAgent: string): PageViewPorts {
  return {
    get fonts() {
      return document.fonts;
    },
    makeFace: (d) =>
      new FontFace(d.family, `url(${d.source}) format("woff2")`, {
        weight: d.weight,
        style: d.style,
        unicodeRange: d.unicodeRange,
        display: d.display,
      }),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    defer: (run) => queueMicrotask(run),
    // a timer where the browser has no idle callback
    whenIdle: (run) => {
      if ("requestIdleCallback" in window) requestIdleCallback(() => run());
      else setTimeout(run, DRIFT.idleMs);
    },
    userAgent,
  };
}

/** A content change of read-only content rebuilds at most this often. */
const READ_ONLY_REBUILD_MS = 250;

/** The editor a mount has open, for the test build's hooks; `undoDepth` counts the steps the person can undo. */
export interface OpenEditor {
  readonly docId: string;
  readonly editor: ScriptEditor;
  undoDepth(): number;
}

interface MountOptions {
  sessions: EditorSessions;
  services: () => PersonServices;
  control: EditorControl;
  keys: { resolve: KeyResolver; run(id: string): boolean };
  ports: PageViewPorts;
  frames: Frames;
  timers: Timers;
  platform: Platform;
  ids: IdSource;
  random: () => string;
  /** Told of each editor the mount opens, and null once it has none; only the test build listens. */
  observe?: (open: OpenEditor | null) => void;
}

type MountPorts = Parameters<EditorMount["mount"]>[0];

/** What decides how the editor is built: a change of any of these builds it again. */
interface Shown {
  ink: boolean;
  edit: boolean;
  readOnly: boolean;
}

interface Built {
  editor: ScriptEditor;
  shown: Shown;
  destroy(): void;
}

const noop = (): void => {};

/** The session as the binding sees it, counting the binding's holds; `whenReleased` runs once none is left, after the release returns, unless cancelled first. */
function trackHolds(
  session: EditorSession,
  timers: Timers,
): { document: BoundDocument; whenReleased(run: () => void): () => void } {
  let holds = 0;
  let waiting: (() => void) | null = null;
  let cancel = noop;
  return {
    document: {
      doc: () => session.doc(),
      holdRemote() {
        holds++;
        session.holdRemote();
      },
      releaseRemote() {
        holds--;
        session.releaseRemote();
        const run = waiting;
        if (holds > 0 || run === null) return;
        waiting = null;
        // the release may come from inside the view's update, which must finish first
        cancel = timers.schedule(() => {
          cancel = noop;
          run();
        }, 0);
      },
      sendAwareness: (update) => session.sendAwareness(update),
      onAwareness: (listener) => session.onAwareness(listener),
    },
    whenReleased(run) {
      if (holds === 0) {
        run();
        return noop;
      }
      waiting = run;
      return () => {
        waiting = null;
        cancel();
      };
    },
  };
}

const shownOnly = (binding: EditorBinding) => ({
  binding,
  editable: false,
  destroy: noop,
});

/** The binding the editor gets, and whether it may edit: read-only content and newer content are shown, never bound. */
function bindingFor(
  session: EditorSession,
  document: BoundDocument,
  options: { timers: Timers; edit: boolean },
): { binding: EditorBinding; editable: boolean; destroy(): void } {
  const content = session.readOnly.get();
  if (content !== null) return shownOnly(staticBinding(parseDoc(content)));
  const bound = bindDocument({
    document,
    timers: options.timers,
    undoRoots: UNDO_ROOTS,
  });
  if (!bound.ok) return shownOnly(staticBinding(bound.doc));
  return {
    binding: bound.binding,
    editable: options.edit,
    destroy: bound.destroy,
  };
}

/** What one build of the document's editor is made from. */
interface Opened {
  ports: MountPorts;
  session: EditorSession;
  document: BoundDocument;
  script: ScriptEditorOptions["script"];
  words: ScriptEditorOptions["words"];
  desk: ScriptEditorOptions["desk"];
  shown: Shown;
}

/** The script editor's options for one build over `bound`'s binding, at the person's zoom. */
function editorOptions(
  options: MountOptions,
  open: Opened,
  bound: { binding: EditorBinding; editable: boolean },
): ScriptEditorOptions {
  const { element, docId, facts, outline, settings, guard } = open.ports;
  const { services } = options;
  return {
    place: element,
    binding: bound.binding,
    editable: bound.editable,
    personal: settings,
    script: open.script,
    // every script is laid out by the first engine until a script stores its own
    layoutEngine: engineFor(ENGINE_VERSION)!,
    facts,
    outline,
    guard,
    words: open.words,
    frames: options.frames,
    timers: options.timers,
    ports: options.ports,
    platform: options.platform,
    ids: options.ids,
    random: options.random,
    onUndoStep: () => services().messages.withdrawUndo(),
    keys: options.keys,
    zoom: zoomActions.get(),
    desk: open.desk,
    extraPlugins: (host) =>
      EDITOR_PLUGINS.map((make) =>
        make({ ...host, docId, services: services(), facts }),
      ),
  };
}

/** One editor of the document over its session, at `place` when it is given, attached to the control and registered as live. */
function buildEditor(
  options: MountOptions,
  open: Opened,
  place: SavedPlace | null,
): Built {
  const { docId, element } = open.ports;
  const bound = bindingFor(open.session, open.document, {
    timers: options.timers,
    edit: open.shown.edit,
  });
  const counted =
    options.observe === undefined ? null : countSteps(bound.binding.history);
  const binding =
    counted === null
      ? bound.binding
      : { ...bound.binding, history: counted.history };
  const editor = createScriptEditor(
    editorOptions(options, open, { binding, editable: bound.editable }),
  );
  if (place !== null) editor.restore(place);
  const stopZoom = followZoom({ ...options, editor, element });
  const detach = options.control.attach({
    run: (request) => editor.run(actionOf(request)),
    zoomPercent: () => editor.zoomPercent(),
  });
  const unregister = registerLiveEditor({
    docId,
    view: editor.view,
    scaffold: editor.scaffold,
    presence: binding.presence,
    editable: bound.editable,
    zoom: () => (editor.zoomPercent() ?? 100) / 100,
  });
  options.observe?.({ docId, editor, undoDepth: () => counted?.depth() ?? 0 });
  return {
    editor,
    shown: open.shown,
    destroy() {
      stopZoom();
      detach();
      unregister();
      editor.destroy();
      bound.destroy();
      counted?.stop();
    },
  };
}

const differs = (a: Shown, b: Shown): boolean =>
  a.ink !== b.ink || a.edit !== b.edit || a.readOnly !== b.readOnly;

/**
 * Opens the document's session and editor, and builds the editor again at the person's place when the format changes to
 * or from Ink, when the access crosses "edit", when read-only content comes or goes (or changes, at most once per 250 ms),
 * and when the document is replaced: then the old page takes no more input at once, and an input method composing is let
 * finish first. Returns the disposer.
 */
function openDocument(
  options: MountOptions,
  ports: MountPorts,
  session: EditorSession,
): () => void {
  const { docId } = ports;
  const person = options.services();
  const script = person.openScriptStore(docId);
  const { status } = person.documents.open(docId);
  const format = (): FormatId => script.get("script.format");
  const holds = trackHolds(session, options.timers);
  const shownNow = (): Shown => ({
    ink: format() === "ink",
    edit: status.get().access === "edit",
    readOnly: session.readOnly.get() !== null,
  });
  const opened = {
    ports,
    session,
    document: holds.document,
    script,
    words: editorWords(person.library.documentKind(docId).get()),
    desk: deskOf(ports.element),
  };
  let built = buildEditor(options, { ...opened, shown: shownNow() }, null);
  const kept = keepPlace(person.place, docId, () => built.editor);
  let pending = noop;
  const rebuild = (): void => {
    pending();
    pending = noop;
    const place = kept.save();
    built.destroy();
    built = buildEditor(options, { ...opened, shown: shownNow() }, place);
  };
  const follow = (): void => {
    if (differs(shownNow(), built.shown)) rebuild();
  };
  const stops = [
    script.subscribe("script.format", follow),
    status.subscribe(follow),
    session.readOnly.subscribe((content) => {
      if (content === null || !built.shown.readOnly) follow();
      else if (pending === noop)
        pending = options.timers.schedule(rebuild, READ_ONLY_REBUILD_MS);
    }),
    session.onReplaced(() => {
      built.editor.view.setProps({ editable: () => false });
      pending();
      pending = holds.whenReleased(rebuild);
    }),
  ];
  return () => {
    pending();
    for (const stop of stops) stop();
    kept.stop();
    built.destroy();
    options.observe?.(null);
    session.close();
    person.documents.close(docId);
  };
}

/**
 * Draws the placeholder until the session's document is kept on this device, then opens its editor, so no keystroke
 * reaches a document that is never stored. Returns the disposer.
 */
function openWhenKept(options: MountOptions, ports: MountPorts): () => void {
  const { docId } = ports;
  const script = options.services().openScriptStore(docId);
  const session = options.sessions.open(docId, script.get("script.format"));
  if (session.kept.get()) return openDocument(options, ports, session);
  const placeholder = placeholderMount.mount(ports);
  let dispose = (): void => {
    placeholder();
    session.close();
  };
  const stop = session.kept.subscribe((kept) => {
    if (!kept) return;
    stop();
    placeholder();
    dispose = openDocument(options, ports, session);
  });
  return () => {
    stop();
    dispose();
  };
}

/** The mount of the page's editor; `services` is read at each mount, so the person's services are always the current ones. */
export function createEditorMount(options: MountOptions): EditorMount {
  return { mount: (ports) => openWhenKept(options, ports) };
}
