// Roman-numeral Book front matter and auto-generated Table of Contents layout for Engine 3 and standard manuscripts.
import type { BookMatterFields, TitlePageFields } from "@manent/schema";
import { romanNumeral } from "../../book-toc.ts";
import type { BookTocEntry } from "../../book-toc.ts";
import type { FrontPage } from "../../front-pages.ts";
import { cellPtOf } from "../../page-profile.ts";
import type { PageProfile } from "../../page-profile.ts";
import type { PositionedLine } from "../../positioned-lines.ts";
import { STYLE, UNITS_PER_LINE } from "../../units.ts";
import { wrap } from "../v1/wrap.ts";
import { measureSerifPt } from "./serif-font.ts";
import { wrapSerif } from "./wrap.ts";

export interface BookFrontPagesInput {
  readonly titlePage: Partial<TitlePageFields>;
  readonly matter?: Partial<BookMatterFields>;
  readonly profile: PageProfile;
  readonly toc?: readonly BookTocEntry[];
  readonly includeToc?: boolean;
}

function wrapLines(
  text: string,
  profile: PageProfile,
  widthCells: number,
  style: number,
): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (para.trim() === "") {
      out.push("");
      continue;
    }
    const typo = profile.typography;
    if (typo !== undefined) {
      const starts = wrapSerif(para, {
        widthPt: widthCells * typo.cellPt,
        fontSizePt: typo.fontSizePt,
        defaultStyle: style,
      });
      for (let i = 0; i < starts.length; i++) {
        out.push(
          para.slice(starts[i]!, starts[i + 1] ?? para.length).trimEnd(),
        );
      }
    } else {
      const starts = wrap(para, widthCells);
      for (let i = 0; i < starts.length; i++) {
        out.push(
          para.slice(starts[i]!, starts[i + 1] ?? para.length).trimEnd(),
        );
      }
    }
  }
  return out;
}

function measureWidthPt(
  text: string,
  style: number,
  profile: PageProfile,
): number {
  const typo = profile.typography;
  if (typo !== undefined) return measureSerifPt(text, style, typo.fontSizePt);
  return text.length * cellPtOf(profile);
}

function makeLine(
  text: string,
  yUnits: number,
  align: "left" | "center" | "right",
  indentCells: number,
  widthCells: number,
  style: number,
  profile: PageProfile,
): PositionedLine {
  const cellPt = cellPtOf(profile);
  const wPt = measureWidthPt(text, style, profile);
  const boxPt = widthCells * cellPt;
  const leftPt =
    align === "center"
      ? indentCells * cellPt + Math.max(0, (boxPt - wPt) / 2)
      : align === "right"
        ? indentCells * cellPt + Math.max(0, boxPt - wPt)
        : indentCells * cellPt;
  return {
    kind: "text",
    x: leftPt / cellPt,
    xPt: leftPt,
    y: yUnits,
    cells: wPt / cellPt,
    runs: [{ text, style }],
    blockId: null,
    blockLine: 0,
  };
}

/**
 * Lays out Roman-numeral book front matter (Title/Subtitle/Author, Copyright/ISBN,
 * Dedication, and optional Contents TOC) with exact Arabic body page numbers and
 * optional recto parity padding so Arabic Page 1 lands on a right-hand page.
 */
export function layoutBookFrontPages(input: BookFrontPagesInput): FrontPage[] {
  const { titlePage, matter, profile, toc = [], includeToc = false } = input;
  const pages: FrontPage[] = [];
  const cols = profile.columnCells;
  const maxLines = profile.linesPerPage;

  const pushPage = (
    lines: PositionedLine[],
    showRoman: boolean,
    blank?: true,
  ): void => {
    const label = romanNumeral(pages.length + 1);
    const numberText = showRoman && blank !== true ? label : null;
    const allLines = [...lines];
    if (numberText !== null) {
      allLines.push(
        makeLine(
          numberText,
          (maxLines + 1) * UNITS_PER_LINE,
          "center",
          0,
          cols,
          0,
          profile,
        ),
      );
    }
    pages.push({
      label,
      numberText,
      lines: allLines,
      fields: [],
      ...(blank === true ? { blank: true as const } : {}),
    });
  };

  // 1. Title page (recto i, blind folio)
  const title = (titlePage.title ?? "").trim();
  const subtitle = (matter?.subtitle ?? "").trim();
  const authors = (titlePage.authors ?? "").trim();
  if (title !== "" || subtitle !== "" || authors !== "") {
    const lines: PositionedLine[] = [];
    let row = Math.max(4, Math.floor(maxLines * 0.28));
    for (const text of wrapLines(title, profile, cols, STYLE.BOLD)) {
      if (text !== "")
        lines.push(
          makeLine(
            text,
            row * UNITS_PER_LINE,
            "center",
            0,
            cols,
            STYLE.BOLD,
            profile,
          ),
        );
      row += 1;
    }
    if (subtitle !== "") {
      row += 1;
      for (const text of wrapLines(subtitle, profile, cols, STYLE.ITALIC)) {
        if (text !== "")
          lines.push(
            makeLine(
              text,
              row * UNITS_PER_LINE,
              "center",
              0,
              cols,
              STYLE.ITALIC,
              profile,
            ),
          );
        row += 1;
      }
    }
    if (authors !== "") {
      row += 2;
      for (const text of wrapLines(authors, profile, cols, 0)) {
        if (text !== "")
          lines.push(
            makeLine(text, row * UNITS_PER_LINE, "center", 0, cols, 0, profile),
          );
        row += 1;
      }
    }
    pushPage(lines, false);
  }

  // 2. Copyright & ISBN page (verso ii, blind folio)
  const copyright = (matter?.copyright ?? "").trim();
  const isbn = (matter?.isbn ?? "").trim();
  if (copyright !== "" || isbn !== "") {
    const blocks: string[] = [];
    if (copyright !== "")
      blocks.push(...wrapLines(copyright, profile, cols, 0));
    if (isbn !== "") {
      if (blocks.length > 0) blocks.push("");
      blocks.push(...wrapLines(`ISBN ${isbn}`, profile, cols, 0));
    }
    const startRow = Math.max(2, maxLines - blocks.length - 1);
    const lines: PositionedLine[] = [];
    blocks.forEach((text, idx) => {
      if (text !== "")
        lines.push(
          makeLine(
            text,
            (startRow + idx) * UNITS_PER_LINE,
            "left",
            0,
            cols,
            0,
            profile,
          ),
        );
    });
    pushPage(lines, false);
  }

  // 3. Dedication page (recto when rectoChapters, blind folio)
  const dedication = (matter?.dedication ?? "").trim();
  if (dedication !== "") {
    if (profile.rectoChapters === true && pages.length % 2 === 1) {
      pushPage([], false, true);
    }
    const wrapped = wrapLines(
      dedication,
      profile,
      Math.max(20, cols - 6),
      STYLE.ITALIC,
    );
    const startRow = Math.max(4, Math.floor(maxLines * 0.32));
    const lines: PositionedLine[] = [];
    wrapped.forEach((text, idx) => {
      if (text !== "")
        lines.push(
          makeLine(
            text,
            (startRow + idx) * UNITS_PER_LINE,
            "center",
            3,
            Math.max(20, cols - 6),
            STYLE.ITALIC,
            profile,
          ),
        );
    });
    pushPage(lines, false);
  }

  // 4. Auto-generated Table of Contents (Roman folio)
  if (includeToc && toc.length > 0) {
    if (profile.rectoChapters === true && pages.length % 2 === 1) {
      pushPage([], false, true);
    }
    const cellPt = cellPtOf(profile);
    let currentLines: PositionedLine[] = [
      makeLine(
        "Contents",
        2 * UNITS_PER_LINE,
        "center",
        0,
        cols,
        STYLE.BOLD,
        profile,
      ),
    ];
    let row = 5;
    for (const entry of toc) {
      if (row >= maxLines - 1) {
        pushPage(currentLines, true);
        currentLines = [];
        row = 2;
      }
      const indent = entry.level === 2 ? 3 : 0;
      const pageStr = entry.pageLabel ?? "";
      const style = entry.level === 1 ? STYLE.BOLD : 0;
      const titleW = measureWidthPt(entry.title, style, profile);
      const pageW = measureWidthPt(pageStr, 0, profile);
      const lineY = row * UNITS_PER_LINE;
      currentLines.push(
        makeLine(
          entry.title,
          lineY,
          "left",
          indent,
          cols - indent,
          style,
          profile,
        ),
      );
      if (pageStr !== "") {
        currentLines.push(
          makeLine(pageStr, lineY, "right", 0, cols, 0, profile),
        );
        const startPt = indent * cellPt + titleW + cellPt;
        const endPt = cols * cellPt - pageW - cellPt;
        const dotUnit = measureWidthPt(" .", 0, profile);
        const dotCount =
          dotUnit > 0 ? Math.floor((endPt - startPt) / dotUnit) : 0;
        if (dotCount >= 2) {
          const dots = " .".repeat(dotCount);
          currentLines.push({
            kind: "text",
            x: startPt / cellPt,
            xPt: startPt,
            y: lineY,
            cells: (dotCount * dotUnit) / cellPt,
            runs: [{ text: dots, style: 0 }],
            blockId: null,
            blockLine: 0,
          });
        }
      }
      row += entry.level === 1 ? 2 : 1;
    }
    if (currentLines.length > 0) pushPage(currentLines, true);
  }

  // 5. Recto parity pad so Arabic Page 1 always lands on a right-hand sheet
  if (
    profile.rectoChapters === true &&
    pages.length > 0 &&
    pages.length % 2 === 1
  ) {
    pushPage([], false, true);
  }

  return pages;
}
