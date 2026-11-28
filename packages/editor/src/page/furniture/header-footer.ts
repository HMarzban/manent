// Header and footer furniture on a sheet: delegates slot & suppression rules to @manent/pagination for zero-drift screen/PDF parity.
import {
  cellPtOf,
  linePtOf,
  pageMarginLeftPt,
  resolveBarSlots,
} from "@manent/pagination";
import type { BookTypography } from "@manent/pagination";
import type { HeaderSlot, HeaderSlots } from "@manent/settings";
import { linePxOf, screenPagePx } from "../profile-css.ts";
import type { PageFurniture, PageFurnitureInput } from "./page-furniture.ts";

const PX_PER_PT = 4 / 3;
const RULE_GAP_PT = 2;
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

function createBand(
  doc: Document,
  className: string,
  leftPt: number,
  widthPx: number,
  linePx: number,
  typography: BookTypography | undefined,
  vertical: { top: number } | { bottom: number },
): HTMLDivElement {
  const band = doc.createElement("div");
  band.className = className;
  const font =
    typography === undefined
      ? '12pt/12pt "Courier Prime", monospace'
      : `${typography.fontSizePt}pt/${typography.linePt}pt "${typography.family}", Georgia, serif`;
  Object.assign(band.style, {
    position: "absolute",
    left: `${leftPt}pt`,
    width: `${widthPx}px`,
    ...("top" in vertical
      ? { top: `${vertical.top}px` }
      : { bottom: `${vertical.bottom}px` }),
    height: `${linePx}px`,
    font,
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
  vertical: { top: number } | { bottom: number },
): HTMLDivElement {
  const line = doc.createElement("div");
  line.className = className;
  Object.assign(line.style, {
    position: "absolute",
    left: `${leftPt}pt`,
    width: `${widthPx}px`,
    ...("top" in vertical
      ? { top: `${vertical.top}px` }
      : { bottom: `${vertical.bottom}px` }),
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
  const { geometry } = profile;
  const marginLeftPt = pageMarginLeftPt(geometry, input.pageIndex);
  const linePt = linePtOf(profile);
  const linePx = linePxOf(profile);
  const widthPx = profile.columnCells * cellPtOf(profile) * PX_PER_PT;
  const screen = screenPagePx(profile);
  const topPx =
    kind === "header"
      ? geometry.pageNumberTopPt * PX_PER_PT
      : Math.max(
          screen.top + (profile.linesPerPage + 1) * linePx,
          screen.height - geometry.pageNumberTopPt * PX_PER_PT - linePx,
        );
  const bandVertical =
    kind === "header"
      ? { top: topPx }
      : { bottom: Math.max(0, screen.height - topPx - linePx) };
  const doc = sheet.ownerDocument;
  const band = createBand(
    doc,
    kind === "header" ? "mn-header" : "mn-footer",
    marginLeftPt,
    widthPx,
    linePx,
    profile.typography,
    bandVertical,
  );
  appendSlot(band, resolved.left, "left");
  appendSlot(band, resolved.center, "center");
  appendSlot(band, resolved.right, "right");
  if (kind === "header") sheet.prepend(band);
  else sheet.append(band);
  if (resolved.rule) {
    const gapPx = RULE_GAP_PT * PX_PER_PT;
    const ruleVertical =
      kind === "header"
        ? { top: topPx + linePt * PX_PER_PT + gapPx }
        : { bottom: Math.max(0, screen.height - (topPx - gapPx) - 1) };
    sheet.append(
      createRule(
        doc,
        kind === "header" ? "mn-header-rule" : "mn-footer-rule",
        marginLeftPt,
        widthPx,
        ruleVertical,
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
