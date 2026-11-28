// OOXML Word (.docx) builders for book front matter, Roman/Arabic section breaks, Table of Contents and back matter.
import type { BookTocEntry } from "@manent/pagination";
import type { BookBackMatter, BookFrontMatter } from "../book/matter.ts";
import { hasFrontMatter } from "../book/matter.ts";
import { escapeXml } from "./parts.ts";

export type DocxPaper =
  "letter" | "a4" | "trade_5x8" | "trade_5_5x8_5" | "trade_6x9";

const PAPER_TWIPS: Readonly<
  Record<DocxPaper, { readonly w: number; readonly h: number }>
> = Object.freeze({
  letter: { w: 12240, h: 15840 },
  a4: { w: 11906, h: 16838 },
  trade_5x8: { w: 7200, h: 11520 },
  trade_5_5x8_5: { w: 7920, h: 12240 },
  trade_6x9: { w: 8640, h: 12960 },
});

export interface DocxPageLayout {
  readonly paperW: number;
  readonly paperH: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const toTwips = (pt: number): number => Math.round(pt * 20);

export function docxPageLayout(
  paper: DocxPaper = "letter",
  marginsPt?: {
    readonly inner: number;
    readonly outer: number;
    readonly top: number;
    readonly bottom: number;
  },
): DocxPageLayout {
  const size = PAPER_TWIPS[paper];
  return {
    paperW: size.w,
    paperH: size.h,
    left: marginsPt === undefined ? 1440 : toTwips(marginsPt.inner),
    right: marginsPt === undefined ? 1440 : toTwips(marginsPt.outer),
    top: marginsPt === undefined ? 1440 : toTwips(marginsPt.top),
    bottom: marginsPt === undefined ? 1440 : toTwips(marginsPt.bottom),
  };
}

function pageBreakXml(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function plainParagraphsXml(
  text: string,
  style: string,
  align?: string,
): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim());
  const out: string[] = [];
  for (const line of lines) {
    if (line === "") continue;
    const jc = align !== undefined ? `<w:jc w:val="${align}"/>` : "";
    out.push(
      `<w:p><w:pPr><w:pStyle w:val="${style}"/>${jc}<w:ind w:firstLine="0"/></w:pPr>` +
        `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
    );
  }
  return out.join("");
}

/** Emits a reusable `<w:sectPr>` block for page size, margins, optional section type and numbering format. */
export function sectionPropsXml(
  layout: DocxPageLayout,
  options?: {
    readonly breakType?: "nextPage" | "oddPage";
    readonly numFmt?: "lowerRoman" | "decimal";
    readonly numStart?: number;
    readonly titlePg?: boolean;
  },
): string {
  const breakTag =
    options?.breakType !== undefined
      ? `<w:type w:val="${options.breakType}"/>`
      : "";
  const pgNumTag =
    options?.numFmt !== undefined
      ? `<w:pgNumType w:fmt="${options.numFmt}"${options.numStart !== undefined ? ` w:start="${options.numStart}"` : ""}/>`
      : "";
  const titlePgTag = options?.titlePg === true ? "<w:titlePg/>" : "";
  return (
    `<w:sectPr>${breakTag}` +
    `<w:pgSz w:w="${layout.paperW}" w:h="${layout.paperH}"/>` +
    `<w:pgMar w:top="${layout.top}" w:right="${layout.right}" w:bottom="${layout.bottom}" w:left="${layout.left}" w:header="720" w:footer="720" w:gutter="0"/>` +
    `${pgNumTag}${titlePgTag}</w:sectPr>`
  );
}

/** Emits a Word section break paragraph before a chapter when right-hand chapter starts are enabled. */
export function oddChapterBreakParagraphXml(
  layout: DocxPageLayout,
  titlePg: boolean,
): string {
  return `<w:p><w:pPr>${sectionPropsXml(layout, { breakType: "oddPage", titlePg })}</w:pPr></w:p>`;
}

/** Renders the Table of Contents as a Word TOC SDT field with static fallback entries for immediate readability. */
export function tocSdtXml(
  entries: readonly BookTocEntry[],
  textWidthTwips: number,
): string {
  const tabPos = Math.max(2400, textWidthTwips);
  const heading =
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="1440" w:after="360"/><w:jc w:val="center"/></w:pPr>' +
    "<w:r><w:t>Contents</w:t></w:r></w:p>";
  const fieldBegin =
    '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>';
  const rows = entries.map((entry) => {
    const style = entry.level === 2 ? "TOC2" : "TOC1";
    const indent =
      entry.level === 2
        ? '<w:ind w:left="360" w:firstLine="0"/>'
        : '<w:ind w:firstLine="0"/>';
    return (
      `<w:p><w:pPr><w:pStyle w:val="${style}"/>${indent}` +
      `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tabPos}"/></w:tabs></w:pPr>` +
      `<w:r><w:t xml:space="preserve">${escapeXml(entry.title)}</w:t></w:r>` +
      `<w:r><w:tab/></w:r>` +
      `<w:r><w:t>${escapeXml(entry.pageLabel ?? "")}</w:t></w:r></w:p>`
    );
  });
  const fieldEnd = '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  return (
    '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr>' +
    `<w:sdtContent>${heading}${fieldBegin}${rows.join("")}${fieldEnd}</w:sdtContent></w:sdt>`
  );
}

/** Builds Title, Copyright/ISBN, Dedication and optional Table of Contents front-matter section XML. */
export function bookFrontMatterXml(options: {
  readonly front?: BookFrontMatter;
  readonly includeToc?: boolean;
  readonly tocEntries?: readonly BookTocEntry[];
  readonly rectoChapters?: boolean;
  readonly layout: DocxPageLayout;
}): string {
  const {
    front,
    includeToc = false,
    tocEntries = [],
    rectoChapters = false,
    layout,
  } = options;
  const hasFront = hasFrontMatter(front);
  const hasToc = includeToc && tocEntries.length > 0;
  if (!hasFront && !hasToc) return "";

  const parts: string[] = [];
  const pushPage = (xml: string): void => {
    if (xml === "") return;
    if (parts.length > 0) parts.push(pageBreakXml());
    parts.push(xml);
  };

  if (front !== undefined) {
    const title = (front.title ?? "").trim();
    const subtitle = (front.subtitle ?? "").trim();
    const author = (front.author ?? "").trim();
    if (title !== "" || subtitle !== "" || author !== "") {
      const blocks: string[] = [];
      if (title !== "") {
        blocks.push(
          '<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:before="2880" w:after="240"/><w:jc w:val="center"/></w:pPr>' +
            `<w:r><w:t xml:space="preserve">${escapeXml(title)}</w:t></w:r></w:p>`,
        );
      }
      if (subtitle !== "") {
        blocks.push(
          '<w:p><w:pPr><w:pStyle w:val="Subtitle"/><w:spacing w:before="0" w:after="480"/><w:jc w:val="center"/></w:pPr>' +
            `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(subtitle)}</w:t></w:r></w:p>`,
        );
      }
      if (author !== "") {
        blocks.push(
          '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="960" w:after="0"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>' +
            `<w:r><w:t xml:space="preserve">${escapeXml(author)}</w:t></w:r></w:p>`,
        );
      }
      pushPage(blocks.join(""));
    }

    const copyright = (front.copyright ?? "").trim();
    const isbn = (front.isbn ?? "").trim();
    if (copyright !== "" || isbn !== "") {
      const blocks: string[] = [];
      if (copyright !== "")
        blocks.push(plainParagraphsXml(copyright, "Normal", "left"));
      if (isbn !== "") {
        const label = /^isbn/i.test(isbn) ? isbn : `ISBN ${isbn}`;
        blocks.push(plainParagraphsXml(label, "Normal", "left"));
      }
      pushPage(blocks.join(""));
    }

    const dedication = (front.dedication ?? "").trim();
    if (dedication !== "") {
      const lines = dedication
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "");
      const blocks = lines.map(
        (line, i) =>
          `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="${i === 0 ? 2880 : 120}" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr>` +
          `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
      );
      pushPage(blocks.join(""));
    }
  }

  if (hasToc) {
    const textWidth = layout.paperW - layout.left - layout.right;
    pushPage(tocSdtXml(tocEntries, textWidth));
  }

  if (parts.length === 0) return "";
  // Close the Roman-numbered front-matter section before body page 1.
  const sect = sectionPropsXml(layout, {
    breakType: rectoChapters ? "oddPage" : "nextPage",
    numFmt: "lowerRoman",
    numStart: 1,
  });
  return `${parts.join("")}<w:p><w:pPr>${sect}</w:pPr></w:p>`;
}

/** Builds Acknowledgements and About-the-author back-matter pages after the manuscript body. */
export function bookBackMatterXml(back: BookBackMatter | undefined): string {
  if (back === undefined) return "";
  const parts: string[] = [];
  const ack = (back.acknowledgments ?? "").trim();
  if (ack !== "") {
    parts.push(
      pageBreakXml() +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>Acknowledgements</w:t></w:r></w:p>' +
        plainParagraphsXml(ack, "Normal"),
    );
  }
  const about = (back.aboutAuthor ?? "").trim();
  if (about !== "") {
    parts.push(
      pageBreakXml() +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>About the author</w:t></w:r></w:p>' +
        plainParagraphsXml(about, "Normal"),
    );
  }
  return parts.join("");
}
