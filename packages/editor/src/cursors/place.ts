// Where a caret is, said as block ids and offsets so that it survives any change around it, and found again near
// the block index it was sent with instead of by a walk of the script.
import type { Node, ResolvedPos } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { BlockPlace, CursorPlace } from "../script-editor/ports.ts";

/** Blocks searched on each side of a cursor's hint. */
export const HINT_WINDOW = 200;

/**
 * The pagination plugin's index when it describes this document; null without pages, or while a composition holds
 * the index of the document before it.
 */
export function currentIndex(state: EditorState): BlockIndex | null {
  const index = paginationKey.getState(state)?.index;
  return index !== undefined && index.doc === state.doc ? index : null;
}

// Positions inside a block sit at depth 2: the document, a section, the block.
function blockPlaceAt($pos: ResolvedPos): BlockPlace | null {
  if ($pos.depth !== 2) return null;
  const id: unknown = $pos.parent.attrs.id;
  return typeof id === "string"
    ? { blockId: id, offset: $pos.parentOffset }
    : null;
}

/** The index of the block holding a position inside a block, counted in document order across sections. */
export function blockNumber(state: EditorState, $pos: ResolvedPos): number {
  const section = $pos.index(0);
  const index = currentIndex(state);
  if (index !== null) return index.sectionStart[section]! + $pos.index(1);
  let before = 0;
  for (let s = 0; s < section; s++) before += state.doc.child(s).childCount;
  return before + $pos.index(1);
}

/** The local selection as block ids and offsets and the head block's index; null when an end of it is not inside a block. */
export function placeOf(state: EditorState): CursorPlace | null {
  const { $anchor, $head } = state.selection;
  const anchor = blockPlaceAt($anchor);
  const head = blockPlaceAt($head);
  if (anchor === null || head === null) return null;
  return { anchor, head, at: blockNumber(state, $head) };
}

// The position `offset` into the block that starts at `pos`; an offset past its text stops at the text's end.
function inside(block: Node, pos: number, offset: number): number {
  return pos + 1 + Math.min(Math.max(0, offset), block.content.size);
}

function foundInIndex(
  state: EditorState,
  index: BlockIndex,
  place: BlockPlace,
  hint: number,
): number | null {
  const last = Math.min(index.blocks.length - 1, hint + HINT_WINDOW);
  for (let i = Math.max(0, hint - HINT_WINDOW); i <= last; i++) {
    if (index.blocks[i]!.id !== place.blockId) continue;
    const pos = blockPos(index, i);
    return inside(state.doc.nodeAt(pos)!, pos, place.offset);
  }
  return null;
}

// The place in the blocks `from` to `to` of a section that starts at `pos`, counted inside the section.
function foundInSection(
  section: Node,
  pos: number,
  from: number,
  to: number,
  place: BlockPlace,
): number | null {
  let at = pos + 1;
  for (let i = 0; i <= to && i < section.childCount; i++) {
    const block = section.child(i);
    if (i >= from && block.attrs.id === place.blockId)
      return inside(block, at, place.offset);
    at += block.nodeSize;
  }
  return null;
}

// Without a current index: the sections are counted until the window, and only the blocks inside it are read.
function foundInSections(
  doc: Node,
  place: BlockPlace,
  hint: number,
): number | null {
  const first = hint - HINT_WINDOW;
  const last = hint + HINT_WINDOW;
  let block = 0;
  let pos = 0;
  for (let s = 0; s < doc.childCount && block <= last; s++) {
    const section = doc.child(s);
    const found =
      block + section.childCount > first
        ? foundInSection(section, pos, first - block, last - block, place)
        : null;
    if (found !== null) return found;
    block += section.childCount;
    pos += section.nodeSize;
  }
  return null;
}

/** The position of a place; null when its block is not within HINT_WINDOW blocks of `hint`. */
export function positionOf(
  state: EditorState,
  place: BlockPlace,
  hint: number,
): number | null {
  const index = currentIndex(state);
  return index === null
    ? foundInSections(state.doc, place, hint)
    : foundInIndex(state, index, place, hint);
}
