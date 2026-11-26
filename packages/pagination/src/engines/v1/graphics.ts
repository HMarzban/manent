// Pure deterministic measurement and placement for `"graphic"` blocks (zero DOM or image measurement).
import type { LayoutBlock } from "../../layout-block.ts";
import type { ElementSpec } from "../../page-profile.ts";
import type { BlockMetrics } from "../../pages.ts";
import type { PositionedGraphic } from "../../positioned-lines.ts";
import { wrap } from "./wrap.ts";

export const DEFAULT_GRAPHIC_HEIGHT_LINES = 6;
export const MIN_GRAPHIC_HEIGHT_LINES = 2;
export const MAX_GRAPHIC_HEIGHT_LINES = 24;

/** Integer box height in lines (clamped to 2..24); 0 for non-graphic blocks. */
export function graphicBoxLines(block: LayoutBlock): number {
  if (block.type !== "graphic") return 0;
  const raw = block.graphic?.heightLines;
  if (typeof raw !== "number" || !Number.isFinite(raw))
    return DEFAULT_GRAPHIC_HEIGHT_LINES;
  return Math.min(
    MAX_GRAPHIC_HEIGHT_LINES,
    Math.max(MIN_GRAPHIC_HEIGHT_LINES, Math.floor(raw)),
  );
}

/**
 * Measures a graphic block purely from its pinned `heightLines` plus its wrapped
 * caption lines (0 when caption text is empty). `starts` holds `boxLines` zero
 * slots followed by each caption line's UTF-16 offset so `walkPage` and `layoutPage`
 * advance across the box and caption seamlessly.
 */
export function measureGraphic(
  block: LayoutBlock,
  spec: ElementSpec,
  forced: readonly number[],
): BlockMetrics {
  const boxLines = graphicBoxLines(block);
  const captionStarts =
    block.text === ""
      ? new Int32Array(0)
      : wrap(block.text, spec.width, {
          firstLineIndent: spec.firstLineIndent,
          capitalized: spec.capitalized,
          styles: block.styles,
          forced,
        });
  const totalLines = boxLines + captionStarts.length;
  const starts = new Int32Array(totalLines);
  for (let i = 0; i < captionStarts.length; i += 1)
    starts[boxLines + i] = captionStarts[i]!;
  return Object.freeze({ lines: totalLines, starts, spec });
}

/** Builds the positioned graphic rectangle for `block` starting at half-line slot `top`. */
export function positionGraphic(
  block: LayoutBlock,
  spec: ElementSpec,
  top: number,
  boxLines: number,
): PositionedGraphic {
  const g = block.graphic ?? null;
  return {
    blockId: block.id,
    kind: g?.kind ?? "image",
    assetId: g?.assetId ?? null,
    label: g?.label ?? "",
    alt: g?.alt ?? "",
    x: spec.indent,
    y: top,
    widthCells: spec.width,
    heightLines: boxLines,
    aspectWidth: g?.aspectWidth ?? null,
    aspectHeight: g?.aspectHeight ?? null,
  };
}

/**
 * True when an oversized graphic block at the top of a page must be placed whole
 * rather than severed across a page break (ADR 0074).
 */
export function isAtomicGraphicAtTop(
  block: LayoutBlock,
  atTop: boolean,
  line: number,
  whole: boolean,
): boolean {
  return block.type === "graphic" && atTop && line === 0 && whole;
}
