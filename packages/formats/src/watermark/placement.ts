// A watermark: the reader's name, on every page, on one row centred in the bottom margin.
import { LINE_PT } from "@manent/pagination";
import type { PageGeometry } from "@manent/pagination";

/** Where a watermark's row sits on a page, in points: its top from the page's top edge, its centre from the left edge. */
export interface WatermarkPlacement {
  readonly topPt: number;
  readonly centerPt: number;
}

/**
 * Where a watermark goes on a page of `geometry`. A watermark draws the reader's name as given and nothing else, in
 * the script font at the page number's size, in ink: one 12 pt row centred in the bottom margin and on the page's width.
 */
export function placeWatermark(geometry: PageGeometry): WatermarkPlacement {
  return {
    topPt: geometry.heightPt - (geometry.marginBottomPt + LINE_PT) / 2,
    centerPt: geometry.widthPt / 2,
  };
}
