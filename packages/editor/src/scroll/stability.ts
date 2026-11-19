// The reader's line stays still when someone else edits above it: the scroll moves by the height the change added,
// worked out from the pages and never by measuring them, so a section that is not rendered costs nothing more.
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  blockNumber,
  currentIndex,
  placeOf,
  positionOf,
} from "../cursors/place.ts";
import { updateIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import { anchorShiftPx } from "./anchor.ts";
import { savedPlaceOf } from "./saved-place.ts";
import { holdLine, isInView } from "./typewriter.ts";

/** The layout reads the scroll rules need, supplied by whoever mounts the editor. */
export interface ScrollPorts {
  scroller(): HTMLElement;
  /** The page's zoom factor, 1 at 100 %. */
  zoom(): number;
  /** The caret's top in the viewport, px; null without a collapsed caret. */
  caretTop(view: EditorView): number | null;
  /** The block at the scroller's top edge and how far its top is above that edge, px; null when there is none. */
  topBlock(view: EditorView): { block: number; offsetPx: number } | null;
  /** The viewport top of a rendered block, px, read without pages (Ink); null when it is not rendered. */
  blockTop(view: EditorView, block: number): number | null;
}

// Document changes so far, by whom: an update made by someone else is one in which `remote` moved.
interface Changes {
  readonly remote: number;
  readonly local: number;
}

const changesKey = new PluginKey<Changes>("scroll");

// What the reader reads: a block, and what its place is judged by after a change.
type Anchor =
  | {
      readonly kind: "pages";
      readonly block: number;
      readonly pages: PaginationState;
    }
  | {
      readonly kind: "flow";
      readonly block: number;
      readonly blockId: string;
      readonly top: number;
    };

/** The caret's block when the caret is in view, else the block at the top. */
function readAnchor(
  view: EditorView,
  ports: ScrollPorts,
  scroller: HTMLElement,
): Anchor | null {
  const { state } = view;
  const place = placeOf(state);
  const caret =
    place !== null && isInView(scroller, ports.caretTop(view)) ? place : null;
  const block = caret?.at ?? ports.topBlock(view)?.block ?? null;
  if (block === null) return null;
  const pages = paginationKey.getState(state);
  if (pages !== undefined)
    return currentIndex(state) === null
      ? null
      : { kind: "pages", block, pages };
  const blockId =
    caret?.head.blockId ?? savedPlaceOf(view, ports)?.top.blockId ?? null;
  const top = ports.blockTop(view, block);
  return blockId === null || top === null
    ? null
    : { kind: "flow", block, blockId, top };
}

/** How far the anchor moved since it was read, px on screen; 0 when the change was at or below it, or took it away. */
function shiftOf(view: EditorView, anchor: Anchor, ports: ScrollPorts): number {
  const { state } = view;
  if (anchor.kind === "flow") {
    const pos = positionOf(
      state,
      { blockId: anchor.blockId, offset: 0 },
      anchor.block,
    );
    const top =
      pos === null
        ? null
        : ports.blockTop(view, blockNumber(state, state.doc.resolve(pos)));
    return top === null ? 0 : top - anchor.top;
  }
  const pages = paginationKey.getState(state);
  if (pages === undefined) return 0;
  const { change } = updateIndex(
    anchor.pages.index,
    pages.index.doc,
    pages.settings.layout,
  );
  if (change === null) return 0;
  // an anchor before the end of what the change replaced lands before the end of what it wrote, which moves nothing
  return (
    anchorShiftPx(
      anchor.pages.pagination,
      pages.pagination,
      pages.settings.engine,
      change,
      anchor.block + change.newEnd - change.oldEnd,
    ) * ports.zoom()
  );
}

type ScrollOptions = ScrollPorts & {
  isRemote(tr: Transaction): boolean;
  typewriter(): boolean;
};

function scrollView(view: EditorView, options: ScrollOptions): PluginView {
  const scroller = options.scroller();
  const anchoring = scroller.style.getPropertyValue("overflow-anchor");
  // the browser's own scroll anchoring would correct a remote change a second time
  scroller.style.setProperty("overflow-anchor", "none");
  const line = holdLine(scroller, (at) => options.caretTop(at));
  let anchor: Anchor | null = null;
  // a remote change came while an input method was composing: it is corrected once the composition ends
  let pending = false;
  // the scroll as this plugin left it, so that a scroll by the person can be told from its own
  let settled = scroller.scrollTop;
  const record = () => {
    if (!view.composing) anchor = readAnchor(view, options, scroller);
  };
  // a browser fires scroll events at most once a frame
  const onScroll = () => {
    if (Math.abs(scroller.scrollTop - settled) >= 1) line.release();
    settled = scroller.scrollTop;
    record();
  };
  scroller.addEventListener("scroll", onScroll);
  return {
    update(_, prev: EditorState) {
      const was = changesKey.getState(prev)!;
      const now = changesKey.getState(view.state)!;
      const remote = now.remote !== was.remote;
      if (view.composing) {
        pending ||= remote;
        return;
      }
      if (remote || pending) {
        pending = false;
        const shift = anchor === null ? 0 : shiftOf(view, anchor, options);
        if (shift !== 0) scroller.scrollTop += shift;
        record();
      } else if (now.local !== was.local) {
        if (options.typewriter()) line.typed(view);
        else line.release();
        record();
      } else if (!prev.selection.eq(view.state.selection)) {
        line.release();
        record();
      }
      settled = scroller.scrollTop;
    },
    destroy() {
      scroller.removeEventListener("scroll", onScroll);
      scroller.style.setProperty("overflow-anchor", anchoring);
    },
  };
}

/**
 * Keeps the line being read still when a remote change lands above it and, while `typewriter()` holds, the line
 * being written at one height. It comes after the typesetting plugins, so the caret has its own rule applied first.
 */
export function scrollPlugin(options: ScrollOptions): Plugin {
  return new Plugin<Changes>({
    key: changesKey,
    state: {
      init: () => ({ remote: 0, local: 0 }),
      apply: (tr, prev) => {
        if (!tr.docChanged) return prev;
        return options.isRemote(tr)
          ? { ...prev, remote: prev.remote + 1 }
          : { ...prev, local: prev.local + 1 };
      },
    },
    view: (view) => scrollView(view, options),
  });
}
