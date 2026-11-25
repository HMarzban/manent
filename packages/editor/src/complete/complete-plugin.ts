// Autocomplete inside the page: names, scene headings and transitions offered at the caret, keyboard first.
import { mark } from "@manent/perf";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockNumber } from "../cursors/place.ts";
import { blockAt } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { Frames, Timers } from "../script-editor/ports.ts";
import { collectInkNames, namesWithInk, withInkBlock } from "./ink-names.ts";
import { collectNames, recentCues } from "./names.ts";
import type { Names } from "./names.ts";
import { createCompletePopover } from "./popover.ts";
import type { CompletePopover } from "./popover.ts";
import { suggestFromSources } from "./sources.ts";
import type { Suggestions } from "./suggest.ts";

interface CompleteState {
  readonly open: Suggestions | null;
  /** The option chosen, an index into `open.items`. */
  readonly active: number;
}

type CompleteMeta = { kind: "move"; active: number } | { kind: "close" };

export const completeKey: PluginKey<CompleteState> = new PluginKey("complete");

const CLOSED: CompleteState = Object.freeze({ open: null, active: 0 });
const CLOSE: CompleteMeta = Object.freeze({ kind: "close" });

/** How often at most the names are collected again after a change. */
const NAMES_EVERY_MS = 250;

/** The names the sources are given: the script's, and the host's beside them. */
interface Given {
  readonly names: Names;
  readonly projectNames: readonly string[];
}

/** What to offer at the caret: only for a caret in a block, never while the pages wait for a composition. */
function offered(state: EditorState, given: Given): Suggestions | null {
  const pagination = paginationKey.getState(state);
  const { selection } = state;
  if (!selection.empty || pagination?.frozen === true) return null;
  if (pagination === undefined) {
    const { $head } = selection;
    if (!$head.parent.isTextblock) return null;
    const type: unknown = $head.parent.attrs["type"];
    if (typeof type !== "string") return null;
    const block = $head.depth >= 2 ? blockNumber(state, $head) : -1;
    return suggestFromSources({
      element: type,
      text: $head.parent.textContent,
      offset: $head.parentOffset,
      recent: [],
      names: withInkBlock(given.names, block),
      projectNames: given.projectNames,
    });
  }
  const { blocks } = pagination.index;
  const block = blockAt(pagination.index, selection.head);
  const { type, text } = blocks[block]!;
  const recent = type === "character" ? recentCues(blocks, block) : [];
  return suggestFromSources({
    element: type,
    text,
    offset: selection.$head.parentOffset,
    recent,
    ...given,
  });
}

/**
 * The state after the caret moved, its suggestions worked out when first read: by then the pagination plugin,
 * which comes after this one, has its state for `state` too.
 */
function moved(state: EditorState, given: Given): CompleteState {
  let open: Suggestions | null = null;
  let known = false;
  return {
    get open() {
      if (!known) {
        open = mark("editor.complete", () => offered(state, given));
        known = true;
      }
      return open;
    },
    active: 0,
  };
}

/** The state after `tr`: a meta moves or closes the list; a caret that moved offers again, from `given`. */
function applied(
  tr: Transaction,
  prev: CompleteState,
  old: EditorState,
  state: EditorState,
  given: Given,
): CompleteState {
  const meta: CompleteMeta | undefined = tr.getMeta(completeKey);
  if (meta?.kind === "move") return { ...prev, active: meta.active };
  if (meta?.kind === "close") return CLOSED;
  const [before, after] = [old.selection, state.selection];
  if (
    before.empty === after.empty &&
    before.$head.parent === after.$head.parent &&
    before.$head.parentOffset === after.$head.parentOffset
  )
    return prev;
  return moved(state, given);
}

function accept(view: EditorView, open: Suggestions, active: number): void {
  const start = view.state.selection.$head.start();
  const item = open.items[active]!;
  const tr = view.state.tr
    .insertText(
      open.next === "times" ? `${item} - ` : item,
      start + open.from,
      start + open.to,
    )
    .scrollIntoView();
  view.dispatch(open.next === "close" ? tr.setMeta(completeKey, CLOSE) : tr);
}

/** The keys of an open list; false: the key passes. */
function handled(
  view: EditorView,
  event: KeyboardEvent,
  { open, active }: CompleteState,
): boolean {
  if (open === null) return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
    return false;
  const last = open.items.length - 1;
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp": {
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(last, Math.max(0, active + step));
      view.dispatch(
        view.state.tr.setMeta(completeKey, { kind: "move", active: next }),
      );
      return true;
    }
    case "Enter":
    case "Tab":
      accept(view, open, active);
      return true;
    case "Escape":
      event.stopPropagation();
      view.dispatch(view.state.tr.setMeta(completeKey, CLOSE));
      return true;
    default:
      return false;
  }
}

interface CompleteOptions {
  layer: HTMLElement;
  frames: Frames;
  timers: Timers;
  /** The host's names, offered beside the script's. */
  projectNames: readonly string[];
}

/** Collects the names when it starts and after a change, and shows, places and hides the list as the state says. */
function completeView(
  view: EditorView,
  parts: {
    popover: CompletePopover;
    options: CompleteOptions;
    setNames(names: Names): void;
  },
): PluginView {
  const { popover, options } = parts;
  let cancelTimer: (() => void) | null = null;
  let cancelFrame: (() => void) | null = null;
  const collect = () => {
    cancelTimer = null;
    const pagination = paginationKey.getState(view.state);
    if (view.composing || pagination?.frozen === true) later();
    else if (pagination !== undefined)
      parts.setNames(collectNames(pagination.index.blocks));
    else parts.setNames(namesWithInk(collectInkNames(view.state.doc)));
  };
  const later = () => {
    cancelTimer ??= options.timers.schedule(collect, NAMES_EVERY_MS);
  };
  const place = () => {
    cancelFrame = null;
    const caret = view.coordsAtPos(view.state.selection.head);
    const box = options.layer.getBoundingClientRect();
    popover.place(caret.left - box.left, caret.bottom - box.top);
  };
  const draw = () => {
    const { open, active } = completeKey.getState(view.state)!;
    cancelFrame?.();
    cancelFrame = null;
    if (open === null) popover.hide();
    else if (!view.composing) {
      popover.show(open.items, active);
      cancelFrame = options.frames.request(place);
    }
  };
  collect();
  return {
    update(_, prev) {
      if (view.state.doc !== prev.doc) later();
      if (completeKey.getState(view.state) !== completeKey.getState(prev))
        draw();
    },
    destroy() {
      cancelTimer?.();
      cancelFrame?.();
      popover.hide();
    },
  };
}

/**
 * The list of what the completion sources offer at the caret, drawn in `layer` and placed in a frame under the
 * caret; focus stays on the page. Names are collected when the view starts and then at most every 250 ms after a
 * change, by a timer that waits while an input method composes. Placed before the element keys.
 */
export function completePlugin(options: CompleteOptions): Plugin {
  const popover = createCompletePopover({ layer: options.layer });
  let given: Given = {
    names: {
      characters: new Map(),
      locations: new Map(),
      times: new Map(),
      transitions: new Map(),
      slugs: new Map(),
    },
    projectNames: options.projectNames,
  };
  return new Plugin<CompleteState>({
    key: completeKey,
    state: {
      init: () => CLOSED,
      apply: (tr, prev, old, state) => applied(tr, prev, old, state, given),
    },
    props: {
      attributes: (state) => {
        const { open, active } = completeKey.getState(state)!;
        return popover.attributes(open !== null, active);
      },
      handleKeyDown: (view, event) =>
        !view.composing &&
        !event.isComposing &&
        handled(view, event, completeKey.getState(view.state)!),
    },
    view: (view) =>
      completeView(view, {
        popover,
        options,
        setNames: (names) => {
          given = { ...given, names };
        },
      }),
  });
}
