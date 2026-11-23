// The page's editor: one session per open document and one script editor over it, built again in place when what it may show changes.
import type { UndoRoot } from "@manent/crdt";
import { bindDocument } from "@manent/crdt-binding";
import type { BoundDocument } from "@manent/crdt-binding";
import {
  ELEMENT_SLOTS,
  STRUCTURAL_KEYS,
  createScriptEditor,
  outlineOf,
  staticBinding,
} from "@manent/editor";
import type {
  EditorBinding,
  SavedPlace,
  ScriptEditor,
  Timers,
  TitlePageSource,
} from "@manent/editor";
import { markEnd } from "@manent/perf";
import { parseDoc } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import type { FixedKey } from "../services/ports.ts";
import { layoutViewActions } from "../state/layout-view.store.ts";
import { panelsActions } from "../state/panels.store.ts";
import { actionOf } from "./command-actions.ts";
import type { EditorControl } from "./control.ts";
import { deskOf } from "./desk.ts";
import { editorOptions } from "./editor-options.ts";
import type { EditorSources, OpenedScript } from "./editor-options.ts";
import type { EditorSession, EditorSessions } from "./editor-sessions.ts";
import { editorWords } from "./editor-words.ts";
import { registerLiveEditor } from "./live-editor.ts";
import type { EditorMount } from "./mount.ts";
import { followZoom } from "./page-zoom.ts";
import { keepPlace } from "./keep-place.ts";
import { placeholderMount } from "./placeholder-mount.ts";
import { takeFocus } from "./take-focus.ts";
import { titlePageSource } from "./title-page-port.ts";
import { countSteps } from "./undo-depth.ts";

// page-frame.ts loads apart from the editor: importing this selector from it would push the editor's first load
// over its size budget
const PAGE_REGION = "[data-region='page']";

/** What one person's undo takes back. */
export const UNDO_ROOTS: readonly UndoRoot[] = [
  "script",
  "revisedOverrides",
  "titlePage",
  "notes",
  "alternates",
  "cuts",
  "sceneProgress",
];

/** The structural keys as "flow", then the picker's keys as "picker". */
export const EDITOR_FIXED_KEYS: readonly FixedKey[] = Object.freeze([
  ...STRUCTURAL_KEYS.map((chord) => ({ chord, reason: "flow" as const })),
  ...ELEMENT_SLOTS.map((chord) => ({ chord, reason: "picker" as const })),
]);

/** A content change of read-only content rebuilds at most this often. */
const READ_ONLY_REBUILD_MS = 250;

/** A script that opens with this many scenes opens the left panel at Scenes, until the person chooses otherwise. */
const SCENES_AT_OPEN = 3;

/** Whether the editor's script has enough scenes to open the left panel at Scenes; false without pages (Ink). */
function hasScenesToShow(editor: ScriptEditor): boolean {
  const p = editor.pagination();
  if (p === null) return false;
  const scenes = outlineOf(p, 0).entries.filter((e) => e.kind === "scene");
  return scenes.length >= SCENES_AT_OPEN;
}

/** The editor a mount has open, for the test build's hooks; `undoDepth` counts the steps the person can undo. */
export interface OpenEditor {
  readonly docId: string;
  readonly editor: ScriptEditor;
  undoDepth(): number;
}

interface MountOptions extends EditorSources {
  sessions: EditorSessions;
  control: EditorControl;
  /** Told of each editor the mount opens, and null once it has none; only the test build listens. */
  observe?: (open: OpenEditor | null) => void;
}

type MountPorts = Parameters<EditorMount["mount"]>[0];

/** What decides how the editor is built: a change of any of these builds it again. */
interface Shown {
  ink: boolean;
  edit: boolean;
  readOnly: boolean;
  reflow: boolean;
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
  titlePage: null,
  destroy: noop,
});

/** The binding the editor gets, whether it may edit, and the title page it may show: read-only content and newer content are shown, never bound. */
function bindingFor(
  session: EditorSession,
  document: BoundDocument,
  options: { timers: Timers; edit: boolean },
): {
  binding: EditorBinding;
  editable: boolean;
  titlePage: TitlePageSource | null;
  destroy(): void;
} {
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
    titlePage: titlePageSource(document.doc()),
    destroy: bound.destroy,
  };
}

/** What one build of the document's editor is made from. */
interface Opened extends OpenedScript {
  session: EditorSession;
  document: BoundDocument;
  shown: Shown;
}

/** Attaches `built.editor` to the control and registers it as its document's live editor; returns the stop of both. */
function connectEditor(
  options: MountOptions,
  open: Opened,
  built: { editor: ScriptEditor; binding: EditorBinding; editable: boolean },
): () => void {
  const { editor } = built;
  const detach = options.control.attach({
    run: (request) => editor.run(actionOf(request)),
    zoomPercent: () => editor.zoomPercent(),
    showTitlePage: () => editor.showTitlePage(),
  });
  const unregister = registerLiveEditor({
    docId: open.ports.docId,
    doc: open.document.doc(),
    view: editor.view,
    scaffold: editor.scaffold,
    presence: built.binding.presence,
    editable: built.editable,
    zoom: () => (editor.zoomPercent() ?? 100) / 100,
    frontPages: () => editor.frontPages(),
  });
  return () => {
    detach();
    unregister();
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
  const { editable, titlePage } = bound;
  const editor = createScriptEditor(
    editorOptions(options, open, { binding, editable, titlePage }),
  );
  const region = element.closest<HTMLElement>(PAGE_REGION);
  if (place !== null) editor.restore(place);
  // the first zoom holds the caret's line where it lay at 100 %, which would open a page scrolled past the desk above it
  else region?.scrollTo({ top: 0 });
  const stopFocus = takeFocus(editor, element);
  const stopZoom = followZoom({ ...options, editor, element });
  let stopThumb = noop;
  let built = true;
  // loaded apart: it shows only once the person scrolls
  if (editor.scaffold !== null && region !== null)
    void import("./thumb-label.ts").then(({ followThumb }) => {
      if (!built) return;
      stopThumb = followThumb({
        editor,
        scroller: region,
        host: element,
        docId,
        timers: options.timers,
      });
    });
  const disconnect = connectEditor(options, open, {
    editor,
    binding,
    editable,
  });
  options.observe?.({ docId, editor, undoDepth: () => counted?.depth() ?? 0 });
  return {
    editor,
    shown: open.shown,
    destroy() {
      built = false;
      stopFocus();
      stopZoom();
      stopThumb();
      disconnect();
      editor.destroy();
      bound.destroy();
      counted?.stop();
    },
  };
}

const differs = (a: Shown, b: Shown): boolean =>
  a.ink !== b.ink ||
  a.edit !== b.edit ||
  a.readOnly !== b.readOnly ||
  a.reflow !== b.reflow;

/**
 * Opens the document's session and editor, and builds the editor again at the person's place when the format changes to
 * or from Ink, when the access crosses "edit", when read-only content comes or goes (or changes, at most once per 250 ms),
 * when the person changes between Page view and Reflow view, and when the document is replaced: then the old page takes
 * no more input at once, and an input method composing is let finish first. Returns the disposer.
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
    reflow: layoutViewActions.get() === "reflow",
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
  // token 0 is navigation start, the origin of performance.now(); a rebuild records nothing
  markEnd("open.editable", 0);
  // the document a session holds may arrive with a rebuild, so each build of this opening may be the one with scenes
  let scenesShown = false;
  const showScenes = (): void => {
    if (scenesShown || !hasScenesToShow(built.editor)) return;
    scenesShown = true;
    panelsActions.openScenesUnchosen();
  };
  showScenes();
  const kept = keepPlace(person.place, docId, () => built.editor);
  let pending = noop;
  const rebuild = (): void => {
    pending();
    pending = noop;
    const place = kept.save();
    built.destroy();
    built = buildEditor(options, { ...opened, shown: shownNow() }, place);
    showScenes();
  };
  const follow = (): void => {
    if (differs(shownNow(), built.shown)) rebuild();
  };
  const stops = [
    script.subscribe("script.format", follow),
    status.subscribe(follow),
    layoutViewActions.subscribe(follow),
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
