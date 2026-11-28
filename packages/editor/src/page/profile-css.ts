// The styles one page profile sets: the page's measurements and one rule per element.

import { BLOCK_TYPES } from "@manent/schema";
import type { Alignment } from "@manent/schema";
import {
  BLOCK_SLACK_CELLS,
  cellPtOf,
  linePtOf,
  pageSizePx,
  specKey,
  unitPtOf,
} from "@manent/pagination";
import type { ElementSpec, PageProfile } from "@manent/pagination";
import { PAGE_GAP_PX } from "./config.ts";

/** The cells of a block's slack that sit left of its text, so an aligned line stays where the engine puts it. */
export const SLACK_LEFT: Readonly<Record<Alignment, number>> = Object.freeze({
  left: 0,
  center: BLOCK_SLACK_CELLS / 2,
  right: BLOCK_SLACK_CELLS,
});

/** Steps of a CSS pixel that every engine lays out exactly. */
const SCREEN_STEPS_PER_PX = 4;

function toScreenGrid(px: number): number {
  return Math.round(px * SCREEN_STEPS_PER_PX) / SCREEN_STEPS_PER_PX;
}

/** Screen line height in px for `profile` (`16` on v1/v2, `20` on v3 book serif). */
export function linePxOf(profile: PageProfile): number {
  return toScreenGrid((linePtOf(profile) * 4) / 3);
}

/** Screen half-line unit in px for `profile` (`8` on v1/v2, `10` on v3 book serif). */
export function unitPxOf(profile: PageProfile): number {
  return toScreenGrid((unitPtOf(profile) * 4) / 3);
}

/**
 * The page's lengths on screen at 100 %, in px; heights are rounded to the nearest 1/4 px, the finest length
 * Chromium and WebKit (1/64 px) and Firefox (1/60 px) all lay out exactly, so page breaks add no rounding.
 */
export function screenPagePx(profile: PageProfile): {
  width: number;
  height: number;
  top: number;
  bottom: number;
} {
  const page = pageSizePx(profile);
  const height = toScreenGrid(page.height);
  const top = toScreenGrid((profile.geometry.marginTopPt * 4) / 3);
  const linePx = linePxOf(profile);
  return {
    width: page.width,
    height,
    top,
    bottom: height - top - profile.linesPerPage * linePx,
  };
}

/** Lines kept beneath a page-start drop, matching engine `keep.ts` `LINES_UNDER_DROP`. */
const LINES_UNDER_DROP = 8;

function elementRule(
  selector: string,
  spec: ElementSpec,
  linesPerPage: number,
): string {
  const declarations = [
    `--el-indent: ${spec.indent}`,
    `--el-width: ${spec.width}`,
    `--el-before: ${spec.spaceBefore}`,
    `--el-spacing: ${spec.lineSpacing}`,
    `--el-first: ${spec.firstLineIndent}`,
    `--el-slack-left: ${SLACK_LEFT[spec.align]}`,
    `text-align: ${spec.align}`,
  ];
  if (spec.capitalized) declarations.push("text-transform: uppercase");
  const drop = Math.max(
    0,
    Math.min(spec.dropLines, linesPerPage - LINES_UNDER_DROP),
  );
  if (drop > 0) declarations.push(`--el-drop: ${drop}`);
  return `${selector} { ${declarations.join("; ")}; }`;
}

/** The page's variables and one rule per element, for this profile; heights in px (screenPagePx), other lengths in points. */
export function profileCss(profile: PageProfile): string {
  const g = profile.geometry;
  const screen = screenPagePx(profile);
  const linePx = linePxOf(profile);
  const unitPx = unitPxOf(profile);
  const cellPt = cellPtOf(profile);
  const fontSizePt = profile.typography?.fontSizePt ?? 12;
  const mirrorDeltaPt =
    g.mirrored === true &&
    g.marginInnerPt !== undefined &&
    g.marginOuterPt !== undefined
      ? g.marginInnerPt - g.marginOuterPt
      : 0;
  const page = [
    `--geo-page-w: ${g.widthPt}pt`,
    `--geo-page-h: ${screen.height}px`,
    `--geo-left: ${g.marginLeftPt}pt`,
    `--geo-right: ${g.marginRightPt}pt`,
    `--geo-top: ${screen.top}px`,
    `--geo-bottom: ${screen.bottom}px`,
    `--geo-line: ${linePx}px`,
    `--geo-unit: ${unitPx}px`,
    `--geo-cell: ${cellPt}pt`,
    `--geo-font-size: ${fontSizePt}pt`,
    `--geo-mirror-delta: ${mirrorDeltaPt}pt`,
    `--geo-lines: ${profile.linesPerPage}`,
    `--geo-column: ${profile.columnCells}`,
    `--geo-cue-indent: ${profile.elements.character.indent}`,
    `--geo-gap: ${PAGE_GAP_PX}px`,
  ];
  const rules = [`.mn-pages { ${page.join("; ")}; }`];
  // A block's class carries its type, not its kind, so an act break is styled as a new act whatever its kind.
  for (const type of BLOCK_TYPES) {
    rules.push(
      elementRule(
        `.el-${type}`,
        profile.elements[specKey(type, null)],
        profile.linesPerPage,
      ),
    );
  }
  return rules.join("\n");
}
