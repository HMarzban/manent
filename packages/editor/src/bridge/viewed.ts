// Ghost follow publisher: tracks the outline heading currently inside the editor viewport's reading zone on passive scroll.
import type { FormatId } from "@manent/schema";
import type { EditorView } from "prosemirror-view";
import { paginationKey } from "../pagination/plugin.ts";
import type { Frames } from "../script-editor/ports.ts";
import { headingAt } from "./outline.ts";
import type { OutlineIndex } from "./outline.ts";

export interface ViewedScrollPort {
  scroller(): HTMLElement;
  viewedBlock?(view: EditorView): number | null;
}

/** The index in `headingBlocks` of the last entry at or before `block`; null before the first. */
function entryAt(headingBlocks: Int32Array, block: number): number | null {
  let lo = 0;
  let hi = headingBlocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (headingBlocks[mid]! <= block) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? lo - 1 : null;
}

/**
 * Listens passively to the editor scroller and publishes the heading currently in view on the next animation frame,
 * emitting only when the viewed heading changes. Never walks the document or runs inside a transaction.
 */
export function viewedPublisher(options: {
  view: EditorView;
  scroll: ViewedScrollPort | undefined;
  outline: () => OutlineIndex;
  format: () => FormatId;
  frames: Frames;
  publish: ((blockId: string | null) => void) | undefined;
}): { request(): void; destroy(): void } {
  const { view, scroll, outline, format, frames, publish } = options;
  const viewedBlock = scroll?.viewedBlock;
  if (
    scroll === undefined ||
    viewedBlock === undefined ||
    publish === undefined
  )
    return { request() {}, destroy() {} };

  let lastId: string | null | undefined;
  let cancelFrame: (() => void) | null = null;
  let destroyed = false;

  const read = (): void => {
    cancelFrame = null;
    if (destroyed || view.isDestroyed) return;
    if (paginationKey.getState(view.state)?.frozen === true) return;
    const block = viewedBlock(view);
    if (block === null) return;
    const current = outline();
    const index =
      format() === "ink"
        ? entryAt(current.headingBlocks, block)
        : headingAt(current, block);
    const nextId =
      index === null ? null : (current.entries[index]?.blockId ?? null);
    if (nextId === lastId) return;
    lastId = nextId;
    publish(nextId);
  };

  const request = (): void => {
    if (destroyed) return;
    cancelFrame ??= frames.request(read);
  };

  const scroller = scroll.scroller();
  scroller.addEventListener("scroll", request, { passive: true });
  request();

  return {
    request,
    destroy() {
      destroyed = true;
      cancelFrame?.();
      cancelFrame = null;
      scroller.removeEventListener("scroll", request);
    },
  };
}
