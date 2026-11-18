// The pagination plugin: the engine runs in the state's apply, on the blocks that changed, so pages never wait for the DOM.
import { ENGINE_VERSION, NO_LOCKS, engineFor } from "@manent/pagination";
import type {
  ChangeHint,
  Engine,
  LayoutPatches,
  LockTable,
  PageProfile,
  Pagination,
} from "@manent/pagination";
import { mark } from "@manent/perf";
import { selectAll } from "prosemirror-commands";
import { keydownHandler } from "prosemirror-keymap";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { DecorationSet, EditorView } from "prosemirror-view";
import { MID_BLOCK_BREAKS } from "../page/config.ts";
import type { BrowserEngine } from "../page/config.ts";
import { toIndex, updateIndex } from "./block-index.ts";
import type { BlockIndex } from "./block-index.ts";
import { caretPlace, scrollDelta } from "./caret.ts";
import type { CaretPlace } from "./caret.ts";
import { updateDecorations } from "./decorations.ts";
import type { DecorationOptions } from "./decorations.ts";
import type { IsRemote } from "./page-view.ts";

export interface PaginationSettings {
  /** Its `version` is the profile's `engineVersion`. */
  readonly engine: Engine;
  readonly profile: PageProfile;
  readonly locks: LockTable;
  /** The caller's patches (omitted scenes, derived scene numbers); null by default. */
  readonly layout: LayoutPatches | null;
}

export interface PaginationState {
  readonly settings: PaginationSettings;
  readonly index: BlockIndex;
  readonly pagination: Pagination;
  readonly decorations: DecorationSet;
  /** A composition is under way: the index and the pages are those from before it. */
  readonly frozen: boolean;
  /** Engine runs since the state was created. */
  readonly engineRuns: number;
}

export const paginationKey: PluginKey<PaginationState> = new PluginKey(
  "pagination",
);

export interface PaginationOptions {
  /** Default: the engine new scripts use. */
  readonly layoutEngine?: Engine;
  readonly profile: PageProfile;
  readonly locks?: LockTable;
  readonly layout?: LayoutPatches | null;
  readonly engine?: BrowserEngine;
  readonly isRemote?: IsRemote;
  /** Runs work after the current update, never inside it. */
  readonly defer: (run: () => void) => void;
  /** The title of text outside the script font. */
  readonly offFontNote: string;
  /** Default: the nearest ancestor of the editor that scrolls. */
  readonly scroller?: (view: EditorView) => Element;
  /** Called with the page count when the plugin's view starts and whenever the count changes. */
  readonly onPages?: (count: number) => void;
}

type SettingsPatch = Partial<PaginationSettings> & { repaginate?: true };

/** Throws RangeError when the profile was made by another engine than the one that would paginate it. */
function assertSameEngine(settings: PaginationSettings): void {
  const { engine, profile } = settings;
  if (profile.engineVersion !== engine.version)
    throw new RangeError(
      `a profile of engine ${profile.engineVersion} cannot be paginated by engine ${engine.version}`,
    );
}

function currentEngine(): Engine {
  const engine = engineFor(ENGINE_VERSION);
  if (engine === null)
    throw new RangeError(`this build carries no engine ${ENGINE_VERSION}`);
  return engine;
}

/** Changes the plugin's settings, or with `repaginate` alone brings the pages up to date after a composition. */
export function setPagination(
  tr: Transaction,
  patch: Partial<PaginationSettings> & { repaginate?: true },
): Transaction {
  return tr.setMeta(paginationKey, patch);
}

function patchOf(tr: Transaction): SettingsPatch | null {
  const patch: SettingsPatch | undefined = tr.getMeta(paginationKey);
  return patch ?? null;
}

function withPatch(
  settings: PaginationSettings,
  patch: SettingsPatch,
): PaginationSettings {
  const next: PaginationSettings = {
    engine: patch.engine ?? settings.engine,
    profile: patch.profile ?? settings.profile,
    locks: patch.locks ?? settings.locks,
    layout: patch.layout === undefined ? settings.layout : patch.layout,
  };
  assertSameEngine(next);
  return next;
}

// What makes every page start open to question again: another engine, another layout, locks, or other patches.
function needsFullRun(prev: PaginationState, patch: SettingsPatch): boolean {
  return (
    (patch.engine !== undefined && patch.engine !== prev.settings.engine) ||
    (patch.profile !== undefined &&
      patch.profile.key !== prev.settings.profile.key) ||
    patch.locks !== undefined ||
    (patch.layout !== undefined &&
      (patch.layout?.key ?? null) !== prev.index.layoutKey)
  );
}

function decorated(
  prev: PaginationState | null,
  index: BlockIndex,
  pagination: Pagination,
  change: ChangeHint | null,
  options: DecorationOptions,
): DecorationSet {
  return mark("pagination.decorations", () =>
    updateDecorations(prev, index, pagination, change, options),
  );
}

function fullRun(
  prev: PaginationState,
  settings: PaginationSettings,
  state: EditorState,
  options: DecorationOptions,
): PaginationState {
  const { index } = updateIndex(prev.index, state.doc, settings.layout);
  const pagination = settings.engine.paginate(
    index.blocks,
    settings.profile,
    settings.locks,
  );
  return {
    settings,
    index,
    pagination,
    decorations: decorated(null, index, pagination, null, options),
    frozen: false,
    engineRuns: prev.engineRuns + 1,
  };
}

function incrementalRun(
  prev: PaginationState,
  settings: PaginationSettings,
  state: EditorState,
  options: DecorationOptions,
): PaginationState {
  const { index, change } = updateIndex(prev.index, state.doc, settings.layout);
  if (change === null) return { ...prev, settings, index, frozen: false };
  const pagination = mark("pagination.engine", () =>
    settings.engine.repaginate(prev.pagination, index.blocks, change),
  );
  return {
    settings,
    index,
    pagination,
    decorations: decorated(prev, index, pagination, change, options),
    frozen: false,
    engineRuns: prev.engineRuns + 1,
  };
}

function initialState(
  options: PaginationOptions,
  state: EditorState,
  decorations: DecorationOptions,
): PaginationState {
  const settings: PaginationSettings = {
    engine: options.layoutEngine ?? currentEngine(),
    profile: options.profile,
    locks: options.locks ?? NO_LOCKS,
    layout: options.layout ?? null,
  };
  assertSameEngine(settings);
  const index = toIndex(state.doc, settings.layout);
  const pagination = settings.engine.paginate(
    index.blocks,
    settings.profile,
    settings.locks,
  );
  return {
    settings,
    index,
    pagination,
    decorations: decorated(null, index, pagination, null, decorations),
    frozen: false,
    engineRuns: 0,
  };
}

function applyTransaction(
  tr: Transaction,
  prev: PaginationState,
  state: EditorState,
  options: DecorationOptions,
): PaginationState {
  const patch = patchOf(tr);
  if (patch === null && !tr.docChanged) return prev;
  if (patch === null && tr.getMeta("composition") !== undefined)
    return {
      ...prev,
      decorations: prev.decorations.map(tr.mapping, tr.doc),
      frozen: true,
    };
  if (patch === null)
    return incrementalRun(prev, prev.settings, state, options);
  const settings = withPatch(prev.settings, patch);
  return needsFullRun(prev, patch)
    ? fullRun(prev, settings, state, options)
    : incrementalRun(prev, settings, state, options);
}

function stateOf(state: EditorState): PaginationState {
  const own = paginationKey.getState(state);
  if (own === undefined)
    throw new RangeError("the editor state has no pagination plugin");
  return own;
}

function nearestScroller(view: EditorView): Element {
  for (let at = view.dom.parentElement; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  const doc = view.dom.ownerDocument;
  return doc.scrollingElement ?? doc.documentElement;
}

/**
 * Keeps the caret's line where it was when a local edit carries the caret to another page. `before` is read once
 * after each update; a scroll since then is taken off it.
 */
function caretKeeper(
  view: EditorView,
  options: PaginationOptions,
  isRemoteState: (state: EditorState) => boolean,
): (prev: EditorState) => void {
  let scroller: Element | null = null;
  let before: CaretPlace | null = null;
  let scrolledTo = 0;
  return (prev) => {
    scroller ??= (options.scroller ?? nearestScroller)(view);
    const after = caretPlace(view);
    if (
      after !== null &&
      before !== null &&
      prev.doc !== view.state.doc &&
      !isRemoteState(view.state)
    ) {
      const moved = scroller.scrollTop - scrolledTo;
      const delta = scrollDelta({ ...before, top: before.top - moved }, after);
      scroller.scrollTop += delta;
      before = { ...after, top: after.top - delta };
    } else {
      before = after;
    }
    scrolledTo = scroller.scrollTop;
  };
}

/**
 * After a composition, the pages are brought up to date once the view has stopped composing; a local edit that
 * carries the caret to another page leaves its line where it was.
 */
function paginationView(
  view: EditorView,
  options: PaginationOptions,
  isRemoteState: (state: EditorState) => boolean,
): PluginView {
  let pages = stateOf(view.state).pagination.pages.length;
  const keepCaret = caretKeeper(view, options, isRemoteState);
  let scheduled = false;
  const isWaiting = () => !view.composing && stateOf(view.state).frozen;
  const resume = () => {
    if (scheduled || !isWaiting()) return;
    scheduled = true;
    options.defer(() => {
      scheduled = false;
      if (view.isDestroyed || !isWaiting()) return;
      view.dispatch(
        setPagination(view.state.tr, { repaginate: true }).setMeta(
          "addToHistory",
          false,
        ),
      );
    });
  };
  view.dom.addEventListener("compositionend", resume);
  options.onPages?.(pages);
  return {
    update(_, prev) {
      resume();
      keepCaret(prev);
      const count = stateOf(view.state).pagination.pages.length;
      if (count === pages) return;
      pages = count;
      options.onPages?.(count);
    },
    destroy() {
      view.dom.removeEventListener("compositionend", resume);
    },
  };
}

/** Pagination as plugin state: the profile's pages of the document, updated in every transaction that changes it. */
export function paginationPlugin(
  options: PaginationOptions,
): Plugin<PaginationState> {
  const decorations: DecorationOptions = {
    // with no engine named, as for a user agent that names none
    style: MID_BLOCK_BREAKS[options.engine ?? "chromium"],
    offFontNote: options.offFontNote,
  };
  const isRemote = options.isRemote ?? (() => false);
  // the states a remote change made, kept while they are in use
  const remoteStates = new WeakSet<EditorState>();
  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: (_, state) => initialState(options, state, decorations),
      apply: (tr, prev, _old, state) =>
        applyTransaction(tr, prev, state, decorations),
    },
    appendTransaction: (trs, _old, state) => {
      if (trs.some(isRemote)) remoteStates.add(state);
      return null;
    },
    view: (view) =>
      paginationView(view, options, (state) => remoteStates.has(state)),
    props: {
      decorations: (state) => paginationKey.getState(state)?.decorations,
      // WebKit selects nothing when a document's first and last children are breaks that cannot be edited
      handleKeyDown: keydownHandler({ "Mod-a": selectAll }),
    },
  });
}
