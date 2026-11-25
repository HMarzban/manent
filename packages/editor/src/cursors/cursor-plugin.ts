// Other people's carets and selections, drawn as decorations from the places they publish: at most once a frame,
// never while an input method composes, and found near each place's hint so that drawing never walks the script.
// Only the people the shown filter names are drawn.
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import type {
  CursorPlace,
  Frames,
  PresencePort,
  RemoteCursor,
  Timers,
} from "../script-editor/ports.ts";
import { placeOf, positionOf } from "./place.ts";
import { adjustForDocChange, reconcileCursors } from "./track.ts";
import type { TrackedCursor } from "./track.ts";

/** How long a caret's tab shows its person's name after they last moved, ms; then it shows their initials. */
export const NAME_TAB_MS = 3000;
/** How long a person counts as typing after their caret last moved, ms: a longer pause stops their typing mark. */
const MOVING_MS = 1500;
/** The most blocks one person's selection is drawn over, counted from its head. */
export const MAX_SELECTION_BLOCKS = 200;

// the key of every caret's widget starts with this
const CARET_KEY = "cursor:";

/** Whose cursors are drawn: everyone's, or only those of the listed userIds. */
export type ShownCursors = "everyone" | readonly string[];

interface CursorsState {
  /** Every cursor last received, drawn or not. */
  readonly cursors: readonly RemoteCursor[];
  readonly shown: ShownCursors;
  /** The time the tabs, and who is moving, were last judged by, ms. */
  readonly now: number;
  /** Live CRDT-tracked cursor places keyed by cursor key, preventing lag and backward snaps. */
  readonly tracked: ReadonlyMap<string, TrackedCursor>;
  /**
   * Where each cursor drawn was last found, by its key: a caret stays there while its place is in a block this page
   * does not hold yet, since a person's caret may arrive before the line they typed it in.
   */
  readonly found: ReadonlyMap<string, CursorPlace>;
  readonly decorations: DecorationSet;
}

export const cursorsKey: PluginKey<CursorsState> = new PluginKey("cursors");

// The meta of a draw (the cursors received and the time they are judged by), or of a new filter.
type Meta =
  | {
      readonly type: "draw";
      readonly cursors: readonly RemoteCursor[];
      readonly now: number;
    }
  | { readonly type: "shown"; readonly shown: ShownCursors };

const isNameShown = (cursor: RemoteCursor, now: number): boolean =>
  now - cursor.movedAt < NAME_TAB_MS;

/** Whether `cursor` moved within MOVING_MS before `now`, ms: its person is typing. */
export function isMoving(cursor: RemoteCursor, now: number): boolean {
  return now - cursor.movedAt < MOVING_MS;
}

const isSameShown = (a: ShownCursors, b: ShownCursors): boolean =>
  a === b ||
  (a !== "everyone" &&
    b !== "everyone" &&
    a.length === b.length &&
    a.every((userId, i) => userId === b[i]));

const caretCount = (set: DecorationSet): number =>
  set.find(undefined, undefined, (spec: { key?: unknown }) =>
    String(spec.key).startsWith(CARET_KEY),
  ).length;

const eligibleCount = (
  cursors: readonly RemoteCursor[],
  shown: ShownCursors,
): number =>
  shown === "everyone"
    ? cursors.length
    : cursors.filter((each) => shown.includes(each.userId)).length;

function caretOf(
  cursor: RemoteCursor,
  named: boolean,
  listed: boolean,
): (view: EditorView) => HTMLElement {
  return (view) => {
    const doc = view.dom.ownerDocument;
    const caret = doc.createElement("span");
    caret.className = "mn-cursor";
    if (named) caret.dataset["active"] = "";
    else caret.dataset["idle"] = "";
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

// `cursor` at its place, or at the place it was last found while its own is not in this document; null when neither is.
function foundOf(
  state: EditorState,
  cursor: RemoteCursor,
  found: CursorsState["found"],
): { cursor: RemoteCursor; head: number } | null {
  for (const place of [cursor.place, found.get(cursor.key) ?? null]) {
    const head =
      place === null ? null : positionOf(state, place.head, place.at);
    if (place !== null && head !== null)
      return { cursor: { ...cursor, place }, head };
  }
  return null;
}

/** The cursors of `drawn` on `state`: their decorations and where each was found. */
function decorationsOf(
  state: EditorState,
  drawn: Pick<CursorsState, "cursors" | "shown" | "now">,
  before: CursorsState["found"],
): Pick<CursorsState, "decorations" | "found"> {
  const { cursors, shown, now } = drawn;
  const listed = shown !== "everyone";
  const decorations: Decoration[] = [];
  const found = new Map<string, CursorPlace>();
  for (const each of cursors) {
    if (listed && !shown.includes(each.userId)) continue;
    const at = foundOf(state, each, before);
    if (at === null) continue;
    const { cursor, head } = at;
    found.set(cursor.key, cursor.place);
    const named = isNameShown(cursor, now);
    decorations.push(
      Decoration.widget(head, caretOf(cursor, named, listed), {
        key: `${CARET_KEY}${cursor.key}:${cursor.colour}:${named}${listed ? ":listed" : ""}`,
        side: -1,
      }),
      ...selectionOf(state, cursor, head),
    );
  }
  return { decorations: DecorationSet.create(state.doc, decorations), found };
}

// The time until the first person moving at `now` stops, or the first name drawn gives way to initials; null when
// nothing judged at `now` changes later.
function nextChange(
  cursors: readonly RemoteCursor[],
  now: number,
): number | null {
  const ends = cursors
    .flatMap((cursor) =>
      [MOVING_MS, NAME_TAB_MS].map((ms) => cursor.movedAt + ms - now),
    )
    .filter((end) => end > 0);
  return ends.length === 0 ? null : Math.min(...ends);
}

interface CursorsOptions {
  readonly presence: PresencePort;
  readonly frames: Frames;
  readonly timers: Timers;
  /** Whether a transaction arrived from another collaborator rather than local typing. */
  readonly isRemote?: (tr: Transaction) => boolean;
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
    const end = nextChange(received, now);
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
  // the others see this person as soon as the page opens, before the caret first moves
  presence.publish(placeOf(view.state));
  return {
    update(_: EditorView, prev: EditorState) {
      const { state } = view;
      if (prev.doc === state.doc && prev.selection.eq(state.selection)) return;
      presence.publish(placeOf(state));
      // only schedule a follow-up draw when some eligible received cursor is still unplaced in this doc
      if (prev.doc !== state.doc && received.length > 0) {
        const current = cursorsKey.getState(state);
        if (
          current === undefined ||
          current.found.size < eligibleCount(received, current.shown)
        )
          request();
      }
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
  if (meta.type === "shown") {
    const drawn = {
      cursors: prev.cursors,
      shown: meta.shown,
      now: prev.now,
      tracked: prev.tracked,
    };
    return { ...drawn, ...decorationsOf(state, drawn, prev.found) };
  }
  const reconciled = reconcileCursors(meta.cursors, prev.tracked, meta.now);
  const drawn = {
    cursors: reconciled.cursors,
    shown: prev.shown,
    now: meta.now,
    tracked: reconciled.tracked,
  };
  return { ...drawn, ...decorationsOf(state, drawn, prev.found) };
}

/**
 * Draws the cursors `presence` reports that the shown filter names (everyone's until `setShownCursors` says
 * otherwise), and publishes the local caret when the page opens and after each update that moves it or the text.
 */
export function cursorsPlugin(options: CursorsOptions): Plugin {
  const isRemote = options.isRemote ?? (() => false);
  return new Plugin<CursorsState>({
    key: cursorsKey,
    state: {
      init: () => ({
        cursors: [],
        shown: "everyone",
        now: 0,
        tracked: new Map(),
        found: new Map(),
        decorations: DecorationSet.empty,
      }),
      apply: (tr, prev, oldState, state) => {
        const meta: Meta | undefined = tr.getMeta(cursorsKey);
        if (meta !== undefined) return afterMeta(state, prev, meta);
        if (!tr.docChanged || prev.cursors.length === 0) return prev;
        const adjusted = adjustForDocChange(
          oldState,
          state,
          prev.cursors,
          prev.tracked,
          isRemote(tr),
          options.timers.now(),
        );
        const next = adjusted.changed
          ? { ...prev, cursors: adjusted.cursors, tracked: adjusted.tracked }
          : prev;
        const mapped = prev.decorations.map(tr.mapping, tr.doc);
        // a remote change replaces the block or moves text at the caret: redraw synchronously in the same transaction
        const redraw =
          adjusted.changed ||
          caretCount(mapped) !== caretCount(prev.decorations) ||
          prev.found.size < eligibleCount(next.cursors, next.shown);
        return redraw
          ? { ...next, ...decorationsOf(state, next, prev.found) }
          : { ...next, decorations: mapped };
      },
    },
    view: (view) => cursorsView(view, options),
    props: {
      decorations: (state) => cursorsKey.getState(state)?.decorations,
    },
  });
}
