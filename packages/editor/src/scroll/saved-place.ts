// Where a person left a script, as block ids and offsets so that it holds after any change, and how it is restored
// when the script opens again: the selection, then the block at the top of the view.
import type { EditorState } from "prosemirror-state";
import { Selection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  blockIdAt,
  currentIndex,
  placeOf,
  positionOf,
} from "../cursors/place.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { SavedPlace } from "../script-editor/ports.ts";
import { blockTopPx } from "./anchor.ts";
import type { ScrollPorts } from "./stability.ts";

// A page under a screen cannot be hit-tested, so the caret's block, measured from the view's top, stands in for the top block.
function caretBlockTop(
  view: EditorView,
  ports: ScrollPorts,
  blockId: string,
): { block: number; offsetPx: number } | null {
  const block = blocksOf(view.state, [blockId]).get(blockId);
  if (block === undefined) return null;
  const top = ports.blockTop(view, block);
  if (top === null) return null;
  return {
    block,
    offsetPx: ports.scroller().getBoundingClientRect().top - top,
  };
}

/** The selection, and the block at the top of the view with how far its top sits above the view's top at 100 %; null when either is not in a block. */
export function savedPlaceOf(
  view: EditorView,
  ports: ScrollPorts,
): SavedPlace | null {
  const place = placeOf(view.state);
  if (place === null) return null;
  const top =
    ports.topBlock(view) ?? caretBlockTop(view, ports, place.head.blockId);
  if (top === null) return null;
  const blockId = blockIdAt(view.state, top.block);
  if (blockId === null) return null;
  return {
    anchor: place.anchor,
    head: place.head,
    top: { blockId, offsetPx: top.offsetPx / ports.zoom() },
  };
}

// The block index of each id, found in one pass over the blocks.
function blocksOf(
  state: EditorState,
  ids: readonly string[],
): Map<string, number> {
  const wanted = new Set(ids);
  const found = new Map<string, number>();
  const index = currentIndex(state);
  if (index !== null) {
    index.blocks.forEach((block, i) => {
      if (wanted.has(block.id)) found.set(block.id, i);
    });
    return found;
  }
  let block = 0;
  state.doc.forEach((section) =>
    section.forEach((node) => {
      const id: unknown = node.attrs.id;
      if (typeof id === "string" && wanted.has(id)) found.set(id, block);
      block++;
    }),
  );
  return found;
}

// Scrolls so that block `block`'s top sits `offsetPx` (at 100 %) above the scroller's top.
function scrollToBlock(
  view: EditorView,
  ports: ScrollPorts,
  block: number,
  offsetPx: number,
): void {
  const zoom = ports.zoom();
  const scroller = ports.scroller();
  const pages = paginationKey.getState(view.state);
  if (pages === undefined) {
    const top = ports.blockTop(view, block);
    if (top === null) return;
    scroller.scrollTop +=
      top - scroller.getBoundingClientRect().top + offsetPx * zoom;
    return;
  }
  // measured from the block now at the top, which the pages place without measuring the ones between
  const now = ports.topBlock(view);
  if (now === null) return;
  const { pagination: p, settings } = pages;
  const between =
    now.block <= block
      ? blockTopPx(p, settings.engine, now.block, block)
      : -blockTopPx(p, settings.engine, block, now.block);
  scroller.scrollTop += between * zoom - now.offsetPx + offsetPx * zoom;
}

/** Sets the selection to the saved one (the document's start when a block of it is gone) and scrolls back to the saved top block. */
export function restorePlace(
  view: EditorView,
  ports: ScrollPorts,
  place: SavedPlace,
): void {
  const { anchor, head, top } = place;
  const found = blocksOf(view.state, [
    anchor.blockId,
    head.blockId,
    top.blockId,
  ]);
  const { state } = view;
  const anchorAt = found.get(anchor.blockId);
  const headAt = found.get(head.blockId);
  const from =
    anchorAt === undefined ? null : positionOf(state, anchor, anchorAt);
  const to = headAt === undefined ? null : positionOf(state, head, headAt);
  view.dispatch(
    state.tr.setSelection(
      from === null || to === null
        ? Selection.atStart(state.doc)
        : TextSelection.create(state.doc, from, to),
    ),
  );
  const topAt = found.get(top.blockId);
  if (topAt !== undefined) scrollToBlock(view, ports, topAt, top.offsetPx);
}
