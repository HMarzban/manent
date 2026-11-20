// The page's zoom as numbers: where a step and a pinch reach, and what is said when it changes.
import type { ZoomSetting } from "@manent/editor";
import { EDITOR_WORDS } from "@manent/ui";
import { ZOOM_PRESETS } from "../state/zoom-presets.ts";

// the editor's ends, which the presets begin and end at
const ZOOM_MIN = Math.min(...ZOOM_PRESETS);
const ZOOM_MAX = Math.max(...ZOOM_PRESETS);
// a pinch's wheel distance, px, that scales the page by e
const PINCH_PX = 100;

/** The next preset strictly above `percent` (in) or below it (out); null at ZOOM_MAX or ZOOM_MIN. */
export function zoomStep(
  percent: number,
  direction: "in" | "out",
): number | null {
  const next =
    direction === "in"
      ? ZOOM_PRESETS.find((preset) => preset > percent)
      : ZOOM_PRESETS.findLast((preset) => preset < percent);
  return next ?? null;
}

/** `percent` × e^(−deltaY / 100), rounded and kept within ZOOM_MIN … ZOOM_MAX: a pinch apart (deltaY below 0) zooms in. */
export function pinchZoom(percent: number, deltaY: number): number {
  const reached = Math.round(percent * Math.exp(-deltaY / PINCH_PX));
  return Math.min(Math.max(reached, ZOOM_MIN), ZOOM_MAX);
}

/** "Zoom: 125 %", "Zoom: Fit width": as the palette row of that zoom reads. */
export function zoomAnnouncement(zoom: ZoomSetting): string {
  const { fitWidth, percent, announce } = EDITOR_WORDS.zoom;
  return announce(zoom === "fit_width" ? fitWidth : percent(zoom));
}
