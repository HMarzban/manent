// The revisions feature of the editor: what it reads of production, through a port the host implements, and the
// plugin that keeps the script's marks, numbers and lock table and draws them.
import { NO_LOCKS } from "@manent/pagination";
import type { LockAnchorRecord } from "@manent/pagination";
import { baseEngine } from "@manent/revisions";
import type {
  Baseline,
  MarkMode,
  NumberingScheme,
  RevisionColour,
  RevisionSource,
} from "@manent/revisions";
import { Plugin } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { PageScaffold } from "../page/scaffold.ts";
import { paginationKey, setPagination } from "../pagination/plugin.ts";
import type {
  PaginationSettings,
  PaginationState,
} from "../pagination/plugin.ts";
import type { FactsSink } from "../script-editor/ports.ts";
import {
  keptOf,
  outOfProduction,
  productionOf,
  revisionKey,
  revisionStateOf,
  withEdit,
  withOverrides,
  withView,
} from "./derive.ts";
import type { RevisionKept, RevisionState } from "./derive.ts";
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
}

type RevisionMeta =
  | { readonly type: "view"; readonly view: ProductionView | null }
  | { readonly type: "overrides"; readonly keys: readonly string[] };

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
  if (meta === undefined) return kept;
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
  let kept = applyMeta(was, tr.getMeta(revisionKey), tr, pages);
  // a run that only took new settings laid the same blocks out again: no block's mark can change
  if (hasView(kept) && pages.change !== null && pages.index.doc !== before.doc)
    kept = withEdit(kept, before, { ...pages, change: pages.change });
  kept = withPages(kept, pages);
  return kept === was ? prev : revisionStateOf(kept);
}

/** What the pagination must be told for the pages to show production as it stands; null when they already do. */
function pendingSettings(
  state: EditorState,
  sent: boolean,
): Partial<PaginationSettings> | null {
  const kept = keptOf(state);
  const { settings, index } = pagesOf(state);
  if (kept === null) return null;
  if (kept.view === null) {
    const engine = baseEngine(settings.engine);
    return sent &&
      (settings.layout !== null ||
        settings.locks !== NO_LOCKS ||
        settings.engine !== engine)
      ? { layout: null, locks: NO_LOCKS, engine }
      : null;
  }
  if ((kept.layout?.key ?? null) !== index.layoutKey)
    return { layout: kept.layout };
  if (kept.locked === null) return null;
  const engine = productionEngine(settings.engine, kept.view.records);
  return kept.locked.locks !== settings.locks || engine !== settings.engine
    ? { locks: kept.locked.locks, engine }
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
  let numbered = false;
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
    const patch = pendingSettings(view.state, sent);
    if (patch === null) return;
    sent = keptOf(view.state)?.view !== null;
    view.dispatch(
      setPagination(view.state.tr, patch).setMeta("addToHistory", false),
    );
  };
  const sync = () => {
    painter.paint(view.state);
    const production = productionOf(view.state) !== null;
    if (production !== numbered) {
      numbered = production;
      later(() => options.scenesNumbered(production));
    }
    if (scheduled || pendingSettings(view.state, sent) === null) return;
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
 * with the locks beside locked page numbers and the Pages feed, as one plugin.
 */
export function revisionPlugins(options: RevisionPluginOptions): Plugin {
  const { port } = options;
  const parts = [
    pagesFeedPlugin({ sink: options.pages, facts: options.facts }),
    lockMarkersPlugin({
      layer: options.layer,
      name: options.lockMarkerName,
      // a page is locked only in production, but the pages may keep its locks until the next update
      tooltip: (next) => port.view()?.words.lockTooltip(next) ?? "",
      zoom: options.zoom,
      icon: options.lockIcon,
    }),
  ];
  return new Plugin<RevisionState>({
    key: revisionKey,
    state: {
      init: (_, state) =>
        revisionStateOf(
          withView(
            outOfProduction(options.port),
            options.port.view(),
            state.doc,
          ),
        ),
      apply: applyRevisions,
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
