// A watermarked sheet's furniture: the reader's name on one row centred in the bottom margin, in ink, as it prints.
import { LINE_PX } from "@manent/pagination";
import { screenPagePx } from "../profile-css.ts";
import type { PageFurniture } from "./page-furniture.ts";

export const watermark: PageFurniture = {
  replaces: [],
  draw(sheet, { watermark: name, profile }) {
    if (name === null) return;
    const { height, bottom } = screenPagePx(profile);
    const row = sheet.ownerDocument.createElement("div");
    row.className = "mn-watermark";
    row.textContent = name;
    Object.assign(row.style, {
      position: "absolute",
      left: "0",
      width: "100%",
      top: `${height - (bottom + LINE_PX) / 2}px`,
      textAlign: "center",
      whiteSpace: "pre",
      font: '12pt/12pt "Courier Prime", monospace',
      color: "var(--page-ink)",
    });
    sheet.append(row);
  },
};
