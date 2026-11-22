// What each sheet in view shows of the revisions: its band's colour, its header and an asterisk per marked line.
import type { Pagination } from "@manent/pagination";
import { pageRevision } from "@manent/revisions";
import type { BlockMark, MarkMode, RevisionSource } from "@manent/revisions";
import type { EditorState } from "prosemirror-state";
import type { PageScaffold, SheetDecor } from "../page/scaffold.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { productionOf, revisionKey } from "./derive.ts";
import type { ProductionView } from "./plugin.ts";
import { REVISION_CSS } from "./revision-css.ts";

type Drawn = ReturnType<SheetDecor["sheet"]>;

/** Each page's revision, laid out the first time its sheet is drawn and kept while `key` holds. */
function sheetDecor(
  p: Pagination,
  sources: readonly RevisionSource[],
  mode: MarkMode,
  key: string,
): SheetDecor {
  const drawn = new Map<number, Drawn>();
  return {
    key,
    sheet(index) {
      if (index >= p.pages.length) return null;
      if (!drawn.has(index)) {
        const page = pageRevision(p, index, sources, mode);
        drawn.set(
          index,
          page === null
            ? null
            : { rev: page.colour, head: page.header, marks: page.marks },
        );
      }
      return drawn.get(index) ?? null;
    },
  };
}

export interface SheetPainter {
  paint(state: EditorState): void;
  destroy(): void;
}

/** Draws the state's revisions on the scaffold's sheets, with the revision styles beside them while it is in production. */
export function createSheetPainter(
  scaffold: () => PageScaffold | null,
): SheetPainter {
  let drawn: {
    marks: ReadonlyMap<string, BlockMark>;
    pagination: Pagination;
    view: ProductionView;
  } | null = null;
  let decors = 0;
  let style: HTMLStyleElement | null = null;
  return {
    paint(state) {
      const frame = scaffold();
      if (frame === null) return;
      const production = productionOf(state);
      const marks = revisionKey.getState(state)?.marks;
      const pagination = paginationKey.getState(state)?.pagination;
      if (
        production === null ||
        marks === undefined ||
        pagination === undefined
      ) {
        drawn = null;
        frame.setSheetDecor(null);
        frame.setTint(false);
        return;
      }
      if (style === null) {
        style = frame.pages.ownerDocument.createElement("style");
        style.textContent = REVISION_CSS;
        frame.pages.append(style);
      }
      const { view } = production;
      if (
        drawn?.marks !== marks ||
        drawn.pagination !== pagination ||
        drawn.view !== view
      ) {
        drawn = { marks, pagination, view };
        const sources = [...view.earlier, { ...view.active, marks }];
        frame.setSheetDecor(
          sheetDecor(pagination, sources, view.mode, String(++decors)),
        );
      }
      frame.setTint(view.tint);
    },
    destroy() {
      style?.remove();
    },
  };
}
