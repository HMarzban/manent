// The styles one page profile sets: the page's measurements and one rule per element.

import type { Alignment } from "@manent/schema";
import { BLOCK_SLACK_CELLS } from "@manent/pagination";
import type { ElementSpec, PageProfile } from "@manent/pagination";
import { PAGE_GAP_PX } from "./config.ts";

/** The cells of a block's slack that sit left of its text, so an aligned line stays where the engine puts it. */
const SLACK_LEFT: Readonly<Record<Alignment, number>> = Object.freeze({
  left: 0,
  center: BLOCK_SLACK_CELLS / 2,
  right: BLOCK_SLACK_CELLS,
});

/**
 * The class an element's rule selects. A block carries its type, not its kind, so an act break is styled as a
 * new act whatever its kind; the other kinds differ only in how they paginate.
 */
function selectorOf(key: string): string | null {
  if (key === "act_break.new_act") return ".el-act_break";
  return key.startsWith("act_break.") ? null : `.el-${key}`;
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

/** The page's variables and one rule per element, for this profile; lengths in points. */
export function profileCss(profile: PageProfile): string {
  const g = profile.geometry;
  const page = [
    `--geo-page-w: ${g.widthPt}pt`,
    `--geo-page-h: ${g.heightPt}pt`,
    `--geo-left: ${g.marginLeftPt}pt`,
    `--geo-right: ${g.marginRightPt}pt`,
    `--geo-top: ${g.marginTopPt}pt`,
    `--geo-bottom: ${g.marginBottomPt}pt`,
    `--geo-lines: ${profile.linesPerPage}`,
    `--geo-column: ${profile.columnCells}`,
    `--geo-cue-indent: ${profile.elements.character.indent}`,
    `--geo-gap: ${PAGE_GAP_PX}px`,
  ];
  const rules = [`.mn-pages { ${page.join("; ")}; }`];
  for (const [key, spec] of Object.entries(profile.elements)) {
    const selector = selectorOf(key);
    if (selector !== null) rules.push(elementRule(selector, spec));
  }
  return rules.join("\n");
}
