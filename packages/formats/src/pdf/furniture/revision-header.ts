// A revised page's furniture: its paper, its header on the page-number row and an asterisk per marked line.
import { UNIT_PT } from "@manent/pagination";
import type { PdfFurniture, PdfFurnitureDrawing } from "./pdf-furniture.ts";

/** Cells between the column's right edge and a revision mark. */
const MARK_GAP_CELLS = 7;

const NOTHING: PdfFurnitureDrawing = Object.freeze({ paper: null, lines: [] });

export const revisionHeader: PdfFurniture = {
  replaces: [],
  draw({ revision, profile }) {
    if (revision === null) return NOTHING;
    const { geometry, columnCells } = profile;
    return {
      paper: revision.tint,
      lines: [
        {
          x: 0,
          y: (geometry.pageNumberTopPt - geometry.marginTopPt) / UNIT_PT,
          runs: [{ text: revision.header, style: 0 }],
        },
        ...revision.marks.map((mark) => ({
          x: columnCells + MARK_GAP_CELLS,
          y: mark.y,
          runs: [{ text: mark.text, style: 0 }],
        })),
      ],
    };
  },
};
