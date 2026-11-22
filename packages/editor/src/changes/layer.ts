// Asterisks beside the changed lines of the pages in view and, with the changes on the page, who changed each
// line in the desk gutter. Everything is placed from the engine's pages; nothing is measured.
import { CELL_PX, UNIT_PX } from "@manent/pagination";
import type { PageProfile, Pagination } from "@manent/pagination";
import { changedLineSet, markedLines } from "@manent/revisions";
import type { Comparison, MarkedLine } from "@manent/revisions";
import type { EditorState } from "prosemirror-state";
import { PAGE_GAP_PX } from "../page/config.ts";
import { screenPagePx } from "../page/profile-css.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { changesKey } from "./plugin.ts";

interface Author {
  initials: string;
  colour: number;
}

export interface MarkLayer {
  /** `authors`: by block id, the initials and collaborator colour (1–10) of the block's last author. */
  update(
    state: EditorState,
    visiblePages: readonly number[],
    authors: ReadonlyMap<string, Author>,
  ): void;
  destroy(): void;
}

// the layer reads each line's author from the map it is given, by block id
const NO_AUTHORS: ReadonlyMap<string, string> = new Map();

/** The gap between the sheet's right edge and the gutter's markers. */
const GUTTER_GAP_PX = 8;

/**
 * Where the marks of line `y` (in units, as PositionedLine.y) of page `pageIndex` go, in unscaled px from the
 * top left of the first sheet: its top, the asterisk's left (one cell into the right margin), and the gutter's
 * left. Pages are stacked as the sheets are, at their height on screen and PAGE_GAP_PX apart.
 */
export function markPosition(
  profile: PageProfile,
  pageIndex: number,
  y: number,
): { topPx: number; rightPx: number; gutterPx: number } {
  const page = screenPagePx(profile);
  const { widthPt, marginRightPt } = profile.geometry;
  return {
    topPx: pageIndex * (page.height + PAGE_GAP_PX) + page.top + y * UNIT_PX,
    rightPx: ((widthPt - marginRightPt) * 4) / 3 + CELL_PX,
    gutterPx: page.width + GUTTER_GAP_PX,
  };
}

function placed(
  el: HTMLElement,
  className: string,
  top: number,
  left: number,
): HTMLElement {
  el.className = className;
  el.style.position = "absolute";
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
  return el;
}

// One line's marks: an asterisk, and with the changes on the page, its author's initials, or how many authors.
function marksOf(
  doc: Document,
  at: { topPx: number; rightPx: number; gutterPx: number },
  lines: readonly MarkedLine[],
  authors: ReadonlyMap<string, Author> | null,
): HTMLElement[] {
  const asterisk = placed(
    doc.createElement("span"),
    "mn-asterisk",
    at.topPx,
    at.rightPx,
  );
  asterisk.textContent = "*";
  if (authors === null) return [asterisk];
  // the blocks of one line, side by side in a dual dialogue, may share their author
  const people = new Map<string, Author>();
  for (const { blockId } of lines) {
    const author = authors.get(blockId);
    if (author !== undefined)
      people.set(`${author.initials}:${author.colour}`, author);
  }
  const [only] = people.values();
  if (only === undefined) return [asterisk];
  const marker = placed(
    doc.createElement("span"),
    "mn-marker",
    at.topPx,
    at.gutterPx,
  );
  if (people.size > 1) marker.textContent = String(people.size);
  else {
    marker.textContent = only.initials;
    marker.dataset["who"] = String(only.colour);
  }
  return [asterisk, marker];
}

/**
 * One absolutely positioned element inside `.mn-pages`, above the sheets, holding an asterisk per changed line at
 * the right margin and, with display "page", the initials of that line's author in the desk gutter right of the
 * sheet (a count when two authors share a line).
 */
export function createMarkLayer(pages: HTMLElement): MarkLayer {
  const doc = pages.ownerDocument;
  const root = doc.createElement("div");
  root.style.position = "absolute";
  root.style.inset = "0";
  root.style.pointerEvents = "none";
  pages.append(root);
  // the lines of the last comparison and pages drawn, kept while the view only scrolls
  let last: {
    comparison: Comparison;
    pagination: Pagination;
    lines: ReadonlyMap<string, readonly number[]>;
  } | null = null;
  const linesOf = (comparison: Comparison, pagination: Pagination) => {
    if (last?.comparison !== comparison || last.pagination !== pagination)
      last = {
        comparison,
        pagination,
        lines: changedLineSet(comparison, pagination),
      };
    return last.lines;
  };
  return {
    update(state, visiblePages, authors) {
      const changes = changesKey.getState(state);
      const paged = paginationKey.getState(state);
      if (
        changes === undefined ||
        changes.comparison === null ||
        paged === undefined
      ) {
        root.replaceChildren();
        return;
      }
      const { pagination, settings } = paged;
      const lines = linesOf(changes.comparison, pagination);
      const shown = changes.display === "page" ? authors : null;
      const marks = visiblePages
        .filter((i) => i >= 0 && i < pagination.pages.length)
        .flatMap((i) => {
          const page = settings.engine.layoutPage(pagination, i);
          const byLine = new Map<number, MarkedLine[]>();
          for (const line of markedLines(page, lines, NO_AUTHORS))
            byLine.set(line.y, [...(byLine.get(line.y) ?? []), line]);
          return [...byLine].flatMap(([y, on]) =>
            marksOf(doc, markPosition(pagination.profile, i, y), on, shown),
          );
        });
      root.replaceChildren(...marks);
    },
    destroy() {
      root.remove();
    },
  };
}
