// A watermarked sheet's furniture: the reader's name on one row at the bottom of the margin, below the footer slot, as it prints.
import { LINE_PX } from "@manent/pagination";
import { screenPagePx } from "../profile-css.ts";
import type { PageFurniture } from "./page-furniture.ts";

export const watermark: PageFurniture = {
  replaces: [],
  draw(sheet, { watermark: name, profile }) {
    if (name === null) return;
    const { height } = screenPagePx(profile);
    const row = sheet.ownerDocument.createElement("div");
    row.className = "mn-watermark";
    row.textContent = name;
    Object.assign(row.style, {
      position: "absolute",
      left: "0",
      width: "100%",
      boxSizing: "border-box",
      padding: "0 18pt",
      top: `${height - 2 * LINE_PX}px`,
      overflow: "hidden",
      textOverflow: "ellipsis",
      textAlign: "center",
      whiteSpace: "pre",
      pointerEvents: "none",
      font: '12pt/12pt "Courier Prime", monospace',
      color: "var(--page-ink)",
    });
    sheet.append(row);
  },
};
