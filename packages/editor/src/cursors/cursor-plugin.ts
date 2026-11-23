// Other people's carets and selections, drawn as decorations from the places they publish: at most once a frame,
// never while an input method composes, and found near each place's hint so that drawing never walks the script.
// Only the people the shown filter names are drawn.
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type {
  Frames,
  PresencePort,
  RemoteCursor,
  Timers,
} from "../script-editor/ports.ts";
import { placeOf, positionOf } from "./place.ts";

/** How long a caret's tab shows its person's name after they last moved, ms; then it shows their initials. */
export const NAME_TAB_MS = 3000;
/** The most blocks one person's selection is drawn over, counted from its head. */
export const MAX_SELECTION_BLOCKS = 200;

/** Whose cursors are drawn: everyone's, or only those of the listed userIds. */
export type ShownCursors = "everyone" | readonly string[];

interface CursorsState {
  /** Every cursor last received, drawn or not. */
  readonly cursors: readonly RemoteCursor[];
  readonly shown: ShownCursors;
  /** The time the tabs were last judged by, ms. */
  readonly now: number;
  readonly decorations: DecorationSet;
}

export const cursorsKey: PluginKey<CursorsState> = new PluginKey("cursors");

// The meta of a draw (the cursors received and the time their tabs are judged by), or of a new filter.
type Meta =
  | {
      readonly type: "draw";
      readonly cursors: readonly RemoteCursor[];
      readonly now: number;
    }
  | { readonly type: "shown"; readonly shown: ShownCursors };

const isNameShown = (cursor: RemoteCursor, now: number): boolean =>
  now - cursor.movedAt < NAME_TAB_MS;

const isSameShown = (a: ShownCursors, b: ShownCursors): boolean =>
  a === b ||
  (a !== "everyone" &&
    b !== "everyone" &&
    a.length === b.length &&
    a.every((userId, i) => userId === b[i]));

function caretOf(
  cursor: RemoteCursor,
  named: boolean,
  listed: boolean,
): (view: EditorView) => HTMLElement {
  return (view) => {
    const doc = view.dom.ownerDocument;
    const caret = doc.createElement("span");
    caret.className = "mn-cursor";
    // a person asked for by name is drawn even where the page hides other people's cursors
    if (listed) caret.style.display = "inline";
    // other people's carets are not part of the text a screen reader reads
    caret.setAttribute("aria-hidden", "true");
    caret.dataset["collab"] = String(cursor.colour);
    const bar = caret.appendChild(doc.createElement("span"));
    bar.className = "mn-cursor-bar";
    const tab = caret.appendChild(doc.createElement("span"));
    tab.className = "mn-cursor-tab";
    tab.textContent = named ? cursor.name : cursor.initials;
    return caret;
  };
}

// The text of each block between `from` and `to`, in document order.
function blockRanges(doc: Node, from: number, to: number): [number, number][] {
  const ranges: [number, number][] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "block") return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + 1 + node.content.size);
    if (start < end) ranges.push([start, end]);
    return false;
  });
  return ranges;
}

function selectionOf(
  state: EditorState,
  cursor: RemoteCursor,
  head: number,
): Decoration[] {
  const { place } = cursor;
  const anchor = positionOf(state, place.anchor, place.at);
  if (anchor === null || anchor === head) return [];
  const ranges = blockRanges(
    state.doc,
    Math.min(anchor, head),
    Math.max(anchor, head),
  );
  const nearest = anchor < head ? ranges.toReversed() : ranges;
  const attrs = {
    nodeName: "mn-remote-sel",
    "data-collab": String(cursor.colour),
  };
  return nearest
    .slice(0, MAX_SELECTION_BLOCKS)
    .map(([start, end]) => Decoration.inline(start, end, attrs));
}

function decorationsOf(
  state: EditorState,
  drawn: Omit<CursorsState, "decorations">,
): DecorationSet {
  const { cursors, shown, now } = drawn;
  const listed = shown !== "everyone";
  const decorations: Decoration[] = [];
  for (const cursor of cursors) {
    if (listed && !shown.includes(cursor.userId)) continue;
    const head = positionOf(state, cursor.place.head, cursor.place.at);
    if (head === null) continue;
    const named = isNameShown(cursor, now);
    decorations.push(
      Decoration.widget(head, caretOf(cursor, named, listed), {
        key: `cursor:${cursor.key}:${cursor.colour}:${named}${listed ? ":listed" : ""}`,
      }),
      ...selectionOf(state, cursor, head),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

// The time until the first name drawn at `now` gives way to initials; null when none is drawn.
function nextNameEnd(
  cursors: readonly RemoteCursor[],
  now: number,
): number | null {
  const ends = cursors
    .filter((cursor) => isNameShown(cursor, now))
    .map((cursor) => cursor.movedAt + NAME_TAB_MS - now);
  return ends.length === 0 ? null : Math.min(...ends);
}

interface CursorsOptions {
  readonly presence: PresencePort;
  readonly frames: Frames;
  readonly timers: Timers;
}

function cursorsView(view: EditorView, options: CursorsOptions): PluginView {
  const { presence, frames, timers } = options;
  let received: readonly RemoteCursor[] = [];
  let cancelFrame: (() => void) | null = null;
  let cancelTimer: (() => void) | null = null;
  // a frame came while an input method was composing; the draw waits for the composition's end
  let waiting = false;
  const draw = () => {
    cancelFrame = null;
    if (view.isDestroyed) return;
    if (view.composing) {
      waiting = true;
      return;
    }
    const now = timers.now();
    const meta: Meta = { type: "draw", cursors: received, now };
    view.dispatch(
      view.state.tr.setMeta(cursorsKey, meta).setMeta("addToHistory", false),
    );
    cancelTimer?.();
    const end = nextNameEnd(received, now);
    cancelTimer = end === null ? null : timers.schedule(request, end);
  };
  const request = () => {
    cancelFrame ??= frames.request(draw);
  };
  const resume = () => {
    if (!waiting) return;
    waiting = false;
    request();
  };
  const unsubscribe = presence.subscribe((cursors) => {
    received = cursors;
    request();
  });
  view.dom.addEventListener("compositionend", resume);
  return {
    update(_: EditorView, prev: EditorState) {
      const { state } = view;
      if (prev.doc === state.doc && prev.selection.eq(state.selection)) return;
      presence.publish(placeOf(state));
      // a change can move or remove the blocks a place names: the cursors are found again
      if (prev.doc !== state.doc && received.length > 0) request();
    },
    destroy() {
      unsubscribe();
      cancelFrame?.();
      cancelTimer?.();
      view.dom.removeEventListener("compositionend", resume);
    },
  };
}

/** Draws only the cursors of `shown` from now on; nothing changes when it names the people already shown. */
export function setShownCursors(view: EditorView, shown: ShownCursors): void {
  const drawn = cursorsKey.getState(view.state);
  if (drawn === undefined || isSameShown(drawn.shown, shown)) return;
  const meta: Meta = { type: "shown", shown };
  view.dispatch(
    view.state.tr.setMeta(cursorsKey, meta).setMeta("addToHistory", false),
  );
}

// The cursors received or the filter replaced, and the decorations drawn again from them.
function afterMeta(
  state: EditorState,
  prev: CursorsState,
  meta: Meta,
): CursorsState {
  const drawn =
    meta.type === "draw"
      ? { cursors: meta.cursors, shown: prev.shown, now: meta.now }
      : { cursors: prev.cursors, shown: meta.shown, now: prev.now };
  return { ...drawn, decorations: decorationsOf(state, drawn) };
}

/**
 * Draws the cursors `presence` reports that the shown filter names (everyone's until `setShownCursors` says
 * otherwise), and publishes the local caret after each update that moves it or the text.
 */
export function cursorsPlugin(options: CursorsOptions): Plugin {
  return new Plugin<CursorsState>({
    key: cursorsKey,
    state: {
      init: () => ({
        cursors: [],
        shown: "everyone",
        now: 0,
        decorations: DecorationSet.empty,
      }),
      apply: (tr, prev, _old, state) => {
        const meta: Meta | undefined = tr.getMeta(cursorsKey);
        if (meta !== undefined) return afterMeta(state, prev, meta);
        if (!tr.docChanged) return prev;
        return {
          ...prev,
          decorations: prev.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    view: (view) => cursorsView(view, options),
    props: {
      decorations: (state) => cursorsKey.getState(state)?.decorations,
    },
  });
}
