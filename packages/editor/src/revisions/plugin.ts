// The revisions feature of the editor: what it reads of production, through a port the host implements, and the
// plugin that keeps the script's marks, numbers and lock table and draws them.
import { NO_LOCKS } from "@manent/pagination";
import type { LockAnchorRecord } from "@manent/pagination";
import { baseEngine, lockedPagination } from "@manent/revisions";
import type {
  Baseline,
  LockedLayout,
  MarkMode,
  NumberingScheme,
  RevisionColour,
  RevisionSource,
} from "@manent/revisions";
import { Plugin } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type { PageScaffold } from "../page/scaffold.ts";
import { updateIndex } from "../pagination/block-index.ts";
import { paginationKey, setPagination } from "../pagination/plugin.ts";
import type {
  PaginationSettings,
  PaginationState,
} from "../pagination/plugin.ts";
import type { FactsSink, Frames } from "../script-editor/ports.ts";
import {
  keptOf,
  keptOfRevision,
  outOfProduction,
  productionOf,
  revisionKey,
  revisionStateOf,
  withEdit,
  withOverrides,
  withView,
} from "./derive.ts";
import type { RevisionKept, RevisionState } from "./derive.ts";
import { descriptionsOf, nextDescriptions } from "./descriptions.ts";
import type { Descriptions } from "./descriptions.ts";
import { lockMarkersPlugin } from "./markers.ts";
import { clearedNumbers, productionEngine, withPages } from "./numbers.ts";
import { pagesFeedPlugin } from "./pages-feed.ts";
import type { PagesSink } from "./pages-feed.ts";
import { createSheetPainter } from "./sheets.ts";

export interface ProductionPort {
  /** Null while the script is not in production. */
  view(): ProductionView | null;
  subscribe(listener: () => void): () => void;
  /** The script's shared map of manual marks; a null value removes the key. */
  overrides: {
    get(key: string): unknown;
    set(key: string, value: string | null): void;
    subscribe(listener: (keys: readonly string[]) => void): () => void;
  };
}

export interface ProductionView {
  readonly setId: string;
  readonly records: readonly LockAnchorRecord[];
  readonly numbering: NumberingScheme;
  readonly issuedNumbers: ReadonlyMap<string, string>;
  readonly used: ReadonlySet<string>;
  readonly baseline: Baseline;
  /** The issued revisions, oldest first, each with its marks as issued. */
  readonly earlier: readonly RevisionSource[];
  readonly active: Omit<RevisionSource, "marks">;
  readonly mode: MarkMode;
  readonly tint: boolean;
  readonly words: {
    lockTooltip(next: string): string;
    colourName(c: RevisionColour): string;
    /** The description of an element `name` marks. */
    revisedDescription(name: string): string;
  };
}

export interface RevisionPluginOptions {
  port: ProductionPort;
  facts: FactsSink;
  pages: PagesSink;
  scaffold: () => PageScaffold | null;
  layer: () => HTMLElement | null;
  zoom: () => number;
  /** Told true when the script goes into production and false when it leaves, so its scenes are numbered. */
  scenesNumbered(on: boolean): void;
  /** A fresh copy of the host's lock icon. */
  lockIcon: () => Element;
  /** The accessible name of the lock beside a locked page's number. */
  lockMarkerName: string;
  frames: Frames;
}

type RevisionMeta =
  | { readonly type: "view"; readonly view: ProductionView | null }
  | { readonly type: "overrides"; readonly keys: readonly string[] }
  | {
      readonly type: "locked";
      readonly locked: LockedLayout;
      readonly records: readonly LockAnchorRecord[];
    };

const hasView = (
  kept: RevisionKept,
): kept is RevisionKept & { readonly view: ProductionView } =>
  kept.view !== null;

function pagesOf(state: EditorState): PaginationState {
  const pages = paginationKey.getState(state);
  if (pages === undefined)
    throw new RangeError(
      "the revisions plugin needs the pagination plugin before it",
    );
  return pages;
}

function applyMeta(
  kept: RevisionKept,
  meta: RevisionMeta | undefined,
  tr: Transaction,
  pages: PaginationState,
): RevisionKept {
  if (meta === undefined || meta.type === "locked") return kept;
  if (meta.type === "view") return withView(kept, meta.view, tr.doc);
  return hasView(kept) ? withOverrides(kept, meta.keys, pages.index) : kept;
}

function applyRevisions(
  tr: Transaction,
  prev: RevisionState,
  old: EditorState,
  state: EditorState,
): RevisionState {
  const was = keptOf(old);
  if (was === null) return prev;
  const pages = pagesOf(state);
  const before = pagesOf(old).index;
  const meta: RevisionMeta | undefined = tr.getMeta(revisionKey);
  let kept = applyMeta(was, meta, tr, pages);
  // a run that only took new settings laid the same blocks out again: no block's mark can change
  if (hasView(kept) && pages.change !== null && pages.index.doc !== before.doc)
    kept = withEdit(kept, before, { ...pages, change: pages.change });
  if (
    meta?.type === "locked" &&
    hasView(kept) &&
    kept.view.records === meta.records &&
    pages.index.layoutKey === (kept.layout?.key ?? null)
  ) {
    kept = {
      ...kept,
      locked: { ...meta.locked, pagination: pages.pagination },
      records: meta.records,
      pagination: pages.pagination,
    };
  } else {
    kept = withPages(kept, pages);
  }
  return kept === was ? prev : revisionStateOf(kept);
}

/** O(1) check for whether pagination must be updated to match the current production state. */
function needsSettle(state: EditorState, sent: boolean): boolean {
  const kept = keptOf(state);
  const { settings, index } = pagesOf(state);
  if (kept === null) return false;
  if (kept.view === null) {
    const engine = baseEngine(settings.engine);
    return (
      sent &&
      (settings.layout !== null ||
        settings.locks !== NO_LOCKS ||
        settings.engine !== engine)
    );
  }
  if ((kept.layout?.key ?? null) !== index.layoutKey) return true;
  if (kept.locked === null) return false;
  const engine = productionEngine(settings.engine, kept.view.records);
  return kept.locked.locks !== settings.locks || engine !== settings.engine;
}

/** What the pagination must be told for the pages to show production as it stands; null when they already do. */
function pendingSettings(
  state: EditorState,
  sent: boolean,
): {
  patch: Partial<PaginationSettings>;
  locked: {
    locked: LockedLayout;
    records: readonly LockAnchorRecord[];
  } | null;
} | null {
  const kept = keptOf(state);
  const { settings, index } = pagesOf(state);
  if (kept === null) return null;
  if (kept.view === null) {
    const engine = baseEngine(settings.engine);
    return sent &&
      (settings.layout !== null ||
        settings.locks !== NO_LOCKS ||
        settings.engine !== engine)
      ? { patch: { layout: null, locks: NO_LOCKS, engine }, locked: null }
      : null;
  }
  const engine = productionEngine(settings.engine, kept.view.records);
  if ((kept.layout?.key ?? null) !== index.layoutKey) {
    // batch layout + locks + engine into a single pagination pass and precompute locked once
    const patched = updateIndex(index, state.doc, kept.layout).index;
    const freshLocked = lockedPagination(
      patched.blocks,
      settings.profile,
      kept.view.records,
      baseEngine(settings.engine),
    );
    return {
      patch: { layout: kept.layout, locks: freshLocked.locks, engine },
      locked: { locked: freshLocked, records: kept.view.records },
    };
  }
  if (kept.locked === null) return null;
  return kept.locked.locks !== settings.locks || engine !== settings.engine
    ? { patch: { locks: kept.locked.locks, engine }, locked: null }
    : null;
}

/**
 * Tells the pagination of the layout and the lock table, the host of production starting and ending, and the
 * sheets what to draw. Everything it dispatches waits for the current update to end, and is never an undo step.
 */
function revisionView(
  view: EditorView,
  options: RevisionPluginOptions,
): PluginView {
  const { port } = options;
  const painter = createSheetPainter(options.scaffold);
  let numbered = productionOf(view.state) !== null;
  // the pagination was given production's layout or locks, which leaving production takes back
  let sent = false;
  let scheduled = false;
  const later = (run: () => void) =>
    queueMicrotask(() => {
      if (!view.isDestroyed) run();
    });
  const send = (meta: RevisionMeta) =>
    later(() =>
      view.dispatch(
        view.state.tr.setMeta(revisionKey, meta).setMeta("addToHistory", false),
      ),
    );
  const settle = () => {
    scheduled = false;
    const production = productionOf(view.state) !== null;
    if (production !== numbered) {
      numbered = production;
      options.scenesNumbered(production);
      if (view.isDestroyed) return;
    }
    const pending = pendingSettings(view.state, sent);
    if (pending === null) return;
    sent = keptOf(view.state)?.view !== null;
    let tr = setPagination(view.state.tr, pending.patch).setMeta(
      "addToHistory",
      false,
    );
    if (pending.locked !== null)
      tr = tr.setMeta(revisionKey, {
        type: "locked",
        locked: pending.locked.locked,
        records: pending.locked.records,
      } satisfies RevisionMeta);
    view.dispatch(tr);
  };
  const sync = () => {
    painter.paint(view.state);
    const production = productionOf(view.state) !== null;
    if (
      scheduled ||
      (production === numbered && !needsSettle(view.state, sent))
    )
      return;
    scheduled = true;
    later(settle);
  };
  const unsubscribe = [
    port.subscribe(() => send({ type: "view", view: port.view() })),
    port.overrides.subscribe((keys) => send({ type: "overrides", keys })),
  ];
  sync();
  return {
    update: sync,
    destroy() {
      for (const stop of unsubscribe) stop();
      painter.destroy();
    },
  };
}

/** Several views as one, each told of every update in turn. */
function oneView(views: readonly PluginView[]): PluginView {
  return {
    update(view, prev) {
      for (const one of views) one.update?.(view, prev);
    },
    destroy() {
      for (const one of views) one.destroy?.();
    },
  };
}

/**
 * The revision state of the script in production: its marks, its numbers and omitted scenes, drawn on its sheets,
 * with the locks beside locked page numbers, the Pages feed and each revised element's description, as one plugin.
 */
export function revisionPlugins(options: RevisionPluginOptions): Plugin {
  const { port } = options;
  // each state's descriptions, made beside its revision state from the state before it
  const described = new WeakMap<EditorState, Descriptions>();
  const parts = [
    pagesFeedPlugin({ sink: options.pages, facts: options.facts }),
    lockMarkersPlugin({
      layer: options.layer,
      name: options.lockMarkerName,
      // a page is locked only in production, but the pages may keep its locks until the next update
      tooltip: (next) => port.view()?.words.lockTooltip(next) ?? "",
      zoom: options.zoom,
      icon: options.lockIcon,
      frames: options.frames,
    }),
  ];
  return new Plugin<RevisionState>({
    key: revisionKey,
    state: {
      init: (_, state) => {
        const kept = withView(outOfProduction(port), port.view(), state.doc);
        described.set(state, descriptionsOf(state.doc, kept));
        return revisionStateOf(kept);
      },
      apply(tr, prev, old, state) {
        const next = applyRevisions(tr, prev, old, state);
        const was = described.get(old);
        const kept = keptOfRevision(next);
        if (kept !== null)
          described.set(
            state,
            was === undefined
              ? descriptionsOf(tr.doc, kept)
              : nextDescriptions(
                  was,
                  tr,
                  kept,
                  pagesOf(old).index,
                  pagesOf(state),
                ),
          );
        return next;
      },
    },
    props: {
      decorations: (state) => described.get(state)?.set ?? DecorationSet.empty,
    },
    appendTransaction(trs, _old, state) {
      const production = productionOf(state);
      return production === null
        ? null
        : clearedNumbers(trs, state, production.view);
    },
    view: (view) =>
      oneView([
        revisionView(view, options),
        ...parts.flatMap((part) => part.spec.view?.(view) ?? []),
      ]),
  });
}
