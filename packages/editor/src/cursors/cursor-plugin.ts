// Other people's carets and selections, drawn as decorations from the places they publish: at most once a frame,
// never while an input method composes, and found near each place's hint so that drawing never walks the script.
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

/** How long a name tab shows after its person last moved, ms. */
export const NAME_TAB_MS = 3000;
/** The most blocks one person's selection is drawn over, counted from its head. */
export const MAX_SELECTION_BLOCKS = 200;

interface CursorsState {
  readonly cursors: readonly RemoteCursor[];
  readonly decorations: DecorationSet;
}

export const cursorsKey: PluginKey<CursorsState> = new PluginKey("cursors");

// The meta of a draw: the cursors to draw and the time their name tabs are judged by.
interface Draw {
  readonly cursors: readonly RemoteCursor[];
  readonly now: number;
}

const isTabShown = (cursor: RemoteCursor, now: number): boolean =>
  now - cursor.movedAt < NAME_TAB_MS;

function caretOf(
  cursor: RemoteCursor,
  tab: boolean,
): (view: EditorView) => HTMLElement {
  return (view) => {
    const doc = view.dom.ownerDocument;
    const caret = doc.createElement("span");
    caret.className = "mn-cursor";
    // other people's carets are not part of the text a screen reader reads
    caret.setAttribute("aria-hidden", "true");
    caret.dataset["collab"] = String(cursor.colour);
    const bar = caret.appendChild(doc.createElement("span"));
    bar.className = "mn-cursor-bar";
    if (tab) {
      const name = caret.appendChild(doc.createElement("span"));
      name.className = "mn-cursor-tab";
      name.textContent = cursor.name;
    }
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
  cursors: readonly RemoteCursor[],
  now: number,
): DecorationSet {
  const decorations: Decoration[] = [];
  for (const cursor of cursors) {
    const head = positionOf(state, cursor.place.head, cursor.place.at);
    if (head === null) continue;
    const tab = isTabShown(cursor, now);
    decorations.push(
      Decoration.widget(head, caretOf(cursor, tab), {
        key: `cursor:${cursor.key}:${cursor.colour}:${tab}`,
      }),
      ...selectionOf(state, cursor, head),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

// The time until the first name tab drawn at `now` goes; null when none is drawn.
function nextTabEnd(
  cursors: readonly RemoteCursor[],
  now: number,
): number | null {
  const ends = cursors
    .filter((cursor) => isTabShown(cursor, now))
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
    const meta: Draw = { cursors: received, now };
    view.dispatch(
      view.state.tr.setMeta(cursorsKey, meta).setMeta("addToHistory", false),
    );
    cancelTimer?.();
    const end = nextTabEnd(received, now);
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

/** Draws the cursors `presence` reports, and publishes the local caret after each update that moves it or the text. */
export function cursorsPlugin(options: CursorsOptions): Plugin {
  return new Plugin<CursorsState>({
    key: cursorsKey,
    state: {
      init: () => ({ cursors: [], decorations: DecorationSet.empty }),
      apply: (tr, prev, _old, state) => {
        const draw: Draw | undefined = tr.getMeta(cursorsKey);
        if (draw !== undefined)
          return {
            cursors: draw.cursors,
            decorations: decorationsOf(state, draw.cursors, draw.now),
          };
        if (!tr.docChanged) return prev;
        return {
          cursors: prev.cursors,
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
