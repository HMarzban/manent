// A watermark: the reader's name, on every page, on one row in the bottom margin below the footer slot.
import { LINE_PT } from "@manent/pagination";
import type { PageGeometry } from "@manent/pagination";

/** Where a watermark's row sits on a page, in points: its top from the page's top edge, its centre from the left edge. */
export interface WatermarkPlacement {
  readonly topPt: number;
  readonly centerPt: number;
}

/**
 * Where a watermark goes on a page of `geometry`. Placed in the bottom band (`heightPt - 2 * LINE_PT`, 768 pt on
 * Letter) so it sits cleanly below `footer.center` and `(CONTINUED)` and never collides with them.
 */
export function placeWatermark(geometry: PageGeometry): WatermarkPlacement {
  return {
    topPt: geometry.heightPt - 2 * LINE_PT,
    centerPt: geometry.widthPt / 2,
  };
}
