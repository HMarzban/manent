// Tracks remote carets across document edits in the same transaction so a collaborator's caret moves
// with every typed character without waiting for a throttled awareness packet to arrive.
import type { EditorState } from "prosemirror-state";
import { blockPos } from "../pagination/block-index.ts";
import type {
  BlockPlace,
  CursorPlace,
  RemoteCursor,
} from "../script-editor/ports.ts";
import { blockNear, currentIndex, HINT_WINDOW } from "./place.ts";

/**
 * How long a lagging awareness packet inside the same block defers to a forward CRDT-tracked offset, ms.
 * Covers sender throttle + server awareness batch + network RTT without delaying intentional backward moves.
 */
const TRAILING_GRACE_MS = 350;

/** The last awareness place received for a peer and its live doc-tracked place. */
export interface TrackedCursor {
  readonly base: CursorPlace;
  readonly place: CursorPlace;
  /** When `place` was last advanced by a remote document edit; -Infinity when not doc-tracked. */
  readonly trackedAt: number;
}

const sameBlockPlace = (a: BlockPlace, b: BlockPlace): boolean =>
  a.blockId === b.blockId && a.offset === b.offset;

export const sameCursorPlace = (a: CursorPlace, b: CursorPlace): boolean =>
  sameBlockPlace(a.anchor, b.anchor) && sameBlockPlace(a.head, b.head);

const isCollapsed = (place: CursorPlace): boolean =>
  sameBlockPlace(place.anchor, place.head);

/** The text content and current index of `blockId` near `hint`; null when outside HINT_WINDOW. */
function blockTextNear(
  state: EditorState,
  blockId: string,
  hint: number,
): { text: string; at: number } | null {
  const index = currentIndex(state);
  if (index !== null) {
    const at = blockNear(index, blockId, hint);
    if (at === null) return null;
    const node = state.doc.nodeAt(blockPos(index, at));
    return node === null ? null : { text: node.textContent, at };
  }
  const first = hint - HINT_WINDOW;
  const last = hint + HINT_WINDOW;
  let block = 0;
  for (let s = 0; s < state.doc.childCount && block <= last; s++) {
    const section = state.doc.child(s);
    if (block + section.childCount > first) {
      const from = Math.max(0, first - block);
      const to = Math.min(section.childCount - 1, last - block);
      for (let i = from; i <= to; i++) {
        const node = section.child(i);
        if (node.attrs.id === blockId)
          return { text: node.textContent, at: block + i };
      }
    }
    block += section.childCount;
  }
  return null;
}

/**
 * Maps `offset` across a single-span text change from `oldText` to `newText`.
 * When `advanceAtEdit` is true (a remote edit), an insertion right at `offset` pushes the caret
 * past the newly typed characters; otherwise it stays before locally inserted text.
 */
export function shiftOffset(
  oldText: string,
  newText: string,
  offset: number,
  advanceAtEdit: boolean,
): number {
  if (oldText === newText) return Math.min(Math.max(0, offset), newText.length);
  const oldLen = oldText.length;
  const newLen = newText.length;
  const minLen = Math.min(oldLen, newLen);
  let prefix = 0;
  while (
    prefix < minLen &&
    oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)
  )
    prefix += 1;
  const maxSuffix = minLen - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldLen - 1 - suffix) ===
      newText.charCodeAt(newLen - 1 - suffix)
  )
    suffix += 1;
  const oldEnd = oldLen - suffix;
  const newEnd = newLen - suffix;
  if (offset < prefix) return offset;
  if (offset > oldEnd) return offset + (newLen - oldLen);
  if (offset === prefix && oldEnd === prefix)
    return advanceAtEdit ? newEnd : offset;
  return newEnd;
}

/** Maps one block place across a document change, returning the updated place and block index when found. */
function adjustBlockPlace(
  oldState: EditorState,
  newState: EditorState,
  place: BlockPlace,
  hint: number,
  advanceAtEdit: boolean,
): { place: BlockPlace; at: number; moved: boolean } | null {
  const before = blockTextNear(oldState, place.blockId, hint);
  const after = blockTextNear(newState, place.blockId, before?.at ?? hint);
  if (before === null || after === null) return null;
  const offset = shiftOffset(
    before.text,
    after.text,
    place.offset,
    advanceAtEdit,
  );
  const moved = offset !== place.offset || after.at !== hint;
  return {
    place: moved ? { blockId: place.blockId, offset } : place,
    at: after.at,
    moved,
  };
}

/**
 * Advances tracked remote cursor places across `oldState -> newState` synchronously.
 * `cursors` is returned with adjusted `place` values whenever any cursor's block text or index changed.
 */
export function adjustForDocChange(
  oldState: EditorState,
  newState: EditorState,
  cursors: readonly RemoteCursor[],
  tracked: ReadonlyMap<string, TrackedCursor>,
  remote: boolean,
  now: number,
): {
  cursors: readonly RemoteCursor[];
  tracked: ReadonlyMap<string, TrackedCursor>;
  changed: boolean;
} {
  if (cursors.length === 0) return { cursors, tracked, changed: false };
  let changed = false;
  const nextTracked = new Map(tracked);
  const nextCursors = cursors.map((cursor) => {
    const entry = tracked.get(cursor.key);
    const current = entry?.place ?? cursor.place;
    const head = adjustBlockPlace(
      oldState,
      newState,
      current.head,
      current.at,
      remote,
    );
    if (head === null) return cursor;
    const sameEnd = sameBlockPlace(current.anchor, current.head);
    const anchor = sameEnd
      ? head
      : adjustBlockPlace(
          oldState,
          newState,
          current.anchor,
          current.at,
          remote,
        );
    const nextPlace: CursorPlace = {
      anchor: anchor?.place ?? current.anchor,
      head: head.place,
      at: head.at,
    };
    const offsetChanged = !sameCursorPlace(nextPlace, current);
    if (!offsetChanged && nextPlace.at === current.at) return cursor;
    changed = true;
    nextTracked.set(cursor.key, {
      base: entry?.base ?? cursor.place,
      place: nextPlace,
      trackedAt:
        remote && offsetChanged ? now : (entry?.trackedAt ?? -Infinity),
    });
    return {
      ...cursor,
      place: nextPlace,
      movedAt:
        remote && offsetChanged
          ? Math.max(cursor.movedAt, now)
          : cursor.movedAt,
    };
  });
  return {
    cursors: changed ? nextCursors : cursors,
    tracked: changed ? nextTracked : tracked,
    changed,
  };
}

/**
 * Reconciles incoming awareness `cursors` with our doc-tracked places:
 * - Unchanged awareness keeps the live CRDT-tracked place so unrelated redraws never snap backward.
 * - A lagging awareness update catching up to a recent forward remote typing burst inside the same
 *   block keeps the live forward offset so carets never jitter backward mid-word.
 */
export function reconcileCursors(
  nextCursors: readonly RemoteCursor[],
  prevTracked: ReadonlyMap<string, TrackedCursor>,
  now: number,
): {
  cursors: readonly RemoteCursor[];
  tracked: ReadonlyMap<string, TrackedCursor>;
} {
  const tracked = new Map<string, TrackedCursor>();
  const cursors = nextCursors.map((cursor) => {
    const prev = prevTracked.get(cursor.key);
    if (prev === undefined) {
      tracked.set(cursor.key, {
        base: cursor.place,
        place: cursor.place,
        trackedAt: -Infinity,
      });
      return cursor;
    }
    if (sameCursorPlace(cursor.place, prev.base)) {
      tracked.set(cursor.key, prev);
      return sameCursorPlace(prev.place, cursor.place)
        ? cursor
        : { ...cursor, place: prev.place };
    }
    const laggingBurst =
      isCollapsed(cursor.place) &&
      isCollapsed(prev.place) &&
      cursor.place.head.blockId === prev.place.head.blockId &&
      cursor.place.head.blockId === prev.base.head.blockId &&
      cursor.place.head.offset > prev.base.head.offset &&
      cursor.place.head.offset < prev.place.head.offset &&
      now - prev.trackedAt < TRAILING_GRACE_MS;
    if (laggingBurst) {
      tracked.set(cursor.key, {
        base: cursor.place,
        place: prev.place,
        trackedAt: prev.trackedAt,
      });
      return { ...cursor, place: prev.place };
    }
    tracked.set(cursor.key, {
      base: cursor.place,
      place: cursor.place,
      trackedAt: -Infinity,
    });
    return cursor;
  });
  return { cursors, tracked };
}
