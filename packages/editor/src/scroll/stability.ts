// The reader's line stays still when someone else edits above it: the scroll moves by the height the change added,
// worked out from the pages and never by measuring them, so a section that is not rendered costs nothing more.
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  blockIdAt,
  blockNear,
  blockNumber,
  placeOf,
  positionOf,
} from "../cursors/place.ts";
import { updateIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import { anchorShiftPx } from "./anchor.ts";
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

// What the reader reads: a block by id, looked for again near the index it last had. An anchor read from the
// caret follows the caret through the person's own edits.
interface BlockAnchor {
  readonly by: "caret" | "top";
  readonly blockId: string;
  readonly block: number;
}

interface PagesAnchor extends BlockAnchor {
  readonly kind: "pages";
}

interface FlowAnchor extends BlockAnchor {
  readonly kind: "flow";
  /** Its viewport top when it was last read, px. */
  readonly top: number;
}

type Anchor = PagesAnchor | FlowAnchor;

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
  const blockId = caret?.head.blockId ?? blockIdAt(state, block);
  if (blockId === null) return null;
  const by = caret === null ? "top" : "caret";
  if (paginationKey.getState(state) !== undefined)
    return { kind: "pages", by, blockId, block };
  const top = ports.blockTop(view, block);
  return top === null ? null : { kind: "flow", by, blockId, block, top };
}

/** A caret anchor moved onto the caret's block after the person's own edit, from the selection alone; without pages its top is read again. */
function followed(
  view: EditorView,
  anchor: Anchor,
  ports: ScrollPorts,
): Anchor | null {
  const place = anchor.by === "caret" ? placeOf(view.state) : null;
  if (place === null) return anchor;
  const at = { blockId: place.head.blockId, block: place.at };
  if (anchor.kind === "pages") return { ...anchor, ...at };
  const top = ports.blockTop(view, place.at);
  return top === null ? null : { ...anchor, ...at, top };
}

type Pages = Pick<PaginationState, "settings" | "index" | "pagination">;

/** The pages of the state's own document: while a composition is under way the plugin holds those of the one before it. */
function pagesOf(state: EditorState): Pages | null {
  const pages = paginationKey.getState(state);
  if (pages === undefined) return null;
  if (pages.index.doc === state.doc) return pages;
  const { settings } = pages;
  const { index, change } = updateIndex(
    pages.index,
    state.doc,
    settings.layout,
  );
  const pagination =
    change === null
      ? pages.pagination
      : settings.engine.repaginate(pages.pagination, index.blocks, change);
  return { settings, index, pagination };
}

// Where the anchor is after an update, and how far the update moved it on screen, px.
interface Moved {
  readonly anchor: Anchor;
  readonly shift: number;
}

/** Judged on the change from `prev`'s document alone, so that what was typed or composed before it is not counted. */
function movedOnPages(
  prev: EditorState,
  state: EditorState,
  anchor: PagesAnchor,
  zoom: number,
): Moved | null {
  const before = pagesOf(prev);
  const after = pagesOf(state);
  if (before === null || after === null) return null;
  const from = blockNear(before.index, anchor.blockId, anchor.block);
  if (from === null) return null;
  const { change } = updateIndex(
    before.index,
    state.doc,
    after.settings.layout,
  );
  if (change === null) return { anchor: { ...anchor, block: from }, shift: 0 };
  // a block after what the change replaced moves by the blocks it added; one inside it or before it keeps its index
  const hint =
    from >= change.oldEnd ? from + change.newEnd - change.oldEnd : from;
  const to = blockNear(after.index, anchor.blockId, hint);
  if (to === null) return null;
  const shift = anchorShiftPx(
    before.pagination,
    after.pagination,
    after.settings.engine,
    change,
    to,
  );
  return { anchor: { ...anchor, block: to }, shift: shift * zoom };
}

function movedInFlow(
  view: EditorView,
  anchor: FlowAnchor,
  ports: ScrollPorts,
): Moved | null {
  const { state } = view;
  const pos = positionOf(
    state,
    { blockId: anchor.blockId, offset: 0 },
    anchor.block,
  );
  if (pos === null) return null;
  const block = blockNumber(state, state.doc.resolve(pos));
  const top = ports.blockTop(view, block);
  return top === null
    ? null
    : { anchor: { ...anchor, block, top }, shift: top - anchor.top };
}

/** Null when the update took the anchor's block away, which gives no correction. */
function movedBy(
  view: EditorView,
  prev: EditorState,
  anchor: Anchor,
  ports: ScrollPorts,
): Moved | null {
  return anchor.kind === "pages"
    ? movedOnPages(prev, view.state, anchor, ports.zoom())
    : movedInFlow(view, anchor, ports);
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
  // what remote changes have moved the anchor by, px, until it is corrected; null when no remote change waits
  let owed: number | null = null;
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
      if (now.remote !== was.remote) {
        const moved =
          anchor === null ? null : movedBy(view, prev, anchor, options);
        anchor = moved?.anchor ?? null;
        owed = (owed ?? 0) + (moved?.shift ?? 0);
      }
      // while an input method composes, nothing is corrected until the update after it ends
      if (view.composing) return;
      if (owed !== null) {
        if (owed !== 0) scroller.scrollTop += owed;
        owed = null;
        record();
      } else if (now.local !== was.local) {
        // typing over a selection leaves a caret where there was none, so the anchor is read afresh
        if (!prev.selection.empty && view.state.selection.empty) record();
        else if (anchor !== null) anchor = followed(view, anchor, options);
        if (options.typewriter()) line.typed(view);
        else line.release();
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
