// One script editor over one place: the binding, the keys, the popovers, the pages, the scroll rules and the bridge.
import {
  LAYOUT_SETTING_KEYS,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import type {
  Engine,
  FrontPage,
  PageProfile,
  Pagination,
} from "@manent/pagination";
import { FORMATS } from "@manent/schema";
import type { FormatId, IdSource } from "@manent/schema";
import type { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { runAction } from "../actions/run-action.ts";
import type { ActionContext, ActionResult } from "../actions/action-types.ts";
import type { EditorAction } from "../actions/registry.ts";
import { CURSOR_CSS } from "../cursors/cursor-css.ts";
import { slotElement } from "../elements/slots.ts";
import { loadFrontPages } from "../front-pages/load.ts";
import type { FrontPagesHandle } from "../front-pages/load.ts";
import type { ElementContext } from "../keys/element-keys.ts";
import type { LayoutView } from "../page/config.ts";
import type { PageScaffold } from "../page/scaffold.ts";
import type { PageViewPorts } from "../pagination/page-view.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { openPicker } from "../picker/picker-plugin.ts";
import { PLACEHOLDER_CSS } from "../picker/placeholder.ts";
import { restorePlace, savedPlaceOf } from "../scroll/saved-place.ts";
import type { ScrollPorts } from "../scroll/stability.ts";
import { editorPlugins } from "./editor-plugins.ts";
import { mountEditor } from "./mount-view.ts";
import {
  createPageControls,
  createScrollPorts,
  pageAtHeight,
} from "./page-controls.ts";
import type { Desk, PageControls } from "./page-controls.ts";
import type {
  DispatchGuardPort,
  EditorBinding,
  EditorWords,
  FactsSink,
  Frames,
  OutlineSink,
  PastedTextPort,
  SavedPlace,
  SettingsReader,
  Timers,
  TitlePageSource,
} from "./ports.ts";
import type { ZoomSetting } from "./zoom.ts";

/** What a feature plugin may ask of the editor it runs in; given before the view exists. `zoom` is the factor (1 at 100 %). */
export interface EditorPluginHost {
  layer(): HTMLElement | null;
  zoom(): number;
  setScenesNumbered(on: boolean): void;
  readonly frames: Frames;
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
  /** Scrolls to the title page and puts the caret in its title; nothing without front pages. */
  showTitlePage(): void;
  /** The pages before page 1 as print and PDF draw them; null without pages or a title page. */
  frontPages(): FrontPage[] | null;
  /** The label of the page before page 1 at viewport height `top`, px; null anywhere else. */
  frontPageAt(top: number): string | null;
  /** The index of the page at viewport height `top`, px; null without pages or where there is no script. */
  pageAt(top: number): number | null;
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
  /** Reads pasted text from outside Manent as elements. */
  pastedText: PastedTextPort;
  /** The undo stack gained a step. */
  onUndoStep(): void;
  /** The script's title, which names the page; `subscribe` calls back on each change and returns unsubscribe. */
  title: { get(): string; subscribe(listener: () => void): () => void };
  keys: {
    resolve: (event: KeyboardEvent) => string | null;
    run(id: string): boolean;
  };
  /** The zoom to open at. */
  zoom: ZoomSetting;
  /** Null: no front pages are drawn (a static binding). */
  titlePage: TitlePageSource | null;
  /** The view of the pages to build; a script without pages (Ink) has neither. */
  view: LayoutView;
  desk: Desk;
  /** The feature plugins, placed after every other. */
  extraPlugins(host: EditorPluginHost): readonly Plugin[];
  /** The host's names, which autocomplete offers beside the script's; none when absent. */
  projectNames?: readonly string[];
}

/** The layer is the popovers' frame: they are placed in its coordinates. */
const LAYER_CSS = ".mn-layer { position: relative; }";

/** An unknown format lays out as a screenplay, as the engine does. */
const formatOf = (format: string): FormatId =>
  FORMATS.find((known) => known === format) ?? "screenplay";

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

// how far below the view's top a block gone to sits, px at 100 %, so its first line is clear of the bars
const GO_TO_MARGIN_PX = 48;

/** What the actions read of this editor: the element keys' context, the page's column and whether it is editable. */
function actionContext(
  context: ElementContext,
  view: EditorView,
  parts: { editable: boolean; ports: ScrollPorts },
): ActionContext {
  return {
    ...context,
    slotElement,
    editable: () => parts.editable,
    goTo(blockId, offset) {
      const at = { blockId, offset };
      restorePlace(view, parts.ports, {
        anchor: at,
        head: at,
        top: { blockId, offsetPx: -GO_TO_MARGIN_PX },
      });
      view.focus();
    },
    columnCells: () =>
      paginationKey.getState(view.state)?.settings.profile.columnCells ?? null,
  };
}

/** The pages before page 1, loaded apart; none without pages or a title page. */
function frontPagesOf(
  options: ScriptEditorOptions,
  view: EditorView,
  scaffold: PageScaffold | null,
  parts: { profile(): PageProfile | null; ports: ScrollPorts },
): FrontPagesHandle | null {
  const { titlePage, binding } = options;
  if (scaffold === null || titlePage === null) return null;
  return loadFrontPages({
    scaffold,
    titlePage,
    profile: parts.profile,
    editable: options.editable,
    view: options.view,
    scroller: parts.ports.scroller,
    keys: {
      platform: options.platform,
      history: (redo) =>
        binding.history[redo ? "redo" : "undo"](view.state, view.dispatch),
    },
  });
}

/** The settings and the title the editor follows, and the undo steps; returns each unsubscribe. */
function subscribe(
  options: ScriptEditorOptions,
  view: EditorView,
  relayout: () => void,
): (() => void)[] {
  // a transaction of no content, so the page's attributes are read again
  const reread = (): void =>
    view.dispatch(view.state.tr.setMeta("addToHistory", false));
  return [
    ...LAYOUT_SETTING_KEYS.map((key) =>
      options.script.subscribe(key, relayout),
    ),
    options.personal.subscribe("writing.checkSpelling", reread),
    options.title.subscribe(reread),
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
    frames: options.frames,
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
    pages = createPageControls({
      view,
      scaffold,
      ports,
      desk,
      zoom,
      layoutView: options.view,
      profile,
    });
  const front = frontPagesOf(options, view, scaffold, { profile, ports });
  const actions = actionContext(context, view, { editable, ports });
  const subscriptions = subscribe(options, view, () => {
    layout = readLayoutSettings((key) => script.get(key));
    pages?.repage();
    front?.relayout();
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
    showTitlePage: () => front?.show(),
    frontPages: () => front?.printed() ?? null,
    frontPageAt: (top) => front?.labelAt(top) ?? null,
    pageAt: (top) => pageAtHeight(view, top),
    destroy() {
      for (const unsubscribe of subscriptions) unsubscribe();
      front?.destroy();
      pages?.destroy();
      mounted.destroy();
      layer.remove();
      binding.presence.publish(null);
    },
  };
}
