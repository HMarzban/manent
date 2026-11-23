// The dashed underline under each annotation's range on the page.
import { Decoration, DecorationSet } from "prosemirror-view";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import type { Place } from "./anchor-places.ts";

/**
 * One underline per placed range of `index.doc`, its own element so it stacks with the other marks, filled while
 * its annotation is open or the marker of its block (`hovered`, a block id) is under the pointer. An empty or
 * removed range draws nothing.
 */
export function underlinesOf(
  index: BlockIndex,
  places: readonly Place[],
  hovered: string | null,
): DecorationSet {
  const decorations: Decoration[] = [];
  for (const { annotation, anchor, block } of places) {
    if (block === null || anchor.start === anchor.end) continue;
    const at = blockPos(index, block) + 1;
    const filled = annotation.open || anchor.blockId === hovered;
    decorations.push(
      Decoration.inline(at + anchor.start, at + anchor.end, {
        nodeName: "mn-comment",
        class: "mn-comment",
        ...(filled ? { "data-active": "" } : {}),
      }),
    );
  }
  return DecorationSet.create(index.doc, decorations);
}
