// Room log editor plugin: slash-tag input rule, empty-state placeholder, in-place link picker, gutter markers and line facts.
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { createCompletePopover } from "../complete/popover.ts";
import type { CompletePopover } from "../complete/popover.ts";
import { createRoomLogGutter } from "./gutter.ts";
import type { RoomLogGutterOptions } from "./gutter.ts";
import {
  isEmptyRoomLog,
  roomLogLineState,
  slashTagTransaction,
} from "./tags.ts";
import type { RoomLogLineState } from "./tags.ts";

export interface RoomLogPluginOptions extends RoomLogGutterOptions {
  /** True only for a document whose kind is `room_log`; when false the plugin does nothing. */
  active(): boolean;
  /** The popovers' frame; null before the view exists. */
  layer(): HTMLElement | null;
  /** Shown on an empty room log document. */
  emptyPlaceholder: string;
  /** Calls back when external inputs (doc kind or link targets) change; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Called once the view mounts and when destroyed, so the host can reach it while active. */
  onView?(view: EditorView | null): void;
  /** Called only when the caret line's onLine/editable/tags/link state changes. */
  onLineChange?(state: RoomLogLineState): void;
}

interface LinkAsk {
  readonly items: readonly string[];
  readonly at: number;
  choose(index: number): void;
}

interface RoomLogState {
  readonly asking: LinkAsk | null;
  readonly activeIndex: number;
  readonly version: number;
}

type RoomLogMeta =
  | { readonly kind: "ask"; readonly asking: LinkAsk }
  | { readonly kind: "move"; readonly activeIndex: number }
  | { readonly kind: "close" }
  | { readonly kind: "refresh" };

const roomLogKey = new PluginKey<RoomLogState>("room_log");
const CLOSE: RoomLogMeta = Object.freeze({ kind: "close" });
const REFRESH: RoomLogMeta = Object.freeze({ kind: "refresh" });

const INITIAL_STATE: RoomLogState = Object.freeze({
  asking: null,
  activeIndex: 0,
  version: 0,
});

function applied(
  tr: Transaction,
  prev: RoomLogState,
  state: EditorState,
): RoomLogState {
  const meta: RoomLogMeta | undefined = tr.getMeta(roomLogKey);
  switch (meta?.kind) {
    case "ask":
      return { ...prev, asking: meta.asking, activeIndex: 0 };
    case "move":
      return { ...prev, activeIndex: meta.activeIndex };
    case "close":
      return prev.asking === null
        ? prev
        : { ...prev, asking: null, activeIndex: 0 };
    case "refresh":
      return { ...prev, version: prev.version + 1 };
    case undefined:
      break;
  }
  if (tr.docChanged) {
    return prev.asking === null
      ? prev
      : { ...prev, asking: null, activeIndex: 0 };
  }
  if (tr.selectionSet && prev.asking !== null) {
    if (prev.asking.at !== state.selection.head)
      return { ...prev, asking: null, activeIndex: 0 };
  }
  return prev;
}

function emptyDecoration(
  state: EditorState,
  options: RoomLogPluginOptions,
): DecorationSet | null {
  if (!options.active() || !isEmptyRoomLog(state)) return null;
  const block = state.doc.firstChild?.firstChild;
  if (block === null || block === undefined) return null;
  // section starts at 0, first block starts at 1
  return DecorationSet.create(state.doc, [
    Decoration.node(1, 1 + block.nodeSize, {
      class: "mn-empty mn-room-empty",
      "data-placeholder": options.emptyPlaceholder,
    }),
  ]);
}

function isRemoteOrHistory(tr: Transaction): boolean {
  return (
    tr.getMeta("y-sync$") !== undefined ||
    tr.getMeta("history$") !== undefined ||
    tr.getMeta(roomLogKey) !== undefined
  );
}

function appendSlashTag(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
  options: RoomLogPluginOptions,
): Transaction | null {
  if (!options.active()) return null;
  if (!transactions.some((tr) => tr.docChanged)) return null;
  if (transactions.some(isRemoteOrHistory)) return null;
  const tr = slashTagTransaction(oldState, newState);
  return tr === null ? null : tr.setMeta(roomLogKey, REFRESH);
}

function handleAskKeyDown(
  view: EditorView,
  event: KeyboardEvent,
  options: RoomLogPluginOptions,
): boolean {
  if (!options.active() || view.composing || event.isComposing) return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
    return false;
  const state = roomLogKey.getState(view.state);
  if (state === undefined || state.asking === null) return false;
  const { asking, activeIndex } = state;
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp": {
      if (asking.items.length < 2) return false;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(
        asking.items.length - 1,
        Math.max(0, activeIndex + step),
      );
      view.dispatch(
        view.state.tr.setMeta(roomLogKey, { kind: "move", activeIndex: next }),
      );
      return true;
    }
    case "Enter": {
      event.preventDefault();
      view.dispatch(view.state.tr.setMeta(roomLogKey, CLOSE));
      asking.choose(activeIndex);
      return true;
    }
    case "Escape": {
      event.stopPropagation();
      view.dispatch(view.state.tr.setMeta(roomLogKey, CLOSE));
      return true;
    }
    default:
      return false;
  }
}

function optionIndexOf(event: MouseEvent): number | null {
  if (!(event.target instanceof Element)) return null;
  const option = event.target.closest('[role="option"]');
  const list = option?.parentElement ?? null;
  return option === null || list === null
    ? null
    : [...list.children].indexOf(option);
}

const lineKeyOf = (line: RoomLogLineState): string =>
  `${line.onLine}:${line.editable}:${line.tags.join(",")}:${line.linkTo?.kind ?? ""}:${line.linkTo?.blockId ?? ""}`;

const ROOM_LOG_CSS =
  ".mn-room-empty::before { white-space: normal; display: block; }";

function roomLogView(
  view: EditorView,
  options: RoomLogPluginOptions,
): PluginView {
  let layer: HTMLElement | null = null;
  let popover: CompletePopover | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let lastLineKey = "";
  const gutter = createRoomLogGutter(view, options.active, options);

  const ensureStyle = (): void => {
    if (!options.active() || styleEl !== null) return;
    const host = view.dom.parentElement;
    if (host === null) return;
    const el = host.ownerDocument.createElement("style");
    el.dataset["roomLogStyle"] = "true";
    el.textContent = ROOM_LOG_CSS;
    host.append(el);
    styleEl = el;
  };

  const onMouseDown = (event: MouseEvent): void => {
    const state = roomLogKey.getState(view.state);
    if (state === undefined || state.asking === null) return;
    const index = optionIndexOf(event);
    if (index === null) return;
    event.preventDefault();
    const { asking } = state;
    view.dispatch(view.state.tr.setMeta(roomLogKey, CLOSE));
    asking.choose(index);
  };

  const popoverOf = (): CompletePopover | null => {
    if (popover !== null) return popover;
    layer = options.layer();
    if (layer === null) return null;
    layer.addEventListener("mousedown", onMouseDown);
    popover = createCompletePopover({ layer });
    return popover;
  };

  const drawPopover = (): void => {
    const state = roomLogKey.getState(view.state);
    const asking = options.active() ? (state?.asking ?? null) : null;
    if (asking === null || view.composing) {
      popover?.hide();
      return;
    }
    const list = popoverOf();
    if (list === null || layer === null) return;
    const activeIndex = state?.activeIndex ?? 0;
    list.show(asking.items, activeIndex);
    const listEl = layer.querySelector<HTMLElement>("#mn-complete");
    if (listEl !== null) {
      listEl.style.maxHeight = "16rem";
      listEl.style.overflowY = "auto";
      listEl
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
    const caret = view.coordsAtPos(view.state.selection.head);
    const box = layer.getBoundingClientRect();
    list.place(caret.left - box.left, caret.bottom - box.top);
  };

  const publishLine = (): void => {
    if (!options.active()) return;
    const line = roomLogLineState(view.state, view.editable);
    const nextKey = lineKeyOf(line);
    if (nextKey === lastLineKey) return;
    lastLineKey = nextKey;
    options.onLineChange?.(line);
  };

  const sync = (): void => {
    ensureStyle();
    publishLine();
    gutter.draw();
    drawPopover();
  };

  options.onView?.(view);
  let ready = false;
  let destroyed = false;
  const stop = options.subscribe(() => {
    if (destroyed || view.isDestroyed) return;
    if (!ready) return;
    view.dispatch(
      view.state.tr.setMeta(roomLogKey, REFRESH).setMeta("addToHistory", false),
    );
  });
  sync();
  ready = true;
  // page 1 opens at the top: the title page above it says nothing in a room log
  const scrollToFirstPage = (): boolean => {
    const parent = view.dom.parentElement;
    if (parent === null || parent.classList.contains("fonts-loading"))
      return false;
    const sheet = parent.querySelector<HTMLElement>('.mn-sheet[data-page="0"]');
    if (sheet === null) return false;
    sheet.scrollIntoView?.({ block: "start" });
    return true;
  };
  const firstPage = new MutationObserver(() => {
    if (destroyed || view.isDestroyed || !options.active()) return;
    if (scrollToFirstPage()) firstPage.disconnect();
  });
  if (
    options.active() &&
    view.dom.parentElement !== null &&
    !scrollToFirstPage()
  ) {
    firstPage.observe(view.dom.parentElement, {
      subtree: true,
      childList: true,
      attributeFilter: ["data-page", "class"],
    });
  }

  return {
    update: sync,
    destroy() {
      destroyed = true;
      firstPage.disconnect();
      stop();
      options.onView?.(null);
      layer?.removeEventListener("mousedown", onMouseDown);
      popover?.hide();
      popover = null;
      styleEl?.remove();
      styleEl = null;
      gutter.destroy();
    },
  };
}

/**
 * Room log plugin: inert when `options.active()` is false; otherwise handles `/landed`, `/showrunner`, `/joke` and
 * `/future` prefixes, shows the empty room log placeholder, draws `.mn-room-tag` and `.mn-room-link` gutter markers
 * and hosts the in-place beat/scene link picker.
 */
export function roomLogPlugin(options: RoomLogPluginOptions): Plugin {
  return new Plugin<RoomLogState>({
    key: roomLogKey,
    state: {
      init: () => INITIAL_STATE,
      apply: (tr, prev, _, state) => applied(tr, prev, state),
    },
    appendTransaction: (transactions, oldState, newState) =>
      appendSlashTag(transactions, oldState, newState, options),
    props: {
      decorations: (state) => emptyDecoration(state, options),
      handleDOMEvents: {
        keydown: (view, event) => handleAskKeyDown(view, event, options),
      },
    },
    view: (view) => roomLogView(view, options),
  });
}

/** Opens the in-place beat/scene picker at the caret of `view`; false when read-only or `items` is empty. */
export function askRoomLogLink(
  view: EditorView,
  items: readonly string[],
  choose: (index: number) => void,
): boolean {
  if (!view.editable || items.length === 0) return false;
  const asking: LinkAsk = { items, at: view.state.selection.head, choose };
  view.focus();
  view.dispatch(view.state.tr.setMeta(roomLogKey, { kind: "ask", asking }));
  return true;
}

/** Triggers a gutter and decoration refresh on `view` without touching undo history. */
export function refreshRoomLog(view: EditorView): void {
  if (view.isDestroyed) return;
  view.dispatch(
    view.state.tr.setMeta(roomLogKey, REFRESH).setMeta("addToHistory", false),
  );
}
