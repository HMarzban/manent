import { ZOOM_MAX, ZOOM_MIN } from "../page/config.ts";

/** A number is a percent, from ZOOM_MIN to ZOOM_MAX. */
export type ZoomSetting = "fit_width" | number;

/** The percent at which a sheet and the desk's padding fill the desk's width, rounded down and kept within ZOOM_MIN … ZOOM_MAX. */
export function fitWidthPercent(
  deskWidthPx: number,
  sheetWidthPx: number,
  paddingPx: number,
): number {
  const percent = Math.floor((100 * deskWidthPx) / (sheetWidthPx + paddingPx));
  return Math.min(Math.max(percent, ZOOM_MIN), ZOOM_MAX);
}
