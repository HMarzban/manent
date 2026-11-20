// The facts the interface shows about the caret: its element, page, scene and block layout, and the undo state.
import type { FormatId } from "@manent/schema";
import type { EditorState } from "prosemirror-state";
import { blockAt } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import type {
  EditorWords,
  FactsShape,
  HistoryPort,
} from "../script-editor/ports.ts";
import { headingAt } from "./outline.ts";
import type { OutlineIndex } from "./outline.ts";

type PageFacts = Pick<
  FactsShape,
  | "page"
  | "pageCount"
  | "blockIndent"
  | "blockWidth"
  | "blockAlign"
  | "blockSpaceBefore"
  | "columnCells"
>;

const NO_PAGES: PageFacts = Object.freeze({
  page: null,
  pageCount: null,
  blockIndent: null,
  blockWidth: null,
  blockAlign: null,
  blockSpaceBefore: null,
  columnCells: null,
});

/** The caret block's page and layout as the engine draws them; `block` null: the caret is in no block. */
function pageFacts(
  pages: PaginationState,
  block: number | null,
  offset: number,
): PageFacts {
  const { engine, profile } = pages.settings;
  const { pagination } = pages;
  const spec =
    block === null
      ? null
      : engine.resolveSpec(profile, pages.index.blocks[block]!);
  return {
    page:
      block === null
        ? null
        : pagination.pages[engine.pageOf(pagination, block, offset)]!.label,
    pageCount: pagination.pages.length,
    blockIndent: spec?.indent ?? null,
    blockWidth: spec?.width ?? null,
    blockAlign: spec?.align ?? null,
    blockSpaceBefore: spec?.spaceBefore ?? null,
    columnCells: profile.columnCells,
  };
}

/**
 * Constant work: a search of the block index, the pages and the outline. Without pages (Ink) the page and layout
 * facts are null; with everything selected, so are the facts of the caret's block. `pageRevision` and
 * `pageOrdinal` are always null here.
 */
export function factsOf(
  state: EditorState,
  options: {
    history: HistoryPort;
    words: EditorWords;
    format: FormatId;
    outline: OutlineIndex;
  },
): FactsShape {
  const { selection } = state;
  const { $head } = selection;
  const node = $head.parent.isTextblock ? $head.parent : null;
  const pages = paginationKey.getState(state) ?? null;
  const block =
    pages === null || node === null
      ? null
      : blockAt(pages.index, selection.head);
  const heading = block === null ? null : headingAt(options.outline, block);
  const entry = heading === null ? null : options.outline.entries[heading]!;
  return {
    element:
      node === null
        ? null
        : options.words.element(
            options.format,
            node.attrs.type,
            node.attrs.kind,
          ),
    ...(pages === null
      ? NO_PAGES
      : pageFacts(pages, block, $head.parentOffset)),
    scene: entry?.number ?? null,
    blockId: node?.attrs.id ?? null,
    sceneId: entry?.blockId ?? null,
    blockSpaceBeforeSet: node === null ? null : node.attrs.spaceBefore !== null,
    pageRevision: null,
    pageOrdinal: null,
    canUndo: options.history.canUndo(state),
    canRedo: options.history.canRedo(state),
    selectionEmpty: selection.empty,
  };
}
