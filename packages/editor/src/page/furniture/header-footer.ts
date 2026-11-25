// Header and footer furniture on a sheet: left, centre and right slots plus an optional hairline rule.
import { CELL_PX, LINE_PT, LINE_PX } from "@manent/pagination";
import type { HeaderSlot, HeaderSlots } from "@manent/settings";
import { screenPagePx } from "../profile-css.ts";
import type {
  DateFormat,
  PageFurniture,
  PageFurnitureInput,
} from "./page-furniture.ts";

const PX_PER_PT = 4 / 3;
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
const NONE: HeaderSlot = Object.freeze({ kind: "none" });
const DEFAULT_HEADER: HeaderSlots = Object.freeze({
  left: NONE,
  center: NONE,
  right: Object.freeze({ kind: "page_number" }),
  firstPage: false,
  rule: false,
});
const DEFAULT_FOOTER: HeaderSlots = Object.freeze({
  left: NONE,
  center: NONE,
  right: NONE,
  firstPage: false,
  rule: false,
});

function formatDay(day: string | null, dateFormat: DateFormat | null): string {
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
  slot: HeaderSlot,
  input: PageFurnitureInput,
  hasRevisionHeader: boolean,
): string {
  const label = input.pageLabel ?? String(input.pageIndex + 1);
  switch (slot.kind) {
    case "none":
      return "";
    case "page_number":
      return `${label}.`;
    case "page_of_total":
      return `${label} of ${input.pageCount}`;
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

function createBand(
  doc: Document,
  className: string,
  leftPt: number,
  widthPx: number,
  topPx: number,
): HTMLDivElement {
  const band = doc.createElement("div");
  band.className = className;
  Object.assign(band.style, {
    position: "absolute",
    left: `${leftPt}pt`,
    width: `${widthPx}px`,
    top: `${topPx}px`,
    height: `${LINE_PX}px`,
    font: '12pt/12pt "Courier Prime", monospace',
    fontKerning: "none",
    fontVariantLigatures: "none",
    textRendering: "geometricPrecision",
    color: "var(--page-ink)",
    whiteSpace: "pre",
    pointerEvents: "none",
  });
  return band;
}

function appendSlot(
  band: HTMLElement,
  text: string,
  align: "left" | "center" | "right",
): void {
  if (text === "") return;
  const span = band.ownerDocument.createElement("span");
  span.textContent = text;
  span.style.position = "absolute";
  span.style.top = "0";
  if (align === "left") span.style.left = "0";
  else if (align === "right") span.style.right = "0";
  else {
    span.style.left = "50%";
    span.style.transform = "translateX(-50%)";
  }
  band.append(span);
}

function createRule(
  doc: Document,
  className: string,
  leftPt: number,
  widthPx: number,
  topPx: number,
): HTMLDivElement {
  const line = doc.createElement("div");
  line.className = className;
  Object.assign(line.style, {
    position: "absolute",
    left: `${leftPt}pt`,
    width: `${widthPx}px`,
    top: `${topPx}px`,
    height: "1px",
    background: "var(--page-ink)",
    pointerEvents: "none",
  });
  return line;
}

function drawBar(
  sheet: HTMLElement,
  input: PageFurnitureInput,
  slots: HeaderSlots,
  kind: "header" | "footer",
  hasRevisionHeader: boolean,
): void {
  if (!slots.firstPage && input.pageIndex === 0) return;
  const left = resolveSlot(slots.left, input, hasRevisionHeader);
  const center = resolveSlot(slots.center, input, hasRevisionHeader);
  const right = resolveSlot(slots.right, input, hasRevisionHeader);
  if (left === "" && center === "" && right === "" && !slots.rule) return;
  const { profile } = input;
  const { geometry } = profile;
  const widthPx = profile.columnCells * CELL_PX;
  const screen = screenPagePx(profile);
  const topPx =
    kind === "header"
      ? geometry.pageNumberTopPt * PX_PER_PT
      : Math.max(
          screen.top + (profile.linesPerPage + 1) * LINE_PX,
          screen.height - geometry.pageNumberTopPt * PX_PER_PT - LINE_PX,
        );
  const doc = sheet.ownerDocument;
  const band = createBand(
    doc,
    kind === "header" ? "mn-header" : "mn-footer",
    geometry.marginLeftPt,
    widthPx,
    topPx,
  );
  appendSlot(band, left, "left");
  appendSlot(band, center, "center");
  appendSlot(band, right, "right");
  if (kind === "header") sheet.prepend(band);
  else sheet.append(band);
  if (slots.rule) {
    const gapPx = RULE_GAP_PT * PX_PER_PT;
    const ruleTopPx =
      kind === "header" ? topPx + LINE_PT * PX_PER_PT + gapPx : topPx - gapPx;
    sheet.append(
      createRule(
        doc,
        kind === "header" ? "mn-header-rule" : "mn-footer-rule",
        geometry.marginLeftPt,
        widthPx,
        ruleTopPx,
      ),
    );
  }
}

export const headerFooter: PageFurniture = {
  replaces: ["page_number"],
  draw(sheet, input) {
    const hasRevisionHeader =
      input.revision !== null && input.revision.head !== "";
    drawBar(
      sheet,
      input,
      input.header ?? DEFAULT_HEADER,
      "header",
      hasRevisionHeader,
    );
    drawBar(
      sheet,
      input,
      input.footer ?? DEFAULT_FOOTER,
      "footer",
      hasRevisionHeader,
    );
  },
};
