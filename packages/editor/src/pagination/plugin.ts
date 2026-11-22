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
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { DecorationSet, EditorView } from "prosemirror-view";
import { MID_BLOCK_BREAKS } from "../page/config.ts";
import type { BrowserEngine, LayoutView } from "../page/config.ts";
import { toIndex, updateIndex } from "./block-index.ts";
import type { BlockIndex } from "./block-index.ts";
import { caretPlace, scrollDelta } from "./caret.ts";
import type { CaretPlace } from "./caret.ts";
import { updateDecorations } from "./decorations.ts";
import type { DecorationOptions } from "./decorations.ts";
import type { IsRemote } from "./page-view.ts";
import { ownScroller } from "./scroller.ts";
import { assertSameEngine, needsFullRun, withPatch } from "./settings-patch.ts";
import type { SettingsPatch } from "./settings-patch.ts";

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
  /** The blocks the transaction that made this state replaced; null when none did, while frozen, and at first. */
  readonly change: ChangeHint | null;
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
  /** Default: the nearest ancestor of the editor that scrolls. Its own scroll anchoring is turned off. */
  readonly scroller?: (view: EditorView) => Element;
  /** Called with the page count when the plugin's view starts and whenever the count changes. */
  readonly onPages?: (count: number) => void;
  /** Default "page". */
  readonly view?: LayoutView;
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

const paginateAll = (settings: PaginationSettings, index: BlockIndex) =>
  settings.engine.paginate(index.blocks, settings.profile, settings.locks);

function fullRun(
  prev: PaginationState,
  settings: PaginationSettings,
  state: EditorState,
  options: DecorationOptions,
): PaginationState {
  const { index } = updateIndex(prev.index, state.doc, settings.layout);
  const count = index.blocks.length;
  const pagination = paginateAll(settings, index);
  return {
    settings,
    index,
    pagination,
    decorations: decorated(null, index, pagination, null, options),
    frozen: false,
    engineRuns: prev.engineRuns + 1,
    change: { first: 0, oldEnd: prev.index.blocks.length, newEnd: count },
  };
}

function incrementalRun(
  prev: PaginationState,
  settings: PaginationSettings,
  doc: Node,
  options: DecorationOptions,
): PaginationState {
  const { index, change } = updateIndex(prev.index, doc, settings.layout);
  if (change === null)
    return { ...prev, settings, index, frozen: false, change };
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
    change,
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
  const pagination = paginateAll(settings, index);
  return {
    settings,
    index,
    pagination,
    decorations: decorated(null, index, pagination, null, decorations),
    frozen: false,
    engineRuns: 0,
    change: null,
  };
}

/** One hint for two changes in a row: `a` from the old blocks to the middle ones, `b` from those to the new. */
function followedBy(a: ChangeHint | null, b: ChangeHint | null) {
  if (a === null || b === null) return a ?? b;
  const end = Math.max(a.newEnd, b.oldEnd);
  const oldEnd = end - a.newEnd + a.oldEnd;
  const newEnd = end - b.oldEnd + b.newEnd;
  return { first: Math.min(a.first, b.first), oldEnd, newEnd };
}

/**
 * A composition's decorations are in the document before `tr`, and its pages in the one before the composition:
 * when `tr` changes the document, the pages first catch up with the document before it, as the deferred
 * repagination would, so the decorations are moved past this change alone. The change it names covers both runs.
 */
function settledRun(
  prev: PaginationState,
  settings: PaginationSettings,
  tr: Transaction,
  options: DecorationOptions,
): PaginationState {
  if (!prev.frozen || !tr.docChanged)
    return incrementalRun(prev, settings, tr.doc, options);
  const caught = incrementalRun(prev, prev.settings, tr.before, options);
  const next = incrementalRun(caught, settings, tr.doc, options);
  return { ...next, change: followedBy(caught.change, next.change) };
}

function applyTransaction(
  tr: Transaction,
  prev: PaginationState,
  state: EditorState,
  options: DecorationOptions,
): PaginationState {
  const patch = patchOf(tr);
  if (patch === null && !tr.docChanged)
    return prev.change === null ? prev : { ...prev, change: null };
  if (patch === null && tr.getMeta("composition") !== undefined)
    return {
      ...prev,
      decorations: prev.decorations.map(tr.mapping, tr.doc),
      frozen: true,
      change: null,
    };
  if (patch === null) return settledRun(prev, prev.settings, tr, options);
  const settings = withPatch(prev.settings, patch);
  return needsFullRun(prev, patch)
    ? fullRun(prev, settings, state, options)
    : settledRun(prev, settings, tr, options);
}

function stateOf(state: EditorState): PaginationState {
  const own = paginationKey.getState(state);
  if (own === undefined)
    throw new RangeError("the editor state has no pagination plugin");
  return own;
}

/**
 * Keeps the caret's line where it was when a local edit carries the caret to another page. `before` is read once
 * after each update; a scroll since then is taken off it.
 */
function caretKeeper(
  view: EditorView,
  scrollerOf: () => Element,
  isRemoteState: (state: EditorState) => boolean,
): (prev: EditorState) => void {
  let before: CaretPlace | null = null;
  let scrolledTo = 0;
  return (prev) => {
    const scroller = scrollerOf();
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
 * carries the caret to another page leaves its line where it was. `isRemoteState` says whether a remote change made
 * a state.
 */
function paginationView(
  view: EditorView,
  options: PaginationOptions,
  isRemoteState: (state: EditorState) => boolean,
): PluginView {
  // a port is called without a receiver: queueMicrotask refuses any other
  const { defer } = options;
  let pages = stateOf(view.state).pagination.pages.length;
  let scroller: Element | null = null;
  const scrollerOf = () => (scroller ??= ownScroller(view, options.scroller));
  const keepCaret = caretKeeper(view, scrollerOf, isRemoteState);
  let scheduled = false;
  const isWaiting = () => !view.composing && stateOf(view.state).frozen;
  const resume = () => {
    if (scheduled || !isWaiting()) return;
    scheduled = true;
    defer(() => {
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
    view: options.view ?? "page",
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
