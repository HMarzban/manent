// Fixed box-height helpers used by the drift monitor so graphic blocks verify caption wrapping with zero false positives.
import { LINE_PX } from "@manent/pagination";
import type { LayoutBlock } from "@manent/pagination";
import {
  GRAPHIC_MAX_HEIGHT_LINES,
  GRAPHIC_MIN_HEIGHT_LINES,
} from "@manent/schema";

const DEFAULT_GRAPHIC_HEIGHT_LINES = 6;

/** Clamped box height in lines for a `"graphic"` block, or `0` for every other block. */
export function graphicBoxLines(block: LayoutBlock): number {
  if (block.type !== "graphic") return 0;
  const raw = block.graphic?.heightLines;
  if (typeof raw !== "number" || !Number.isFinite(raw))
    return DEFAULT_GRAPHIC_HEIGHT_LINES;
  return Math.min(
    GRAPHIC_MAX_HEIGHT_LINES,
    Math.max(GRAPHIC_MIN_HEIGHT_LINES, Math.floor(raw)),
  );
}

/** Extra pixel height contributed by a graphic block's fixed-height image/chyron box. */
export function graphicExtraPx(block: LayoutBlock): number {
  return graphicBoxLines(block) * LINE_PX;
}

/** Caption-only model line count compared against DOM height after subtracting `graphicExtraPx`. */
export function driftModelLines(
  block: LayoutBlock,
  metricsLines: number,
): number {
  if (block.type !== "graphic") return metricsLines;
  return Math.max(0, metricsLines - graphicBoxLines(block));
}
