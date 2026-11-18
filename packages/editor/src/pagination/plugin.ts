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
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { BrowserEngine } from "../page/config.ts";
import { toIndex, updateIndex } from "./block-index.ts";
import type { BlockIndex } from "./block-index.ts";
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

function fullRun(
  prev: PaginationState,
  settings: PaginationSettings,
  state: EditorState,
): PaginationState {
  const { index } = updateIndex(prev.index, state.doc, settings.layout);
  return {
    settings,
    index,
    pagination: settings.engine.paginate(
      index.blocks,
      settings.profile,
      settings.locks,
    ),
    decorations: DecorationSet.empty,
    frozen: false,
    engineRuns: prev.engineRuns + 1,
  };
}

function incrementalRun(
  prev: PaginationState,
  settings: PaginationSettings,
  state: EditorState,
): PaginationState {
  const { index, change } = updateIndex(prev.index, state.doc, settings.layout);
  if (change === null) return { ...prev, settings, index, frozen: false };
  return {
    settings,
    index,
    pagination: repaginated(settings.engine, prev.pagination, index, change),
    decorations: DecorationSet.empty,
    frozen: false,
    engineRuns: prev.engineRuns + 1,
  };
}

function repaginated(
  engine: Engine,
  prev: Pagination,
  index: BlockIndex,
  change: ChangeHint,
): Pagination {
  return mark("pagination.engine", () =>
    engine.repaginate(prev, index.blocks, change),
  );
}

function initialState(
  options: PaginationOptions,
  state: EditorState,
): PaginationState {
  const settings: PaginationSettings = {
    engine: options.layoutEngine ?? currentEngine(),
    profile: options.profile,
    locks: options.locks ?? NO_LOCKS,
    layout: options.layout ?? null,
  };
  assertSameEngine(settings);
  const index = toIndex(state.doc, settings.layout);
  return {
    settings,
    index,
    pagination: settings.engine.paginate(
      index.blocks,
      settings.profile,
      settings.locks,
    ),
    decorations: DecorationSet.empty,
    frozen: false,
    engineRuns: 0,
  };
}

function applyTransaction(
  tr: Transaction,
  prev: PaginationState,
  state: EditorState,
): PaginationState {
  const patch = patchOf(tr);
  if (patch === null && !tr.docChanged) return prev;
  if (patch === null && tr.getMeta("composition") !== undefined)
    return {
      ...prev,
      decorations: prev.decorations.map(tr.mapping, tr.doc),
      frozen: true,
    };
  if (patch === null) return incrementalRun(prev, prev.settings, state);
  const settings = withPatch(prev.settings, patch);
  return needsFullRun(prev, patch)
    ? fullRun(prev, settings, state)
    : incrementalRun(prev, settings, state);
}

function stateOf(state: EditorState): PaginationState {
  const own = paginationKey.getState(state);
  if (own === undefined)
    throw new RangeError("the editor state has no pagination plugin");
  return own;
}

/** After a composition, the pages are brought up to date once the view has stopped composing. */
function paginationView(
  view: EditorView,
  options: PaginationOptions,
): PluginView {
  let pages = stateOf(view.state).pagination.pages.length;
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
    update() {
      resume();
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
  return new Plugin<PaginationState>({
    key: paginationKey,
    state: {
      init: (_, state) => initialState(options, state),
      apply: (tr, prev, _old, state) => applyTransaction(tr, prev, state),
    },
    view: (view) => paginationView(view, options),
  });
}
