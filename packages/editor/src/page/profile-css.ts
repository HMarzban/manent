// The styles one page profile sets: the page's measurements and one rule per element.

import { BLOCK_TYPES } from "@manent/schema";
import type { Alignment } from "@manent/schema";
import {
  BLOCK_SLACK_CELLS,
  LINE_PX,
  pageSizePx,
  specKey,
} from "@manent/pagination";
import type { ElementSpec, PageProfile } from "@manent/pagination";
import { PAGE_GAP_PX } from "./config.ts";

/** The cells of a block's slack that sit left of its text, so an aligned line stays where the engine puts it. */
const SLACK_LEFT: Readonly<Record<Alignment, number>> = Object.freeze({
  left: 0,
  center: BLOCK_SLACK_CELLS / 2,
  right: BLOCK_SLACK_CELLS,
});

/** Steps of a CSS pixel that every engine lays out exactly. */
const SCREEN_STEPS_PER_PX = 4;

function toScreenGrid(px: number): number {
  return Math.round(px * SCREEN_STEPS_PER_PX) / SCREEN_STEPS_PER_PX;
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
  return {
    width: page.width,
    height,
    top,
    bottom: height - top - profile.linesPerPage * LINE_PX,
  };
}

function elementRule(selector: string, spec: ElementSpec): string {
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
  if (spec.dropLines > 0) declarations.push(`--el-drop: ${spec.dropLines}`);
  return `${selector} { ${declarations.join("; ")}; }`;
}

/** The page's variables and one rule per element, for this profile; heights in px (screenPagePx), other lengths in points. */
export function profileCss(profile: PageProfile): string {
  const g = profile.geometry;
  const screen = screenPagePx(profile);
  const page = [
    `--geo-page-w: ${g.widthPt}pt`,
    `--geo-page-h: ${screen.height}px`,
    `--geo-left: ${g.marginLeftPt}pt`,
    `--geo-right: ${g.marginRightPt}pt`,
    `--geo-top: ${screen.top}px`,
    `--geo-bottom: ${screen.bottom}px`,
    `--geo-lines: ${profile.linesPerPage}`,
    `--geo-column: ${profile.columnCells}`,
    `--geo-cue-indent: ${profile.elements.character.indent}`,
    `--geo-gap: ${PAGE_GAP_PX}px`,
  ];
  const rules = [`.mn-pages { ${page.join("; ")}; }`];
  // A block's class carries its type, not its kind, so an act break is styled as a new act whatever its kind.
  for (const type of BLOCK_TYPES) {
    rules.push(
      elementRule(`.el-${type}`, profile.elements[specKey(type, null)]),
    );
  }
  return rules.join("\n");
}
