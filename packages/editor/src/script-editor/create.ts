// One script editor over one place: the binding, the keys, the popovers, the pages, the scroll rules and the bridge.
import { profileFromSettings, readLayoutSettings } from "@manent/pagination";
import type { Engine, PageProfile, Pagination } from "@manent/pagination";
import { mark } from "@manent/perf";
import { FORMATS, FORMAT_ELEMENTS } from "@manent/schema";
import type { FormatId, IdSource } from "@manent/schema";
import { Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { runAction } from "../actions/run-action.ts";
import type { ActionContext } from "../actions/run-action.ts";
import type { ActionResult, EditorAction } from "../actions/action-types.ts";
import { bridgePlugin } from "../bridge/bridge-plugin.ts";
import { completePlugin } from "../complete/complete-plugin.ts";
import { CURSOR_CSS } from "../cursors/cursor-css.ts";
import { cursorsPlugin } from "../cursors/cursor-plugin.ts";
import { plainTextElement, slotElement } from "../elements/slots.ts";
import { clipboardPlugin } from "../identity/clipboard.ts";
import { idRegistryPlugin } from "../identity/id-registry.ts";
import { commandKeymap } from "../keys/command-keymap.ts";
import { detectPlugin } from "../keys/detect.ts";
import { elementKeysPlugin, nextElementFor } from "../keys/element-keys.ts";
import type { ElementContext } from "../keys/element-keys.ts";
import { historyKeysPlugin } from "../keys/history-keys.ts";
import type { PageScaffold } from "../page/scaffold.ts";
import { mountPageView } from "../pagination/page-view.ts";
import type { PageViewPorts } from "../pagination/page-view.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { openPicker, pickerPlugin } from "../picker/picker-plugin.ts";
import { PLACEHOLDER_CSS, placeholderPlugin } from "../picker/placeholder.ts";
import { restorePlace, savedPlaceOf } from "../scroll/saved-place.ts";
import { scrollPlugin } from "../scroll/stability.ts";
import type { ScrollPorts } from "../scroll/stability.ts";
import { createPageControls, createScrollPorts } from "./page-controls.ts";
import type { Desk, PageControls } from "./page-controls.ts";
import { mountPlainView } from "./plain-view.ts";
import type {
  DispatchGuardPort,
  EditorBinding,
  EditorWords,
  FactsSink,
  Frames,
  OutlineSink,
  SavedPlace,
  SettingsReader,
  Timers,
} from "./ports.ts";
import { isSpellingChecked } from "./spelling.ts";
import type { ZoomSetting } from "./zoom.ts";

/** What a feature plugin may ask of the editor it runs in; given before the view exists. `zoom` is the factor (1 at 100 %). */
export interface EditorPluginHost {
  layer(): HTMLElement | null;
  zoom(): number;
  setScenesNumbered(on: boolean): void;
}

export interface ScriptEditor {
  readonly view: EditorView;
  /** Null without pages (Ink). */
  readonly scaffold: PageScaffold | null;
  run(action: EditorAction): ActionResult;
  pagination(): Pagination | null;
  /** Where the person is now; null when the selection or the top of the view is not in a block. */
  place(): SavedPlace | null;
  restore(place: SavedPlace): void;
  setZoom(zoom: ZoomSetting): void;
  /** Null without pages (Ink). */
  zoomPercent(): number | null;
  destroy(): void;
}

export interface ScriptEditorOptions {
  place: HTMLElement;
  binding: EditorBinding;
  editable: boolean;
  personal: SettingsReader;
  script: SettingsReader;
  layoutEngine: Engine;
  facts: FactsSink;
  outline: OutlineSink;
  guard: DispatchGuardPort;
  words: EditorWords;
  frames: Frames;
  timers: Timers;
  ports: PageViewPorts;
  platform: "mac" | "windows" | "linux";
  ids: IdSource;
  random: () => string;
  /** The undo stack gained a step. */
  onUndoStep(): void;
  keys: {
    resolve: (event: KeyboardEvent) => string | null;
    run(id: string): boolean;
  };
  /** The zoom to open at. */
  zoom: ZoomSetting;
  desk: Desk;
  /** The feature plugins, placed after every other. */
  extraPlugins(host: EditorPluginHost): readonly Plugin[];
}

/** The script settings the page profile is made from. */
const LAYOUT_KEYS: readonly string[] = Object.freeze([
  "script.format",
  "script.paper",
  "script.moresAtBreaks",
  "script.sameSpeakerContd",
  "script.sceneContinued",
]);

const READ_ONLY_ATTRIBUTES: Readonly<Record<string, string>> = Object.freeze({
  tabindex: "0",
  role: "textbox",
  "aria-multiline": "true",
  "aria-readonly": "true",
});

/** The layer is the popovers' frame: they are placed in its coordinates. */
const LAYER_CSS = ".mn-layer { position: relative; }";

/** An unknown format lays out as a screenplay, as the engine does. */
const formatOf = (format: string): FormatId =>
  FORMATS.find((known) => known === format) ?? "screenplay";

/** A transaction that changes the document is applied inside the guard and timed. */
function guardedDispatch(
  guard: DispatchGuardPort,
): (view: EditorView, tr: Transaction) => void {
  return (view, tr) => {
    if (!tr.docChanged) {
      view.updateState(view.state.apply(tr));
      return;
    }
    guard.enter();
    try {
      mark("editor.dispatch", () => view.updateState(view.state.apply(tr)));
    } finally {
      guard.leave();
    }
  };
}

/** The plugins before the typesetting ones, and those after them. */
function editorPlugins(
  options: ScriptEditorOptions,
  parts: {
    layer: HTMLElement;
    format(): FormatId;
    context: ElementContext;
    ports: ScrollPorts;
    paged: boolean;
    extra: readonly Plugin[];
  },
): { before: Plugin[]; after: Plugin[] } {
  const { binding, words, frames, timers, ids, personal } = options;
  const { layer, format, context } = parts;
  const before = [
    ...binding.plugins,
    pickerPlugin({ format, words, layer, frames }),
    completePlugin({ layer, frames, timers }),
    commandKeymap(options.keys),
    historyKeysPlugin({ history: binding.history, platform: options.platform }),
    elementKeysPlugin(context),
    detectPlugin(context),
    clipboardPlugin({
      ids,
      random: options.random,
      isUndoRedo: binding.isUndoRedo,
      plainElement: () => plainTextElement(format()),
      formatElements: () => FORMAT_ELEMENTS[format()],
    }),
    ...(options.editable
      ? []
      : [new Plugin({ props: { attributes: READ_ONLY_ATTRIBUTES } })]),
  ];
  const after = [
    // the registry counts from the pagination plugin's block index
    ...(parts.paged
      ? [idRegistryPlugin({ ids, isRemote: binding.isRemote })]
      : []),
    placeholderPlugin({ format, words }),
    cursorsPlugin({ presence: binding.presence, frames, timers }),
    scrollPlugin({
      ...parts.ports,
      isRemote: binding.isRemote,
      typewriter: () => personal.get("writing.typewriterScrolling") === true,
    }),
    bridgePlugin({
      facts: options.facts,
      outline: options.outline,
      history: binding.history,
      words,
      format,
      frames,
      timers,
    }),
    ...parts.extra,
  ];
  return { before, after };
}

/** `div.mn-layer`, which holds the popovers and the styles of the placeholders and the remote cursors. */
function createLayer(doc: Document): HTMLElement {
  const layer = doc.createElement("div");
  layer.className = "mn-layer";
  const style = doc.createElement("style");
  style.textContent = [LAYER_CSS, PLACEHOLDER_CSS, CURSOR_CSS].join("\n");
  layer.append(style);
  return layer;
}

function elementContext(
  options: ScriptEditorOptions,
  format: () => FormatId,
): ElementContext {
  return {
    format,
    prefs: () => ({
      enterAfterDialogue:
        options.personal.get("writing.enterAfterDialogue") === "character"
          ? "character"
          : "action",
    }),
    history: options.binding.history,
    ids: options.ids,
    openPicker,
  };
}

/** The view in `place`: in the page's frame when there is a profile, else a plain view. */
function mountEditor(
  options: ScriptEditorOptions,
  parts: {
    profile: PageProfile | null;
    context: ElementContext;
    plugins: { before: Plugin[]; after: Plugin[] };
    ports: ScrollPorts;
  },
): { view: EditorView; scaffold: PageScaffold | null; destroy(): void } {
  const { binding, editable, personal } = options;
  const shared = {
    place: options.place,
    doc: binding.doc,
    before: parts.plugins.before,
    plugins: parts.plugins.after,
    ids: options.ids,
    nextElement: nextElementFor(parts.context),
    dispatchTransaction: guardedDispatch(options.guard),
    editable: () => editable,
    spelling: () => isSpellingChecked(personal),
  };
  if (parts.profile === null)
    return { ...mountPlainView(shared), scaffold: null };
  return mountPageView({
    ...shared,
    profile: parts.profile,
    layoutEngine: options.layoutEngine,
    ports: options.ports,
    offFontNote: options.words.offFontNote,
    isRemote: binding.isRemote,
    scroller: parts.ports.scroller,
  });
}

/** What the actions read of this editor: the element keys' context, the page's column and whether it is editable. */
function actionContext(
  context: ElementContext,
  view: EditorView,
  editable: boolean,
): ActionContext {
  return {
    ...context,
    slotElement,
    editable: () => editable,
    columnCells: () =>
      paginationKey.getState(view.state)?.settings.profile.columnCells ?? null,
  };
}

/** The settings the editor follows, and the undo steps; returns each unsubscribe. */
function subscribe(
  options: ScriptEditorOptions,
  view: EditorView,
  relayout: () => void,
): (() => void)[] {
  return [
    ...LAYOUT_KEYS.map((key) => options.script.subscribe(key, relayout)),
    options.personal.subscribe("writing.checkSpelling", () =>
      view.dispatch(view.state.tr.setMeta("addToHistory", false)),
    ),
    options.binding.history.onStep(options.onUndoStep),
  ];
}

/**
 * Builds the editor in `place`: the page's frame, the view and its plugins, and `div.mn-layer` for the popovers after
 * them. Without a page profile (Ink) it is a plain view with no pages. Plugins are never reconfigured: a setting
 * reaches them as a transaction that is never an undo step, or is read when it is needed.
 */
export function createScriptEditor(options: ScriptEditorOptions): ScriptEditor {
  const { place, binding, editable, script, desk, zoom } = options;
  let layout = readLayoutSettings((key) => script.get(key));
  let scenesNumbered = false;
  let pages: PageControls | null = null;
  const format = (): FormatId => formatOf(layout.format);
  const profile = (): PageProfile | null =>
    profileFromSettings(options.layoutEngine, { ...layout, scenesNumbered });
  const factor = (): number => (pages?.percent ?? 100) / 100;
  const layer = createLayer(place.ownerDocument);
  const ports = createScrollPorts(place, factor);
  const extra = options.extraPlugins({
    layer: () => (layer.parentNode === null ? null : layer),
    zoom: factor,
    setScenesNumbered(on) {
      scenesNumbered = on;
      pages?.repage();
    },
  });
  const first = profile();
  const context = elementContext(options, format);
  const plugins = editorPlugins(options, {
    layer,
    format,
    context,
    ports,
    extra,
    paged: first !== null,
  });
  const mounted = mountEditor(options, {
    profile: first,
    context,
    plugins,
    ports,
  });
  const { view, scaffold } = mounted;
  place.append(layer);
  if (scaffold !== null)
    pages = createPageControls({ view, scaffold, ports, desk, zoom, profile });
  const actions = actionContext(context, view, editable);
  const subscriptions = subscribe(options, view, () => {
    layout = readLayoutSettings((key) => script.get(key));
    pages?.repage();
  });
  return {
    view,
    scaffold,
    run: (action) => runAction(view, action, actions),
    pagination: () => paginationKey.getState(view.state)?.pagination ?? null,
    place: () => savedPlaceOf(view, ports),
    restore: (saved) => restorePlace(view, ports, saved),
    setZoom: (setting) => pages?.setZoom(setting),
    zoomPercent: () => pages?.percent ?? null,
    destroy() {
      for (const unsubscribe of subscriptions) unsubscribe();
      pages?.destroy();
      mounted.destroy();
      layer.remove();
      binding.presence.publish(null);
    },
  };
}
