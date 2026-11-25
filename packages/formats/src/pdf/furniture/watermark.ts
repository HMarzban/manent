// A watermarked page's furniture: the reader's name centred in the bottom margin.
import { CELL_PT, UNIT_PT, engineFor } from "@manent/pagination";
import { placeWatermark } from "../../watermark/placement.ts";
import type { PdfFurniture, PdfFurnitureDrawing } from "./pdf-furniture.ts";

const NOTHING: PdfFurnitureDrawing = Object.freeze({ paper: null, lines: [] });

/** Throws RangeError when this build does not carry the engine the page's profile names. */
export const watermark: PdfFurniture = {
  replaces: [],
  draw({ watermark: name, profile }) {
    if (name === null) return NOTHING;
    const engine = engineFor(profile.engineVersion);
    if (engine === null)
      throw new RangeError(
        `no engine of version ${profile.engineVersion} in this build`,
      );
    const { geometry } = profile;
    const { topPt, centerPt } = placeWatermark(geometry);
    const cells = engine.clusterCells(name, 0, name.length, false);
    return {
      paper: null,
      lines: [
        {
          x: (centerPt - geometry.marginLeftPt) / CELL_PT - cells / 2,
          y: (topPt - geometry.marginTopPt) / UNIT_PT,
          runs: [{ text: name, style: 0 }],
        },
      ],
    };
  },
};
