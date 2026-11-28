// Header and footer furniture in a PDF: delegates slot & suppression rules to @manent/pagination for zero-drift screen/PDF parity.
import {
  DEFAULT_READ_RATE,
  cellPtOf,
  durationMs,
  engineFor,
  linePtOf,
  measureSerifPt,
  pageRunningContext,
  resolveBarSlots,
  timeScript,
  unitPtOf,
} from "@manent/pagination";
import type { Engine, Pagination } from "@manent/pagination";
import type {
  FurnitureLine,
  FurnitureRule,
  PdfFurniture,
  PdfFurnitureDrawing,
  PdfFurnitureInput,
  PdfHeaderSlot,
  PdfHeaderSlots,
} from "./pdf-furniture.ts";

const RULE_GAP_PT = 2;
const NONE: PdfHeaderSlot = Object.freeze({ kind: "none" });
const DEFAULT_HEADER: PdfHeaderSlots = Object.freeze({
  left: NONE,
  center: NONE,
  right: Object.freeze({ kind: "page_number" }),
  firstPage: false,
  rule: false,
});
const DEFAULT_FOOTER: PdfHeaderSlots = Object.freeze({
  left: NONE,
  center: NONE,
  right: NONE,
  firstPage: false,
  rule: false,
});

function addBar(
  engine: Engine,
  input: PdfFurnitureInput,
  slots: PdfHeaderSlots,
  kind: "header" | "footer",
  hasRevisionHeader: boolean,
  lines: FurnitureLine[],
  rules: FurnitureRule[],
): void {
  const resolved = resolveBarSlots(
    slots,
    {
      ...input,
      revisionLabel: hasRevisionHeader ? null : input.revisionLabel,
    },
    kind,
  );
  if (resolved === null) return;
  const { profile } = input;
  const { geometry, linesPerPage, columnCells, typography } = profile;
  const linePt = linePtOf(profile);
  const unitPt = unitPtOf(profile);
  const cellPt = cellPtOf(profile);
  const topPt =
    kind === "header"
      ? geometry.pageNumberTopPt
      : Math.max(
          geometry.marginTopPt + (linesPerPage + 1) * linePt,
          geometry.heightPt - geometry.pageNumberTopPt - linePt,
        );
  const y = (topPt - geometry.marginTopPt) / unitPt;
  const placements: readonly [string, "left" | "center" | "right"][] = [
    [resolved.left, "left"],
    [resolved.center, "center"],
    [resolved.right, "right"],
  ];
  for (const [text, align] of placements) {
    if (text === "") continue;
    const widthCells =
      typography !== undefined
        ? measureSerifPt(text, 0, typography.fontSizePt) / cellPt
        : engine.clusterCells(text, 0, text.length, false);
    const x =
      align === "left"
        ? 0
        : align === "right"
          ? columnCells - widthCells
          : (columnCells - widthCells) / 2;
    lines.push({ x, y, runs: [{ text, style: 0 }] });
  }
  if (resolved.rule) {
    const ruleTopPt =
      kind === "header" ? topPt + linePt + RULE_GAP_PT : topPt - RULE_GAP_PT;
    rules.push({
      x: 0,
      y: (ruleTopPt - geometry.marginTopPt) / unitPt,
      cells: columnCells,
    });
  }
}

/** Throws RangeError when this build does not carry the engine the page's profile names. */
export const headerFooter: PdfFurniture = {
  replaces: ["page_number"],
  draw(input): PdfFurnitureDrawing {
    const engine = engineFor(input.profile.engineVersion);
    if (engine === null)
      throw new RangeError(
        `no engine of version ${input.profile.engineVersion} in this build`,
      );
    const hasRevisionHeader =
      input.revision !== null && input.revision.header !== "";
    const lines: FurnitureLine[] = [];
    const rules: FurnitureRule[] = [];
    addBar(
      engine,
      input,
      input.header ?? DEFAULT_HEADER,
      "header",
      hasRevisionHeader,
      lines,
      rules,
    );
    addBar(
      engine,
      input,
      input.footer ?? DEFAULT_FOOTER,
      "footer",
      hasRevisionHeader,
      lines,
      rules,
    );
    return { paper: null, lines, rules };
  },
};

export function sectionsOfPagination(p: Pagination): (string | null)[] {
  return pageRunningContext(p).map((entry) => entry.section);
}

export function durationOfParts(parts: readonly Pagination[]): number | null {
  if (parts[0]?.profile.format !== "variety") return null;
  const blocks = parts.flatMap((part) =>
    part.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      text: block.text,
      noTiming: block.noTiming === true,
    })),
  );
  const { total } = timeScript(blocks);
  return durationMs([total], DEFAULT_READ_RATE);
}
