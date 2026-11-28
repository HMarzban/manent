// Header and footer furniture in a PDF: left, centre and right slots plus an optional hairline rule.
import {
  DEFAULT_READ_RATE,
  LINE_PT,
  UNIT_PT,
  durationMs,
  engineFor,
  timeScript,
} from "@manent/pagination";
import type { Engine, Pagination } from "@manent/pagination";
import type {
  FurnitureLine,
  FurnitureRule,
  PdfDateFormat,
  PdfFurniture,
  PdfFurnitureDrawing,
  PdfFurnitureInput,
  PdfHeaderSlot,
  PdfHeaderSlots,
} from "./pdf-furniture.ts";

const RULE_GAP_PT = 2;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
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

function formatDay(
  day: string | null,
  dateFormat: PdfDateFormat | null,
): string {
  if (day === null || day === "") return "";
  const match = ISO_DAY.exec(day);
  if (match === null) return day;
  const [, year, monthText, dayText] = match;
  const month = MONTHS[Number(monthText) - 1];
  if (month === undefined) return day;
  const numDay = Number(dayText);
  switch (dateFormat ?? "day_month_year") {
    case "iso":
      return `${year}-${monthText}-${dayText}`;
    case "month_day_year":
      return `${month} ${numDay}, ${year}`;
    case "day_month_year":
      return `${numDay} ${month} ${year}`;
  }
}

function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000 + 0.5));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return hours > 0
    ? `${hours}:${padTwo(minutes)}:${padTwo(seconds)}`
    : `${minutes}:${padTwo(seconds)}`;
}

function resolveSlot(
  slot: PdfHeaderSlot,
  input: PdfFurnitureInput,
  hasRevisionHeader: boolean,
): string {
  switch (slot.kind) {
    case "none":
      return "";
    case "page_number":
      return `${input.pageLabel}.`;
    case "page_of_total":
      return `${input.pageLabel} of ${input.pageCount}`;
    case "date":
      return formatDay(input.day, input.dateFormat);
    case "title":
      return input.title ?? "";
    case "section":
      return input.section ?? "";
    case "duration":
      return input.durationMs === null ? "" : formatDuration(input.durationMs);
    case "revision_label":
      return hasRevisionHeader ? "" : (input.revisionLabel ?? "");
    case "custom":
      return slot.text;
  }
}

function addBar(
  engine: Engine,
  input: PdfFurnitureInput,
  slots: PdfHeaderSlots,
  kind: "header" | "footer",
  hasRevisionHeader: boolean,
  lines: FurnitureLine[],
  rules: FurnitureRule[],
): void {
  if (!slots.firstPage && input.pageIndex === 0) return;
  const { geometry, columnCells, linesPerPage } = input.profile;
  const topPt =
    kind === "header"
      ? geometry.pageNumberTopPt
      : Math.max(
          geometry.marginTopPt + linesPerPage * LINE_PT + LINE_PT,
          geometry.heightPt - geometry.pageNumberTopPt - LINE_PT,
        );
  const y = (topPt - geometry.marginTopPt) / UNIT_PT;
  const placements: readonly [PdfHeaderSlot, "left" | "center" | "right"][] = [
    [slots.left, "left"],
    [slots.center, "center"],
    [slots.right, "right"],
  ];
  for (const [slot, align] of placements) {
    const text = resolveSlot(slot, input, hasRevisionHeader);
    if (text === "") continue;
    const cells = engine.clusterCells(text, 0, text.length, false);
    const x =
      align === "left"
        ? 0
        : align === "right"
          ? columnCells - cells
          : (columnCells - cells) / 2;
    lines.push({ x, y, runs: [{ text, style: 0 }] });
  }
  if (slots.rule) {
    const ruleTopPt =
      kind === "header" ? topPt + LINE_PT + RULE_GAP_PT : topPt - RULE_GAP_PT;
    rules.push({
      x: 0,
      y: (ruleTopPt - geometry.marginTopPt) / UNIT_PT,
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
  const result: (string | null)[] = [];
  let current: string | null = null;
  let blockIdx = 0;
  for (const page of p.pages) {
    while (blockIdx <= page.block && blockIdx < p.blocks.length) {
      const block = p.blocks[blockIdx]!;
      if (
        block.type === "chapter" ||
        block.type === "group" ||
        (block.type === "act_break" && block.kind !== "end_of_act")
      ) {
        const text = block.text.trim();
        if (text !== "") current = text;
      }
      blockIdx++;
    }
    result.push(current);
  }
  return result;
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
