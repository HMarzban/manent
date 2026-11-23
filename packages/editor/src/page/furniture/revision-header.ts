// A revised sheet's furniture: its colour and header, which the revision styles draw, and an asterisk per marked line.
import { CELL_PX, UNIT_PX } from "@manent/pagination";
import { screenPagePx } from "../profile-css.ts";
import type { PageFurniture } from "./page-furniture.ts";

/** CSS pixels in a point. */
const PX_PER_PT = 4 / 3;
/** Cells past the column's right edge where a revision mark is drawn. */
const MARK_GAP_CELLS = 7;

export const revisionHeader: PageFurniture = {
  replaces: [],
  draw(sheet, { revision, profile }) {
    if (revision === null) return;
    sheet.dataset["rev"] = revision.rev;
    sheet.dataset["revHead"] = revision.head;
    const g = profile.geometry;
    const left =
      g.marginLeftPt * PX_PER_PT +
      (profile.columnCells + MARK_GAP_CELLS) * CELL_PX;
    const { top } = screenPagePx(profile);
    sheet.append(
      ...revision.marks.map((m) => {
        const mark = sheet.ownerDocument.createElement("span");
        mark.className = "mn-mark";
        mark.dataset["text"] = m.text;
        mark.style.top = `${top + m.y * UNIT_PX}px`;
        mark.style.left = `${left}px`;
        return mark;
      }),
    );
  },
};
